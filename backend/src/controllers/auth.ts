import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import getDb from '../config/database.js';
import { logger } from '../utils/logger.js';

interface UserDocument {
  _id?: unknown;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: Date;
}

interface SessionDocument {
  _id?: unknown;
  token: string;
  userId: unknown;
  expiresAt: Date;
}

const SESSION_DAYS = 30;

function hashPassword(password: string, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string) {
  const [salt, storedHash] = stored.split(':');
  if (!salt || !storedHash) return false;
  const derived = scryptSync(password, salt, 64);
  const expected = Buffer.from(storedHash, 'hex');
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

function sessionExpiry() {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + SESSION_DAYS);
  return expiry;
}

async function createSession(userId: unknown) {
  const token = randomBytes(32).toString('hex');
  await getDb().collection<SessionDocument>('sessions').insertOne({ token: createHash('sha256').update(token).digest('hex'), userId, expiresAt: sessionExpiry() });
  return token;
}

function hashSessionToken(token: string) { return createHash('sha256').update(token).digest('hex'); }

export async function signup(req: Request, res: Response) {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!name || !email || !password) {
    res.status(400).json({ error: { code: 'INVALID_AUTH_INPUT', message: 'Name, email, and password are required.' } });
    return;
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    res.status(400).json({ error: { code: 'INVALID_EMAIL', message: 'Enter a valid email address.' } });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: { code: 'WEAK_PASSWORD', message: 'Password must be at least 8 characters.' } });
    return;
  }

  try {
    const db = getDb();
    const users = db.collection<UserDocument>('users');
    const existing = await users.findOne({ email });
    if (existing) {
      res.status(409).json({ error: { code: 'EMAIL_IN_USE', message: 'An account with this email already exists.' } });
      return;
    }
    const user = { email, name, passwordHash: hashPassword(password), createdAt: new Date() };
    const result = await users.insertOne(user);
    const token = await createSession(result.insertedId);
    res.status(201).json({ token, user: { id: result.insertedId.toString(), name, email } });
  } catch (error) {
    logger.error('POST /api/auth/signup error', error);
    res.status(500).json({ error: { code: 'AUTH_ERROR', message: 'Could not create your account.' } });
  }
}

export async function login(req: Request, res: Response) {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  try {
    const user = await getDb().collection<UserDocument>('users').findOne({ email });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' } });
      return;
    }
    const token = await createSession(user._id);
    res.json({ token, user: { id: String(user._id), name: user.name, email: user.email } });
  } catch (error) {
    logger.error('POST /api/auth/login error', error);
    res.status(500).json({ error: { code: 'AUTH_ERROR', message: 'Could not sign you in.' } });
  }
}

export async function me(req: Request, res: Response) {
  const user = (req as Request & { user?: { id: string; name: string; email: string } }).user;
  if (!user) {
    res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } });
    return;
  }
  res.json({ user });
}

export async function logout(req: Request, res: Response) {
  const header = req.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
  if (token) await getDb().collection<SessionDocument>('sessions').deleteOne({ token: hashSessionToken(token) });
  res.status(204).send();
}
