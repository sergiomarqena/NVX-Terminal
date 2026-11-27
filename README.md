# NORDVEX RSI Screener

A real-time, read-only crypto spot-market RSI dashboard.

## Runtime
- Node.js 20+
- Express static/API server and browser WebSocket gateway
- MEXC public Spot REST market data; no exchange API key or account connection
- Wilder RSI-14 on 1m, 5m, 15m, 1h, 4h, 1d and 1w candles; 12h, 2d and 3d are aggregated from 4h/daily candles
- Refresh cadence: 1m every 5s, 5m/15m every 15s, higher frames every 60s
- Default universe: top 80 USDT spot pairs by 24h quote volume. Set SCREENER_COINS to 20–100.
- External alerts are sent only when a candle closes across the configured RSI threshold

## Run
```bash
npm install
npm start
```

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
