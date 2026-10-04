import type { Request, Response } from 'express';
import { logger } from '../utils/logger.js';

const oauthStates = new Set<string>();

export function authorizationUrl(_req: Request, res: Response) {
  const clientId = process.env.UPSTOX_CLIENT_ID;
  const redirectUri = process.env.UPSTOX_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    res.status(503).json({ error: { code: 'UPSTOX_OAUTH_NOT_CONFIGURED', message: 'Upstox OAuth is not configured on the server.' } });
    return;
  }
  const state = crypto.randomUUID();
  oauthStates.add(state);
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', state });
  res.json({ url: `https://api.upstox.com/v2/login/authorization/dialog?${params.toString()}` });
}

export async function oauthCallback(req: Request, res: Response) {
  const { code, state } = req.query;
  const clientId = process.env.UPSTOX_CLIENT_ID;
  const clientSecret = process.env.UPSTOX_CLIENT_SECRET;
  const redirectUri = process.env.UPSTOX_REDIRECT_URI;
  if (typeof code !== 'string' || typeof state !== 'string' || !oauthStates.delete(state) || !clientId || !clientSecret || !redirectUri) {
    res.status(400).json({ error: { code: 'UPSTOX_OAUTH_INVALID', message: 'The Upstox authorization callback is incomplete.' } });
    return;
  }
  const body = new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' });
  const response = await fetch('https://api.upstox.com/v2/login/authorization/token', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!response.ok) {
    logger.error('Upstox OAuth token exchange failed', response.status);
    res.status(502).json({ error: { code: 'UPSTOX_OAUTH_FAILED', message: 'Could not complete Upstox authorization.' } });
    return;
  }
  const token = await response.json() as { access_token?: string };
  if (!token.access_token) {
    res.status(502).json({ error: { code: 'UPSTOX_OAUTH_TOKEN_MISSING', message: 'Upstox authorization completed without an access token.' } });
    return;
  }
  process.env.UPSTOX_ACCESS_TOKEN = token.access_token;
  res.json({ authorized: true, message: 'Upstox authorization completed. Market data is now available for this backend session.' });
}
