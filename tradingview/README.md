# NORDVEX Institutional Scalping Engine

## Components
- `tradingview/NORDVEX_Institutional_Scalping_Engine_v6.pine`: standalone Pine Script v6 overlay.
- `apps/web/src/ScalpingEngine.jsx`: native NORDVEX Charting signal workspace.
- `apps/api/src/server.js`: authenticated TradingView webhook receiver, PostgreSQL event ledger, and WebSocket broadcast at `/ws/scalping`.

## Signal model
Signals are evaluated on confirmed candle closes. Confirmed swing pivots use left/right confirmation bars; a pivot is not available until its right-side bars have closed. Structure bias uses closes through the last confirmed swing. Liquidity sweeps require a wick through the confirmed swing and a close back across it. Order blocks are the last opposing candle found before a qualifying structure break or displacement. Retests require price to trade into the zone and close back through its outer edge. A structure filter can require matching bullish/bearish bias.

Entry is the confirmed signal close. The initial stop is placed beyond the signal/zone extreme with an ATR buffer. Target distance is the configured reward/risk multiple. At +1R, optional break-even management moves the stop to entry. If TP and SL are both touched inside one OHLC candle, the engine resolves the stop first (conservative assumption).

## TradingView setup
1. Open the Pine file and paste it into TradingView Pine Editor.
2. Add it to the chart. Start with XAUUSD and a low timeframe; use the symbol's normal TradingView feed.
3. Create an alert and choose **Any alert() function call** for JSON webhook events, or the named BUY/SELL alert conditions for simple alerts.
4. To forward events to NORDVEX, configure the Railway API variable `TRADINGVIEW_WEBHOOK_TOKEN` with a long random secret. Use this URL in the TradingView alert:
   `https://nvx-api-production.up.railway.app/api/v1/scalping/alerts?token=YOUR_SECRET`
5. Keep the token private. Do not put exchange API keys in the Pine script or webhook URL.

## NORDVEX native data scope
The native engine currently consumes exchange spot candles for USDT crypto pairs from Binance, Bybit, or MEXC. XAUUSD, FX, and oil are intentionally not mapped to crypto candles. Native XAUUSD support requires a configured licensed broker/market-data feed and its symbol mapping. TradingView Pine can run on the XAUUSD feed available in the user's TradingView account.

## Persistence and notifications
NORDVEX API writes accepted webhook events to PostgreSQL table `nvx_scalping_events` when `DATABASE_URL` is available and broadcasts them to connected clients over `wss://<api-host>/ws/scalping`. Browser-side native signal history is stored in local browser storage. PostgreSQL stores webhook event history, not yet a cross-device canonical position ledger.

## Validation status
This is a first implementation of the documented rule set, not a reverse-engineered copy of a closed-source indicator. No profitability or accuracy percentage is claimed. Pine compilation in TradingView, historical backtesting, forward testing, exchange-by-exchange WebSocket verification, and Railway staging deployment are still required before production use.
