import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import * as datasetRoutes from './controllers/datasets.js';
import * as authRoutes from './controllers/auth.js';
import { requireAuth } from './middleware/auth.js';
import { connectDatabase } from './config/database.js';
import { listMarketQuotes, marketConfiguration, getMarketQuote, getMarketHistory, searchMarketInstruments } from './controllers/market.js';
import { UpstoxStreamManager } from './services/upstox-stream.js';
import * as upstoxRoutes from './controllers/upstox.js';
import { listNews } from './controllers/news.js';
import { logger } from './utils/logger.js';

const app = express();
const PORT = parseInt(process.env.PORT || '8000', 10);

app.use(helmet());
app.use(express.json({ limit: '256kb' }));
app.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false }));

app.use((_req: Request, res: Response, next: NextFunction) => {
  const configuredOrigins = (process.env.FRONTEND_ORIGIN || process.env.VITE_BASE_FRONTEND_ORIGIN || '').split(',').map((origin) => origin.trim()).filter(Boolean);
  const allowedOrigins = new Set(configuredOrigins.length > 0 ? configuredOrigins : ['http://localhost:5000', 'http://127.0.0.1:5000']);
  const requestOrigin = _req.header('origin');
  if (requestOrigin && allowedOrigins.has(requestOrigin)) {
    res.header('Access-Control-Allow-Origin', requestOrigin);
    res.header('Vary', 'Origin');
  }
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  if (_req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    market: process.env.UPSTOX_ACCESS_TOKEN && process.env.UPSTOX_INSTRUMENTS ? 'configured' : 'not_configured',
    database: 'runtime_checked_on_startup',
  });
});

app.post('/api/auth/signup', authRoutes.signup);
app.post('/api/auth/login', authRoutes.login);
app.get('/api/auth/me', requireAuth, authRoutes.me);
app.post('/api/auth/logout', authRoutes.logout);
app.get('/api/upstox/authorization-url', upstoxRoutes.authorizationUrl);
app.get('/api/upstox/callback', upstoxRoutes.oauthCallback);
app.get('/api/market/quotes', listMarketQuotes);
app.get('/api/market/configuration', marketConfiguration);
app.get('/api/market/quote', getMarketQuote);
app.get('/api/market/history', getMarketHistory);
app.get('/api/market/search', searchMarketInstruments);
app.get('/api/news', listNews);

app.get('/api/datasets', requireAuth, datasetRoutes.listDatasets);
app.post('/api/datasets', requireAuth, datasetRoutes.uploadDataset);
app.get('/api/datasets/:id', requireAuth, datasetRoutes.getDatasetAnalysis);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error', err);
  if (!res.headersSent) res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
});

async function start() {
  const server = app.listen(PORT, '0.0.0.0', () => {
    logger.info(`StockLens API listening on 0.0.0.0:${PORT}`);
    logger.info(`Market feed configuration: token=${Boolean(process.env.UPSTOX_ACCESS_TOKEN)} instruments=${Boolean(process.env.UPSTOX_INSTRUMENTS)}`);
  });
  new UpstoxStreamManager().attach(server);
  try { await connectDatabase(); logger.info('MongoDB connected'); }
  catch (error) { logger.error('MongoDB unavailable; market endpoints remain available', error); }
}

void start();
