import type { NextFunction, Request, Response } from 'express';
import getDb from '../config/database.js';
import { createHash } from 'node:crypto';
import { logger } from '../utils/logger.js';

interface SessionDocument {
  token: string;
  userId: unknown;
  expiresAt: Date;
}

interface UserDocument {
  _id?: unknown;
  email: string;
  name: string;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to access your data studio.' } });
    return;
  }

  try {
    const session = await getDb().collection<SessionDocument>('sessions').findOne({ token: createHash('sha256').update(token).digest('hex'), expiresAt: { $gt: new Date() } });
    if (!session) {
      res.status(401).json({ error: { code: 'SESSION_EXPIRED', message: 'Your session has expired. Please sign in again.' } });
      return;
    }
    const user = await getDb().collection<UserDocument>('users').findOne({ _id: session.userId } as any);
    if (!user) {
      res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Account not found.' } });
      return;
    }
    (req as Request & { user?: { id: string; name: string; email: string } }).user = { id: String(user._id), name: user.name, email: user.email };
    next();
  } catch (error) {
    logger.error('Authentication middleware error', error);
    res.status(500).json({ error: { code: 'AUTH_ERROR', message: 'Could not validate your session.' } });
  }
}
