# NORDVEX RSI Screener

A real-time, read-only crypto spot-market RSI dashboard.

## Runtime
- Node.js 20+
- Express static/API server and WebSocket gateway
- Bybit public Spot market data (no exchange API key or account connection)
- Wilder RSI-14, calculated on 1m, 5m, 15m, 1h, 4h, 1d and 1w candles; 12h, 2d and 3d are aggregated from 4h/daily candles.
- Live kline updates are provisional while a candle is open. External alerts are sent only after a candle closes.
- Default universe: top 80 USDT spot pairs by 24h turnover. Set SCREENER_COINS to 20–100.

## Run
```bash
npm install
npm start
```

## Optional alert environment variables
Telegram:
- TELEGRAM_BOT_TOKEN
- TELEGRAM_CHAT_ID

WhatsApp Cloud API:
- WHATSAPP_ACCESS_TOKEN
- WHATSAPP_PHONE_NUMBER_ID
- WHATSAPP_TO

Set secrets in Railway Variables, never commit them to GitHub or paste them into public chats. The app has test-alert actions for both channels.

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
- RSI threshold alerts are descriptive market-condition notifications, not buy/sell recommendations.
- Historical RSI illustration excludes fees, slippage, and execution latency; it is not a prediction.
