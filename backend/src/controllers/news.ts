import type { Request, Response } from 'express';
import { logger } from '../utils/logger.js';

interface NewsArticle {
  id: string;
  title: string;
  summary: string;
  url: string;
  imageUrl: string | null;
  source: string;
  publishedAt: string;
  sentiment: number | null;
  symbols: string[];
}

const cache = new Map<string, { expiresAt: number; articles: NewsArticle[] }>();
const CACHE_MS = 5 * 60 * 1000;

function numberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export async function listNews(req: Request, res: Response) {
  const token = process.env.MARKETAUX_API_TOKEN;
  if (!token) {
    res.status(503).json({ error: { code: 'NEWS_NOT_CONFIGURED', message: 'Market news is not configured on the server.' } });
    return;
  }
  const symbols = typeof req.query.symbols === 'string' ? req.query.symbols : '';
  const cacheKey = symbols || 'all';
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.json({ source: 'marketaux', articles: cached.articles });
    return;
  }
  const params = new URLSearchParams({ api_token: token, language: 'en', limit: '20', must_have_entities: 'true', group_similar: 'true', filter_entities: 'true' });
  if (symbols) params.set('symbols', symbols);
  try {
    const response = await fetch(`https://api.marketaux.com/v1/news/all?${params.toString()}`, { headers: { Accept: 'application/json' } });
    const payload = await response.json() as { data?: Array<Record<string, unknown>>; error?: unknown };
    if (!response.ok) {
      logger.error('[MarketLens] Marketaux news error', response.status, payload.error);
      res.status(response.status === 429 ? 429 : 502).json({ error: { code: response.status === 429 ? 'NEWS_RATE_LIMITED' : 'NEWS_PROVIDER_ERROR', message: response.status === 429 ? 'News provider rate limit reached. Try again later.' : 'Market news is temporarily unavailable.' } });
      return;
    }
    const articles = (payload.data ?? []).map((item) => ({
      id: String(item.uuid ?? item.url ?? ''),
      title: String(item.title ?? ''),
      summary: String(item.description ?? item.snippet ?? ''),
      url: String(item.url ?? ''),
      imageUrl: typeof item.image_url === 'string' ? item.image_url : null,
      source: String(item.source ?? item.source_domain ?? 'Market source'),
      publishedAt: String(item.published_at ?? ''),
      sentiment: numberOrNull(item.overall_sentiment_score),
      symbols: Array.isArray(item.entities) ? item.entities.map((entity) => String((entity as Record<string, unknown>).symbol ?? '')).filter(Boolean) : [],
    } satisfies NewsArticle));
    cache.set(cacheKey, { expiresAt: Date.now() + CACHE_MS, articles });
    res.json({ source: 'marketaux', articles });
  } catch (error) {
    logger.error('[MarketLens] Marketaux news request failed', error);
    res.status(502).json({ error: { code: 'NEWS_UNAVAILABLE', message: 'Market news is temporarily unavailable.' } });
  }
}
