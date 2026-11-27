import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "node:http";

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });
const PORT = Number(process.env.PORT || 3000);
const BASE = process.env.BINANCE_FUTURES_REST || "https://fapi.binance.com";
const UPSTREAM = process.env.BINANCE_FUTURES_WS || "wss://fstream.binance.com/ws/!ticker@arr";
const TIMEFRAMES = ["1m","5m","15m","1h","4h","12h","1d","2d","3d","1w"];
const RSI_PERIOD = 14;
let tickers = new Map();
let symbols = [];
let lastUniverseAt = 0;
let scanCache = new Map();
let upstream;
let reconnectTimer;

app.use(express.json({ limit: "32kb" }));
app.use(express.static("public", { maxAge: "1h" }));

function calcRsi(closes, period = RSI_PERIOD) {
  if (!Array.isArray(closes) || closes.length < period + 1) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gain += d; else loss -= d;
  }
  let avgGain = gain / period, avgLoss = loss / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}
async function getJson(url) {
  const r = await fetch(url, { headers: { "User-Agent": "NORDVEX-Screener/1.0" }, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`Market API ${r.status}`);
  return r.json();
}
async function refreshUniverse(force = false) {
  if (!force && Date.now() - lastUniverseAt < 60000 && symbols.length) return;
  const [info, stats] = await Promise.all([
    getJson(`${BASE}/fapi/v1/exchangeInfo`),
    getJson(`${BASE}/fapi/v1/ticker/24hr`)
  ]);
  const statMap = new Map(stats.map(x => [x.symbol, x]));
  symbols = info.symbols.filter(s => s.status === "TRADING" && s.contractType === "PERPETUAL" && s.quoteAsset === "USDT")
    .map(s => {
      const t = statMap.get(s.symbol) || {};
      return { symbol: s.symbol, base: s.baseAsset, quote: s.quoteAsset, price: Number(t.lastPrice || 0),
        change24h: Number(t.priceChangePercent || 0), volume24h: Number(t.quoteVolume || 0),
        high24h: Number(t.highPrice || 0), low24h: Number(t.lowPrice || 0) };
    }).sort((a,b) => b.volume24h - a.volume24h);
  lastUniverseAt = Date.now();
}
function broadcast(payload) {
  const msg = JSON.stringify(payload);
  for (const c of wss.clients) if (c.readyState === WebSocket.OPEN) c.send(msg);
}
function connectUpstream() {
  clearTimeout(reconnectTimer);
  upstream = new WebSocket(UPSTREAM);
  upstream.on("message", raw => {
    try {
      const data = JSON.parse(raw.toString());
      if (!Array.isArray(data)) return;
      const updates = [];
      for (const t of data) {
        if (!t.s?.endsWith("USDT")) continue;
        const row = { symbol:t.s, price:Number(t.c), change24h:Number(t.P), volume24h:Number(t.q), high24h:Number(t.h), low24h:Number(t.l), eventTime:Number(t.E || Date.now()) };
        tickers.set(t.s, row); updates.push(row);
      }
      if (updates.length) broadcast({ type:"tickers", data:updates, at:Date.now() });
    } catch {}
  });
  upstream.on("close", () => reconnectTimer = setTimeout(connectUpstream, 2500));
  upstream.on("error", () => upstream?.close());
}
async function pool(items, limit, fn) {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) { const i = index++; try { await fn(items[i], i); } catch {} }
  });
  await Promise.all(workers);
}
async function scanSymbol(symbol, tf) {
  const key = `${symbol}:${tf}`;
  const cached = scanCache.get(key);
  if (cached && Date.now() - cached.at < 90000) return cached.value;
  const url = new URL(`${BASE}/fapi/v1/klines`);
  url.searchParams.set("symbol", symbol); url.searchParams.set("interval", tf); url.searchParams.set("limit", "100");
  const rows = await getJson(url);
  const closes = rows.map(x => Number(x[4]));
  const rsi = calcRsi(closes);
  const value = { symbol, timeframe:tf, rsi, close:closes.at(-1), candleTime:Number(rows.at(-1)?.[6] || 0) };
  scanCache.set(key, { at:Date.now(), value });
  return value;
}
app.get("/api/health", (_req,res) => res.json({ ok:true, service:"NORDVEX RSI Screener", upstream:upstream?.readyState === WebSocket.OPEN ? "connected":"reconnecting", symbols:symbols.length, clients:wss.clients.size }));
app.get("/api/market/universe", async (_req,res) => {
  try { await refreshUniverse(); res.json({ symbols, updatedAt:lastUniverseAt, source:"Binance USD-M perpetuals" }); }
  catch(e) { res.status(503).json({ error:e.message }); }
});
app.get("/api/market/scan", async (req,res) => {
  try {
    await refreshUniverse();
    const tf = String(req.query.timeframes || "15m,1h,4h,1d").split(",").filter(x => TIMEFRAMES.includes(x));
    const limit = Math.max(10, Math.min(120, Number(req.query.limit || 60)));
    const chosen = symbols.slice(0,limit);
    const jobs = chosen.flatMap(s => tf.map(t => ({ symbol:s.symbol, tf:t })));
    const results = [];
    await pool(jobs, 5, async job => { const row = await scanSymbol(job.symbol, job.tf); if (row.rsi !== null) results.push(row); });
    res.json({ data:results, timeframes:tf, scannedSymbols:chosen.length, totalSymbols:symbols.length, updatedAt:Date.now(), source:"Binance USD-M klines", note:"RSI uses Wilder smoothing, period 14, closed and latest available candle." });
  } catch(e) { res.status(503).json({ error:e.message }); }
});
app.post("/api/alerts/test", async (req,res) => {
  const { channel } = req.body || {};
  try {
    if (channel === "telegram") {
      if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) return res.status(400).json({ error:"Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in Railway Variables first." });
      const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ chat_id:process.env.TELEGRAM_CHAT_ID, text:"🟢 NORDVEX RSI Screener test alert — connection successful." }) });
      const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.description || "Telegram rejected the message");
      return res.json({ ok:true, message:"Telegram test delivered." });
    }
    if (channel === "whatsapp") {
      const { WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TO } = process.env;
      if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_TO) return res.status(400).json({ error:"Set WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_TO in Railway Variables first." });
      const r = await fetch(`https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, { method:"POST", headers:{"content-type":"application/json",authorization:`Bearer ${WHATSAPP_ACCESS_TOKEN}`}, body:JSON.stringify({ messaging_product:"whatsapp", to:WHATSAPP_TO, type:"text", text:{ body:"🟢 NORDVEX RSI Screener test alert — connection successful." } }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error?.message || "WhatsApp rejected the message");
      return res.json({ ok:true, message:"WhatsApp test accepted." });
    }
    res.status(400).json({ error:"Choose telegram or whatsapp." });
  } catch(e) { res.status(502).json({ error:e.message }); }
});
server.on("upgrade", (req,socket,head) => {
  if (req.url !== "/ws") return socket.destroy();
  wss.handleUpgrade(req,socket,head,ws => wss.emit("connection",ws,req));
});
wss.on("connection", ws => {
  ws.send(JSON.stringify({ type:"status", connected:upstream?.readyState === WebSocket.OPEN, symbols:symbols.length, at:Date.now() }));
});
server.listen(PORT, async () => {
  console.log(`NORDVEX RSI Screener listening on ${PORT}`);
  connectUpstream();
  try { await refreshUniverse(true); } catch(e) { console.error("Initial universe load:",e.message); }
});
