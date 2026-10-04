import WebSocket, { WebSocketServer } from 'ws';
import protobuf from 'protobufjs';
import type { Server } from 'node:http';
import { logger } from '../utils/logger.js';

interface Instrument { key: string; symbol: string; name: string; exchange: 'NSE' | 'BSE' | 'INDEX'; }
interface StreamQuote { instrumentKey: string; symbol: string; name: string; exchange: Instrument['exchange']; price: number; previousClose: number; change: number; changePercent: number; volume: number; open: number; high: number; low: number; timestamp: string | null; }

const proto = `syntax = "proto3"; package feed;
message FeedResponse { enum Type { INITIAL_FEED = 0; LIVE_FEED = 1; MARKET_INFO = 2; } Type type = 1; map<string, Feed> feeds = 2; int64 currentTs = 3; }
message Feed { LTPC ltpc = 1; FullFeed fullFeed = 2; FirstLevelWithGreeks firstLevelWithGreeks = 3; }
message LTPC { double ltp = 1; int64 ltt = 2; double cp = 4; }
message FullFeed { MarketFullFeed marketFF = 1; IndexFullFeed indexFF = 2; }
message IndexFullFeed { LTPC ltpc = 1; MarketOHLC marketOHLC = 2; }
message MarketFullFeed { LTPC ltpc = 1; MarketOHLC marketOHLC = 4; double atp = 5; int64 vtt = 6; }
message MarketOHLC { repeated OHLC ohlc = 1; }
message OHLC { string interval = 1; double open = 2; double high = 3; double low = 4; double close = 5; int64 vol = 6; int64 ts = 7; }
message FirstLevelWithGreeks { LTPC ltpc = 1; }`;
const FeedResponse = protobuf.parse(proto).root.lookupType('feed.FeedResponse');

function instruments(): Instrument[] {
  const raw = process.env.UPSTOX_INSTRUMENTS;
  if (!raw) return [];
  const parsed = JSON.parse(raw) as Instrument[];
  return parsed.filter((item) => item.key && item.symbol && item.name);
}

function number(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }

export class UpstoxStreamManager {
  private readonly clients = new Set<WebSocket>();
  private upstream: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private readonly latest = new Map<string, StreamQuote>();

  attach(server: Server) {
    const wss = new WebSocketServer({ noServer: true });
    server.on('upgrade', (request, socket, head) => {
      if (new URL(request.url ?? '/', 'http://localhost').pathname !== '/ws/market') { socket.destroy(); return; }
      wss.handleUpgrade(request, socket, head, (client) => wss.emit('connection', client, request));
    });
    wss.on('connection', (client, request) => {
      const expectedOrigin = process.env.FRONTEND_ORIGIN;
      if (expectedOrigin && request.headers.origin !== expectedOrigin) { client.close(1008, 'Origin not allowed'); return; }
      this.clients.add(client);
      client.send(JSON.stringify({ type: 'status', status: this.upstream?.readyState === WebSocket.OPEN ? 'connected' : 'connecting' }));
      for (const quote of this.latest.values()) client.send(JSON.stringify({ type: 'quote', quote }));
      void this.ensureUpstream();
      client.on('close', () => { this.clients.delete(client); });
    });
  }

  private async ensureUpstream() {
    if (this.upstream && (this.upstream.readyState === WebSocket.OPEN || this.upstream.readyState === WebSocket.CONNECTING)) return;
    const token = process.env.UPSTOX_ACCESS_TOKEN;
    const keys = instruments().map((item) => item.key);
    if (!token || keys.length === 0) { this.broadcast({ type: 'status', status: 'unconfigured' }); return; }
    try {
      const response = await fetch('https://api.upstox.com/v3/feed/market-data-feed/authorize', { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error(`authorize ${response.status}`);
      const payload = await response.json() as { data?: { authorized_redirect_uri?: string } };
      const uri = payload.data?.authorized_redirect_uri;
      if (!uri) throw new Error('Upstox did not return an authorized websocket URL');
      const upstream = new WebSocket(uri, { followRedirects: true });
      this.upstream = upstream;
      upstream.binaryType = 'arraybuffer';
      upstream.on('open', () => {
        this.broadcast({ type: 'status', status: 'connected' });
        upstream.send(Buffer.from(JSON.stringify({ guid: crypto.randomUUID(), method: 'sub', data: { mode: 'full', instrumentKeys: keys } })));
      });
      upstream.on('message', (data) => this.handleMessage(data));
      upstream.on('error', (error) => logger.error('Upstox websocket error', error));
      upstream.on('close', () => { this.upstream = null; this.broadcast({ type: 'status', status: 'reconnecting' }); this.scheduleReconnect(); });
    } catch (error) {
      logger.error('Upstox stream setup failed', error);
      this.broadcast({ type: 'status', status: 'unavailable' });
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() { if (!this.reconnectTimer && this.clients.size > 0) this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; void this.ensureUpstream(); }, 5000); }

  private handleMessage(data: WebSocket.RawData) {
    try {
      const decoded = FeedResponse.decode(data instanceof Buffer ? data : Buffer.from(data as ArrayBuffer)) as any;
      for (const [key, feed] of Object.entries(decoded.feeds ?? {})) {
        const instrument = instruments().find((item) => item.key === key);
        if (!instrument) continue;
        const full = (feed as any).fullFeed?.marketFF ?? (feed as any).fullFeed?.indexFF;
        const ltpc = full?.ltpc ?? (feed as any).ltpc;
        if (!ltpc) continue;
        const candle = full?.marketOHLC?.ohlc?.find((item: any) => item.interval === '1d');
        const price = number(ltpc.ltp);
        const previousClose = number(ltpc.cp);
        const quote: StreamQuote = { instrumentKey: key, symbol: instrument.symbol, name: instrument.name, exchange: instrument.exchange, price, previousClose, change: price - previousClose, changePercent: previousClose ? ((price - previousClose) / previousClose) * 100 : 0, open: number(candle?.open), high: number(candle?.high), low: number(candle?.low), volume: number(candle?.vol ?? full?.vtt), timestamp: ltpc.ltt ? new Date(number(ltpc.ltt)).toISOString() : null };
        this.latest.set(key, quote);
        this.broadcast({ type: 'quote', quote });
      }
    } catch (error) { logger.error('Could not decode Upstox market feed message', error); }
  }

  private broadcast(message: unknown) { const payload = JSON.stringify(message); for (const client of this.clients) if (client.readyState === WebSocket.OPEN) client.send(payload); }
}
