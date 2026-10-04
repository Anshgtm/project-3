const BASE_URL = import.meta.env.VITE_BASE_BE_ENDPOINT as string;

export interface MarketQuote {
  instrumentKey: string;
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  logo: string;
  open: number;
  high: number;
  low: number;
  previousClose: number;
  volume: number;
  exchange: 'NSE' | 'BSE' | 'INDEX';
}

export interface HistoricalCandle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  openInterest: number;
}

export interface MarketInstrumentSearchResult {
  instrumentKey: string;
  symbol: string;
  name: string;
  exchange: string;
  segment: string;
  instrumentType: string;
}

export async function getMarketQuotes(): Promise<{ source: 'upstox'; asOf: string; quotes: MarketQuote[] }> {
  const response = await fetch(`${BASE_URL}/api/market/quotes`, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Market data is unavailable.');
  return response.json();
}

export async function getMarketConfiguration(): Promise<{ configured: boolean; reason: string | null; instrumentCount: number }> {
  const response = await fetch(`${BASE_URL}/api/market/configuration`, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Market configuration is unavailable.');
  return response.json();
}

export async function getUpstoxAuthorizationUrl(): Promise<string> {
  const response = await fetch(`${BASE_URL}/api/upstox/authorization-url`, { headers: { Accept: 'application/json' } });
  const body = await response.json() as { url?: string; error?: { message?: string } };
  if (!response.ok || !body.url) throw new Error(body.error?.message ?? 'Upstox authorization is not configured.');
  return body.url;
}

export async function getMarketQuote(instrumentKey: string): Promise<{ source: 'upstox'; quotes: MarketQuote[] }> {
  const response = await fetch(`${BASE_URL}/api/market/quote?instrument_key=${encodeURIComponent(instrumentKey)}`, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Market quote is unavailable.');
  return response.json();
}

export async function getMarketHistory(instrumentKey: string, options: { unit?: string; interval?: string; toDate?: string; fromDate?: string } = {}) {
  const params = new URLSearchParams({ instrument_key: instrumentKey, unit: options.unit ?? 'days', interval: options.interval ?? '1', to_date: options.toDate ?? new Date().toISOString().slice(0, 10) });
  if (options.fromDate) params.set('from_date', options.fromDate);
  const response = await fetch(`${BASE_URL}/api/market/history?${params.toString()}`, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Historical market data is unavailable.');
  return response.json() as Promise<{ source: 'upstox'; instrumentKey: string; unit: string; interval: string; candles: HistoricalCandle[] }>;
}

export async function searchMarketInstruments(query: string) {
  const response = await fetch(`${BASE_URL}/api/market/search?q=${encodeURIComponent(query)}`, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Instrument search is unavailable.');
  return response.json() as Promise<{ source: 'upstox'; instruments: MarketInstrumentSearchResult[]; meta: unknown }>;
}

export function marketWebSocketUrl() {
  const base = new URL(`${BASE_URL}/ws/market`);
  base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  return base.toString();
}
