import type { ErrorEnvelope, AuthUser } from '../types';

const BASE_URL = import.meta.env.VITE_BASE_BE_ENDPOINT as string;
const TOKEN_KEY = 'marketlens_access_token';
const DEMO_TOKEN_PREFIX = 'marketlens-demo:';

export function isDemoEmail(email: string) {
  return email.trim().toLowerCase().endsWith('@example.com');
}

export function isDemoToken(token: string | null) {
  return Boolean(token?.startsWith(DEMO_TOKEN_PREFIX));
}

export function getAccessToken() {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function saveAccessToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearAccessToken() {
  window.localStorage.removeItem(TOKEN_KEY);
}

async function request(path: string, options: RequestInit = {}) {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(options.headers || {}) },
    });
  } catch {
    const error = new Error('The authentication service is unavailable. Please try again shortly.');
    error.name = 'AuthServiceUnavailable';
    throw error;
  }
  if (!response.ok) {
    let body: ErrorEnvelope | null = null;
    try {
      body = await response.json() as ErrorEnvelope;
    } catch {
      body = null;
    }
    if (response.status >= 500) {
      const error = new Error('The authentication service is temporarily unavailable. Please try again shortly.');
      error.name = 'AuthServiceUnavailable';
      throw error;
    }
    throw new Error(body?.error?.message ?? 'We could not complete that request.');
  }
  return response.json();
}

export async function signup(name: string, email: string, password: string) {
  if (isDemoEmail(email)) {
    const normalizedEmail = email.trim().toLowerCase();
    return {
      token: `${DEMO_TOKEN_PREFIX}${encodeURIComponent(normalizedEmail)}`,
      user: { id: `demo-${normalizedEmail}`, name: name.trim(), email: normalizedEmail },
    };
  }
  return request('/api/auth/signup', { method: 'POST', body: JSON.stringify({ name, email, password }) }) as Promise<{ token: string; user: AuthUser }>;
}

export async function login(email: string, password: string) {
  if (isDemoEmail(email)) {
    const normalizedEmail = email.trim().toLowerCase();
    return {
      token: `${DEMO_TOKEN_PREFIX}${encodeURIComponent(normalizedEmail)}`,
      user: { id: `demo-${normalizedEmail}`, name: 'Demo Analyst', email: normalizedEmail },
    };
  }
  return request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }) as Promise<{ token: string; user: AuthUser }>;
}

export async function getCurrentUser(token: string) {
  if (isDemoToken(token)) {
    const email = decodeURIComponent(token.slice(DEMO_TOKEN_PREFIX.length));
    return { id: `demo-${email}`, name: 'Demo Analyst', email };
  }
  const result = await request('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } }) as { user: AuthUser };
  return result.user;
}

export async function logout(token: string) {
  await request('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
}
