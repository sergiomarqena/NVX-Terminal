import React, { useEffect, useRef, useState } from "react";
import { createChart, CandlestickSeries } from "lightweight-charts";

const intervals = new Set(["1m","5m","15m","1h","4h","1d","1w"]);
const supported = new Set(["BTCUSDT","ETHUSDT"]);

export default function LiveChart({ symbol, period }) {
  const host = useRef(null);
  const chartRef = useRef(null);
  const candleRef = useRef(null);
  const [status, setStatus] = useState("CONNECTING");
  const [lastPrice, setLastPrice] = useState("—");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!host.current) return;
    const chart = createChart(host.current, {
      autoSize: true,
      layout: { background: { color: "#0b131a" }, textColor: "#718691", fontFamily: "DM Mono, monospace" },
      grid: { vertLines: { color: "#17252e" }, horzLines: { color: "#17252e" } },
      rightPriceScale: { borderColor: "#24343e" },
      timeScale: { borderColor: "#24343e", timeVisible: true, secondsVisible: false },
      crosshair: { vertLine: { color: "#456b6b" }, horzLine: { color: "#456b6b" } },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#42bda5", downColor: "#d36f70",
      borderUpColor: "#42bda5", borderDownColor: "#d36f70",
      wickUpColor: "#42bda5", wickDownColor: "#d36f70",
    });
    chartRef.current = chart;
    candleRef.current = series;
    const resize = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      chart.applyOptions({ width, height });
    });
    resize.observe(host.current);
    return () => { resize.disconnect(); chart.remove(); chartRef.current = null; candleRef.current = null; };
  }, []);

  useEffect(() => {
    let socket;
    let cancelled = false;
    setError("");
    setLastPrice("—");
    if (!supported.has(symbol)) {
      setStatus("FEED NOT CONFIGURED");
      candleRef.current?.setData([]);
      return;
    }
    const interval = intervals.has(period.toLowerCase()) ? period.toLowerCase() : "1h";
    setStatus("LOADING HISTORY");
    const historyUrl = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=300`;
    fetch(historyUrl)
      .then(r => { if (!r.ok) throw new Error("Binance history unavailable"); return r.json(); })
      .then(rows => {
        if (cancelled) return;
        const data = rows.map(k => ({ time: Math.floor(k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4] }));
        candleRef.current?.setData(data);
        chartRef.current?.timeScale().fitContent();
        if (data.length) setLastPrice(data[data.length - 1].close.toLocaleString("en-US", { maximumFractionDigits: 4 }));
        setStatus("LIVE · BINANCE SPOT");
        socket = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@kline_${interval}`);
        socket.onmessage = event => {
          const payload = JSON.parse(event.data);
          const k = payload.k;
          candleRef.current?.update({ time: Math.floor(k.t / 1000), open: +k.o, high: +k.h, low: +k.l, close: +k.c });
          setLastPrice((+k.c).toLocaleString("en-US", { maximumFractionDigits: 4 }));
        };
        socket.onerror = () => setStatus("STREAM INTERRUPTED");
        socket.onclose = () => { if (!cancelled) setStatus("RECONNECT REQUIRED"); };
      })
      .catch(err => { if (!cancelled) { setStatus("DATA UNAVAILABLE"); setError(err.message); } });
    return () => { cancelled = true; socket?.close(); };
  }, [symbol, period]);

  return <div className="live-chart-wrap">
    <div className="live-chart-meta"><span><i className={status.startsWith("LIVE") ? "live-dot" : ""}/>{status}</span><b>{lastPrice}</b></div>
    {error && <div className="chart-error">{error}</div>}
    {!supported.has(symbol) && <div className="chart-overlay"><b>{symbol} feed not connected</b><span>Crypto spot candles are currently available for BTCUSDT and ETHUSDT via Binance public market data. Other markets require their own data provider.</span></div>}
    <div className="live-chart-canvas" ref={host}/>
  </div>;
}
