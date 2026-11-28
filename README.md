# NORDVEX RSI Screener

A real-time, read-only crypto spot-market RSI dashboard.

## Runtime
- Node.js 20+
- Express static/API server and browser WebSocket gateway
- MEXC public Spot REST market data; no exchange API key or account connection
- Wilder RSI-14 on 1m, 5m, 15m, 1h, 4h, 1d and 1w candles; 12h, 2d and 3d are aggregated from 4h/daily candles
- Universe: **every enabled MEXC USDT spot pair with 24h volume** (~1,300 coins), not just the top 100
- Open interest (USD) from MEXC USDT-margined futures: `holdVol × contractSize × fairPrice`, matched to spot by base coin. Coins without a perpetual show no OI. UI: **Market → OI Top 50/100/200**, **X axis → Open Interest**, OI column in the table
- Scatter background: procedural canvas "tunnel" animation (`public/bg.js`); respects `prefers-reduced-motion`, pauses when hidden
- How it stays inside MEXC's limits (300 weight / 10s per IP, 429s risk an IP ban):
  - one shared pacer for all spot REST calls (`MEXC_RATE`, default 15 weight/s) and a hard back-off on any 429/418
  - the 24h ticker (every 15s) updates each coin's latest candle, so RSI moves live for all coins and timeframes without re-downloading candles
  - candles are re-fetched only when a period closes; first load fills 4h → 1h → 1d → 15m → 1w → 5m → 1m (about 10 min for everything, the default 4H view is ready in ~2 min)
  - 1m/5m candles are kept for the most liquid coins only (`SCREENER_1M_COINS`=150, `SCREENER_5M_COINS`=500); longer frames cover all coins
- External alerts are sent only when a candle closes across the configured RSI threshold

## Run
```bash
npm install
npm start
```

## Screener controls
- **Scatter zoom / pan**: mouse wheel, pinch, double-click or the +/−/⤢ buttons zoom; drag to move. Zoom is semantic, so coin names appear as you zoom into a cluster. Tap/click a dot to open the coin. *Reset view* restores everything.
- **Sortable table**: click any column header (Price, 1h %, 24h %, OI and every RSI timeframe 1m → 1W). First click = highest first, second = lowest first, third = clear. Coins with no data for that timeframe always sort last (1m/5m only exist for the most liquid coins, see `SCREENER_1M_COINS` / `SCREENER_5M_COINS`).
- **Coin drawer chart**: candlesticks + volume + RSI(14) pane, live every 5s, intervals 1m–1W. Opens on the timeframe you are sorting by. Data comes from `/api/klines` (cached 4s, coalesced, per-IP limited, shares the MEXC request pacer). Chart library: TradingView Lightweight Charts (Apache-2.0, vendored in `public/vendor`).
- **New-coin sound**: the server re-reads the MEXC listing every `UNIVERSE_REFRESH_MS` (default 120000) and pushes a `newcoin` event when a symbol appears that it has not seen before; the page plays a chime and shows a toast. Toggle with the 🔊 button. Browsers only allow audio after the first tap on the page.

## Optional tuning variables
`SCREENER_MAX_COINS` (`all` by default; the old `SCREENER_COINS` cap is ignored), `SCREENER_MIN_VOLUME` (24h USDT volume floor, default 0), `MEXC_RATE`, `SCREENER_1M_COINS`, `SCREENER_5M_COINS`, `UNIVERSE_REFRESH_MS`, `MEXC_REST_URL`, `MEXC_FUTURES_URL`.

## Optional alert environment variables
Telegram: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

WhatsApp Cloud API: WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TO

Set secrets in Railway Variables. Never commit them to GitHub or paste them into public chats. Test-alert actions are included for both channels.

## Endpoints
- GET /api/health
- GET /api/config
- GET /api/market/universe
- GET /api/market/snapshot
- GET /api/market/scan
- GET /api/backtest?symbol=BTCUSDT
- WebSocket /ws

## Notes
- Market data is read-only. No order placement, wallet access, or account API keys.
- RSI threshold notifications describe indicator conditions; they are not buy/sell recommendations.
- Historical RSI illustration excludes fees and slippage. It is not a prediction.
- Watchlist and alert preferences are stored in the user's browser.
