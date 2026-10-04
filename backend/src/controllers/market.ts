import type { Request, Response } from 'express';
import { logger } from '../utils/logger.js';
import { positiveInteger, requiredQueryString, safeDate, validInstrumentKey } from '../utils/validation.js';

interface MarketInstrument {
  key: string;
  symbol: string;
  name: string;
  exchange: 'NSE' | 'BSE' | 'INDEX';
}

interface UpstoxQuote {
  instrumentKey: string;
  symbol: string;
  name: string;
  exchange: MarketInstrument['exchange'];
  price: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  previousClose: number;
  volume: number;
  averagePrice: number;
  timestamp: string | null;
}

function configuredInstruments(): MarketInstrument[] {
  const raw = process.env.UPSTOX_INSTRUMENTS;
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length > 500) throw new Error('UPSTOX_INSTRUMENTS must be an array of at most 500 instruments');
    const valid = parsed.filter((item): item is MarketInstrument => {
      if (!item || typeof item !== 'object') return false;
      const candidate = item as Record<string, unknown>;
      return typeof candidate.key === 'string' && /^[A-Z0-9_]+\|[^,|]+$/.test(candidate.key)
        && typeof candidate.symbol === 'string' && candidate.symbol.length <= 50
        && typeof candidate.name === 'string' && candidate.name.length <= 160
        && (candidate.exchange === 'NSE' || candidate.exchange === 'BSE' || candidate.exchange === 'INDEX');
    });
    if (valid.length !== parsed.length) throw new Error('UPSTOX_INSTRUMENTS contains invalid instruments');
    return valid;
  } catch {
    throw new Error('UPSTOX_INSTRUMENTS must be valid JSON');
  }
}

function numberOrZero(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function upstoxHeaders() {
  return { Accept: 'application/json', Authorization: `Bearer ${process.env.UPSTOX_ACCESS_TOKEN}` };
}

function ensureAccessToken(res: Response) {
  if (!process.env.UPSTOX_ACCESS_TOKEN) {
    res.status(503).json({ error: { code: 'UPSTOX_NOT_CONFIGURED', message: 'Upstox market data is not configured on the server.' } });
    return false;
  }
  return true;
}

function providerError(status: number) {
  return status === 401 ? { code: 'UPSTOX_TOKEN_EXPIRED', message: 'The Upstox access token has expired.' } : { code: 'UPSTOX_API_ERROR', message: 'Upstox market data is temporarily unavailable.' };
}

function mapQuote(instrument: MarketInstrument, raw: Record<string, unknown>): UpstoxQuote {
  const previousClose = numberOrZero(raw.prev_close_price);
  const price = numberOrZero(raw.last_price);
  const change = numberOrZero(raw.net_change) || price - previousClose;
  return {
    instrumentKey: instrument.key,
    symbol: instrument.symbol,
    name: instrument.name,
    exchange: instrument.exchange,
    price,
    change,
    changePercent: previousClose ? (change / previousClose) * 100 : 0,
    open: numberOrZero((raw.ohlc as Record<string, unknown> | undefined)?.open),
    high: numberOrZero((raw.ohlc as Record<string, unknown> | undefined)?.high),
    low: numberOrZero((raw.ohlc as Record<string, unknown> | undefined)?.low),
    previousClose,
    volume: numberOrZero(raw.volume || (raw.ohlc as Record<string, unknown> | undefined)?.volume),
    averagePrice: numberOrZero(raw.average_price),
    timestamp: typeof raw.timestamp === 'string' ? raw.timestamp : null,
  };
}

export async function listMarketQuotes(_req: Request, res: Response) {
  const accessToken = process.env.UPSTOX_ACCESS_TOKEN;
  let instruments: MarketInstrument[];
  try {
    instruments = configuredInstruments();
  } catch (error) {
    res.status(500).json({ error: { code: 'UPSTOX_CONFIG_ERROR', message: error instanceof Error ? error.message : 'Invalid Upstox configuration.' } });
    return;
  }

  if (!accessToken || instruments.length === 0) {
    res.status(503).json({ error: { code: 'UPSTOX_NOT_CONFIGURED', message: 'Upstox market data is not configured on the server.' } });
    return;
  }

  try {
    const query = instruments.map((instrument) => instrument.key).join(',');
    const response = await fetch(`https://api.upstox.com/v3/market-quote/quotes?instrument_key=${encodeURIComponent(query)}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const body = await response.text();
      logger.error('Upstox quote request failed', response.status, body.slice(0, 300));
      res.status(response.status === 401 ? 401 : 502).json({ error: { code: response.status === 401 ? 'UPSTOX_TOKEN_EXPIRED' : 'UPSTOX_API_ERROR', message: response.status === 401 ? 'The Upstox access token has expired.' : 'Upstox market data is temporarily unavailable.' } });
      return;
    }
    const payload = await response.json() as { status?: string; data?: Record<string, Record<string, unknown>> };
    const quotes = instruments.flatMap((instrument) => {
      const key = instrument.key.replace('|', ':');
      const raw = payload.data?.[key];
      return raw ? [mapQuote(instrument, raw)] : [];
    });
    res.json({ source: 'upstox', asOf: new Date().toISOString(), quotes });
  } catch (error) {
    logger.error('Upstox market data request failed', error);
    res.status(502).json({ error: { code: 'UPSTOX_UNAVAILABLE', message: 'Upstox market data is temporarily unavailable.' } });
  }
}

export function marketConfiguration(_req: Request, res: Response) {
  const hasToken = Boolean(process.env.UPSTOX_ACCESS_TOKEN);
  let instrumentCount = 0;
  try {
    instrumentCount = configuredInstruments().length;
  } catch {
    res.json({ configured: false, reason: 'invalid_instrument_configuration', instrumentCount: 0 });
    return;
  }
  res.json({
    configured: hasToken && instrumentCount > 0,
    reason: hasToken ? (instrumentCount > 0 ? null : 'missing_instruments') : 'missing_access_token',
    instrumentCount,
  });
}

export async function getMarketQuote(req: Request, res: Response) {
  if (!ensureAccessToken(res)) return;
  const instrumentKey = validInstrumentKey(req.query.instrument_key, 'instrument_key', res);
  if (!instrumentKey) {
    return;
  }
  try {
    const response = await fetch(`https://api.upstox.com/v3/market-quote/quotes?instrument_key=${encodeURIComponent(instrumentKey)}`, { headers: upstoxHeaders() });
    if (!response.ok) { res.status(response.status === 401 ? 401 : 502).json({ error: providerError(response.status) }); return; }
    const payload = await response.json() as { data?: Record<string, Record<string, unknown>> };
    const instruments = configuredInstruments();
    const requestedKeys = new Set(instrumentKey.split(','));
    if ([...requestedKeys].some((key) => !instruments.some((item) => item.key === key))) {
      res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'instrument_key contains an unconfigured instrument.' } });
      return;
    }
    const quotes = instruments.filter((item) => requestedKeys.has(item.key)).flatMap((instrument) => {
      const raw = payload.data?.[instrument.key.replace('|', ':')];
      return raw ? [mapQuote(instrument, raw)] : [];
    });
    res.json({ source: 'upstox', quotes });
  } catch { res.status(502).json({ error: { code: 'UPSTOX_UNAVAILABLE', message: 'Upstox market data is temporarily unavailable.' } }); }
}

export async function getMarketHistory(req: Request, res: Response) {
  if (!ensureAccessToken(res)) return;
  const instrumentKey = validInstrumentKey(req.query.instrument_key, 'instrument_key', res);
  const unit = requiredQueryString(req.query.unit ?? 'days', 'unit', res, 10);
  const interval = requiredQueryString(req.query.interval ?? '1', 'interval', res, 4);
  const toDate = safeDate(req.query.to_date ?? new Date().toISOString().slice(0, 10), 'to_date', res);
  const fromDate = req.query.from_date === undefined ? '' : safeDate(req.query.from_date, 'from_date', res);
  if (!instrumentKey || !unit || !interval || !toDate || fromDate === null) return;
  if (!['minutes', 'hours', 'days', 'weeks', 'months'].includes(unit)) { res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'unit is invalid.' } }); return; }
  if ((unit === 'days' || unit === 'weeks' || unit === 'months') && interval !== '1') { res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'interval must be 1 for days, weeks, or months.' } }); return; }
  const path = [instrumentKey, unit, interval, toDate, fromDate].filter(Boolean).map(encodeURIComponent).join('/');
  try {
    const response = await fetch(`https://api.upstox.com/v3/historical-candle/${path}`, { headers: upstoxHeaders() });
    if (!response.ok) { res.status(response.status === 401 ? 401 : 502).json({ error: providerError(response.status) }); return; }
    const payload = await response.json() as { data?: { candles?: unknown[][] } };
    const candles = (payload.data?.candles ?? []).map((candle) => ({ timestamp: String(candle[0]), open: numberOrZero(candle[1]), high: numberOrZero(candle[2]), low: numberOrZero(candle[3]), close: numberOrZero(candle[4]), volume: numberOrZero(candle[5]), openInterest: numberOrZero(candle[6]) }));
    res.json({ source: 'upstox', instrumentKey, unit, interval, candles });
  } catch { res.status(502).json({ error: { code: 'UPSTOX_UNAVAILABLE', message: 'Upstox historical data is temporarily unavailable.' } }); }
}

export async function searchMarketInstruments(req: Request, res: Response) {
  if (!ensureAccessToken(res)) return;
  const query = requiredQueryString(req.query.q, 'q', res, 50);
  if (!query) return;
  const exchanges = requiredQueryString(req.query.exchanges ?? 'NSE,BSE', 'exchanges', res, 40);
  const segments = requiredQueryString(req.query.segments ?? 'EQ,INDEX', 'segments', res, 40);
  const page = positiveInteger(req.query.page, 'page', res, 1);
  const records = positiveInteger(req.query.records, 'records', res, 30);
  if (!exchanges || !segments || page === null || records === null || records > 30) { if (records !== null && records > 30) res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'records cannot exceed 30.' } }); return; }
  const params = new URLSearchParams({ query, exchanges, segments, page_number: String(page), records: String(records) });
  try {
    const response = await fetch(`https://api.upstox.com/v2/instruments/search?${params.toString()}`, { headers: upstoxHeaders() });
    if (!response.ok) { res.status(response.status === 401 ? 401 : 502).json({ error: providerError(response.status) }); return; }
    const payload = await response.json() as { data?: Array<Record<string, unknown>>; meta_data?: unknown };
    const instruments = (payload.data ?? []).map((item) => ({ instrumentKey: String(item.instrument_key ?? ''), symbol: String(item.trading_symbol ?? ''), name: String(item.name ?? item.short_name ?? ''), exchange: String(item.exchange ?? ''), segment: String(item.segment ?? ''), instrumentType: String(item.instrument_type ?? '') }));
    res.json({ source: 'upstox', instruments, meta: payload.meta_data ?? null });
  } catch { res.status(502).json({ error: { code: 'UPSTOX_UNAVAILABLE', message: 'Upstox instrument search is temporarily unavailable.' } }); }
}
