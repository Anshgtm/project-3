import type { Response } from 'express';

export function requiredQueryString(value: unknown, field: string, res: Response, maxLength = 160) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    res.status(400).json({ error: { code: 'INVALID_INPUT', message: `${field} is required.` } });
    return null;
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    res.status(400).json({ error: { code: 'INVALID_INPUT', message: `${field} is too long.` } });
    return null;
  }
  return normalized;
}

export function safeDate(value: unknown, field: string, res: Response) {
  const date = requiredQueryString(value, field, res, 10);
  if (!date) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    res.status(400).json({ error: { code: 'INVALID_INPUT', message: `${field} must use YYYY-MM-DD format.` } });
    return null;
  }
  return date;
}

export function positiveInteger(value: unknown, field: string, res: Response, fallback?: number) {
  if (value === undefined && fallback !== undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    res.status(400).json({ error: { code: 'INVALID_INPUT', message: `${field} must be a positive integer.` } });
    return null;
  }
  return parsed;
}

export function validInstrumentKey(value: unknown, field: string, res: Response) {
  const key = requiredQueryString(value, field, res, 200);
  if (!key) return null;
  const valid = key.split(',').every((item) => /^[A-Z0-9_]+\|[^,|]+$/.test(item));
  if (!valid) {
    res.status(400).json({ error: { code: 'INVALID_INPUT', message: `${field} contains an invalid instrument key.` } });
    return null;
  }
  return key;
}
