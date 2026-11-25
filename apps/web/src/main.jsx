import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity, ArrowDownRight, ArrowUpRight, BarChart3, Bell, CandlestickChart,
  ChevronDown, CircleDot, Clock3, Command, Compass, Gauge, LayoutDashboard,
  Layers3, Menu, Plus, RadioTower, Search, Settings2, ShieldCheck, SlidersHorizontal,
  Sparkles, Star, Waves, X
} from "lucide-react";
import "./style.css";
import LiveChart from "./LiveChart.jsx";

const navigation = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Charting", icon: CandlestickChart },
  { label: "Screener", icon: SlidersHorizontal },
  { label: "Order Flow", icon: Waves },
  { label: "Market Radar", icon: RadioTower },
  { label: "Journal", icon: Activity },
];
const watchlist = [
  { symbol: "BTCUSDT", name: "Bitcoin", market: "CRYPTO", price: "—", change: "—" },
  { symbol: "ETHUSDT", name: "Ethereum", market: "CRYPTO", price: "—", change: "—" },
  { symbol: "XAUUSD", name: "Gold Spot", market: "METALS", price: "—", change: "—" },
  { symbol: "EURUSD", name: "Euro / US Dollar", market: "FOREX", price: "—", change: "—" },
  { symbol: "USOIL", name: "WTI Crude Oil", market: "ENERGY", price: "—", change: "—" },
];
const providers = ["BINANCE", "BYBIT", "MEXC", "COINGECKO", "COINMARKETCAP"];

function App() {
  const [active, setActive] = useState("Overview");
  const [selected, setSelected] = useState("BTCUSDT");
  const [period, setPeriod] = useState("1H");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [journalText, setJournalText] = useState(() => localStorage.getItem("nvx-journal-draft") || "");
  const [journalSaved, setJournalSaved] = useState(false);
  const [liveQuotes, setLiveQuotes] = useState({});
  const [quoteStatus, setQuoteStatus] = useState("CONNECTING");
  const [providerInfo, setProviderInfo] = useState([]);
  const [screenerExchange,setScreenerExchange] = useState("binance");
  const [screenerRows,setScreenerRows] = useState([]);
  const [screenerStatus,setScreenerStatus] = useState("CONNECTING");
  const [book,setBook] = useState(null);
  const [bookStatus,setBookStatus] = useState("CONNECTING");
  const [bookExchange,setBookExchange] = useState("binance");

  useEffect(() => { localStorage.setItem("nvx-journal-draft", journalText); }, [journalText]);
  useEffect(() => {
    let active = true;
    fetch("https://nvx-api-production.up.railway.app/api/v1/providers")
      .then(r => { if(!r.ok) throw new Error("Provider status unavailable"); return r.json(); })
      .then(data => { if(active) setProviderInfo(data.providers || []); })
      .catch(() => { if(active) setProviderInfo([]); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let socket;
    let retry;
    let closed = false;
    const connect = () => {
      socket = new WebSocket("wss://stream.binance.com:9443/stream?streams=btcusdt@ticker/ethusdt@ticker");
      socket.onopen = () => setQuoteStatus("LIVE");
      socket.onmessage = event => {
        const payload = JSON.parse(event.data).data;
        const symbol = payload.s;
        setLiveQuotes(prev => ({...prev,[symbol]:{price:Number(payload.c),change:Number(payload.P)}}));
      };
      socket.onerror = () => setQuoteStatus("INTERRUPTED");
      socket.onclose = () => { if(!closed){setQuoteStatus("RECONNECTING");retry=setTimeout(connect,2500);} };
    };
    connect();
    return () => {closed=true;clearTimeout(retry);socket?.close();};
  }, []);
  useEffect(() => {
    let active=true, timer;
    const load=async()=>{
      try{
        const r=await fetch("https://nvx-api-production.up.railway.app/api/v1/market/tickers?exchange="+screenerExchange+"&limit=100");
        const d=await r.json();
        if(!r.ok)throw new Error(d.detail||d.error||"Ticker request failed");
        if(active){setScreenerRows(d.tickers||[]);setScreenerStatus("LIVE · "+screenerExchange.toUpperCase());}
      }catch(e){if(active)setScreenerStatus("UNAVAILABLE · "+e.message);}
    };
    load();timer=setInterval(load,10000);
    return()=>{active=false;clearInterval(timer);};
  },[screenerExchange]);
  useEffect(() => {
    let active=true,timer;
    const load=async()=>{
      try{
        const r=await fetch("https://nvx-api-production.up.railway.app/api/v1/market/orderbook?exchange="+bookExchange+"&symbol="+selected+"&limit=25");
        const d=await r.json();
        if(!r.ok)throw new Error(d.detail||d.error||"Order book request failed");
        if(active){setBook(d);setBookStatus("LIVE · "+bookExchange.toUpperCase());}
      }catch(e){if(active){setBook(null);setBookStatus("UNAVAILABLE · "+e.message);}}
    };
    if(/USDT$/.test(selected)){load();timer=setInterval(load,3000);}else{setBook(null);setBookStatus("CRYPTO PAIR REQUIRED");}
    return()=>{active=false;clearInterval(timer);};
  },[selected,bookExchange]);
  const quote = symbol => liveQuotes[symbol] || null;
  const fmtPrice = value => value == null ? "—" : value.toLocaleString("en-US",{maximumFractionDigits:value>100?2:4});

  const filtered = useMemo(() => watchlist.filter(x => (x.symbol + x.name).toLowerCase().includes(search.toLowerCase())), [search]);
  const current = watchlist.find(x => x.symbol === selected) || watchlist[0];

  return <div className="app-shell">
    <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
      <div className="brand-row">
        <div className="brand-mark"><span>N</span><i /></div>
        <div className="brand-copy"><strong>NORDVEX</strong><small>CHARTING TERMINAL</small></div>
        <button className="icon-button close-menu" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X size={17}/></button>
      </div>
      <div className="workspace-switch"><div className="workspace-icon"><Command size={15}/></div><div><b>MAIN WORKSPACE</b><small>Personal terminal</small></div><ChevronDown size={14}/></div>
      <div className="nav-caption">WORKSPACE</div>
      <nav className="nav-list">{navigation.map(({label,icon:Icon}) => <button key={label} className={`nav-item ${active===label ? "selected" : ""}`} onClick={() => {setActive(label);setMobileOpen(false);}}><Icon size={17}/><span>{label}</span>{label==="Order Flow" && <i className="nav-indicator"/>}</button>)}</nav>
      <div className="nav-caption markets-caption">MARKETS</div>
      <div className="market-links"><button onClick={() => setSelected("BTCUSDT")}><span className="market-bullet crypto"/>Crypto</button><button onClick={() => setSelected("XAUUSD")}><span className="market-bullet metals"/>Metals</button><button onClick={() => setSelected("EURUSD")}><span className="market-bullet forex"/>Forex</button><button onClick={() => setSelected("USOIL")}><span className="market-bullet energy"/>Energy</button></div>
      <div className="sidebar-bottom"><div className="secure-icon"><ShieldCheck size={15}/></div><div><b>PRIVATE WORKSPACE</b><small>Encrypted configuration</small></div><span className="secure-dot"/></div>
    </aside>

    <main className="main-area">
      <header className="topbar">
        <div className="topbar-left"><button className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu size={19}/></button><div className="breadcrumb">NORDVEX <span>/</span> {active.toUpperCase()}</div></div>
        <div className="topbar-actions">
          <div className={`connection-pill ${quoteStatus==="LIVE"?"connection-live":""}`}><i/> {quoteStatus==="LIVE"?"CRYPTO FEED LIVE":quoteStatus==="INTERRUPTED"?"FEED INTERRUPTED":"CONNECTING TO FEEDS"}</div>
          <button className="icon-button notification" aria-label="Notifications"><Bell size={17}/><i/></button>
          <div className="avatar">NV</div>
        </div>
      </header>

      <div className="content">
        <section className="page-heading">
          <div><div className="eyebrow"><span className="eyebrow-line"/> MARKET INTELLIGENCE PLATFORM</div><h1>{active === "Overview" ? <>Market <em>overview</em></> : <>{active} <em>workspace</em></>}</h1><p>One workspace for multi-market analysis, execution context and research.</p></div>
          <div className="heading-meta"><span className="meta-label">SESSION</span><b><span className="session-dot"/> READY</b><small>Provider sync pending</small></div>
        </section>

        <section className="ticker-strip">
          {["BTCUSDT","ETHUSDT","XAUUSD","EURUSD","USOIL"].map((symbol,i)=><button key={symbol} className={selected===symbol?"ticker active-ticker": "ticker"} onClick={()=>setSelected(symbol)}><span>{symbol}</span><b>{fmtPrice(quote(symbol)?.price)}</b><small className="ticker-muted">{quote(symbol)?`${quote(symbol).change>=0?"+":""}${quote(symbol).change.toFixed(2)}% · LIVE`:"Awaiting feed"}</small></button>)}
        </section>

        {active !== "Overview" && <section className="module-workspace">
          {active === "Charting" && <div className="card module-chart-card">
            <div className="card-heading"><div><div className="section-kicker">ADVANCED CHART WORKSPACE</div><h2>{current.symbol} · {current.name}</h2></div><span className="subtle-tag">BINANCE SPOT FEED</span></div>
            <div className="chart-toolbar"><div className="timeframes">{["1m","5m","15m","1H","4H","1D","1W"].map(t=><button key={t} className={period===t?"time-active":""} onClick={()=>setPeriod(t)}>{t}</button>)}</div><div className="chart-tools"><span>Crosshair enabled</span><span>Auto scale</span></div></div>
            <LiveChart symbol={selected} period={period}/>
            <div className="module-note"><b>Chart tools roadmap</b><span>Drawing tools, indicators, volume, multi-chart layouts and saved templates are the next chart-engine layer.</span></div>
          </div>}
          {active === "Screener" && <div className="card module-card">
            <div className="card-heading"><div><div className="section-kicker">LIVE MARKET SCANNER</div><h2>Top USDT markets by quote volume</h2></div><span className="subtle-tag">{screenerStatus}</span></div>
            <div className="screener-controls"><label>EXCHANGE <select value={screenerExchange} onChange={e=>setScreenerExchange(e.target.value)}><option value="binance">BINANCE</option><option value="bybit">BYBIT</option><option value="mexc">MEXC</option></select></label><span>Refreshes every 10 seconds · exchange-native 24h statistics</span></div>
            <div className="module-table live-screener-table"><div className="module-table-head"><span>SYMBOL</span><span>LAST PRICE</span><span>24H CHANGE</span><span>QUOTE VOL.</span><span>MARKET</span></div>
            {screenerRows.map(x=><button className="module-table-row" key={x.symbol} onClick={()=>{setSelected(x.symbol);setActive("Charting");}}><b>{x.symbol}</b><span>{Number(x.lastPrice).toLocaleString("en-US",{maximumFractionDigits:6})}</span><span className={x.priceChangePercent>=0?"quote-up":"quote-down"}>{x.priceChangePercent>=0?"+":""}{x.priceChangePercent.toFixed(2)}%</span><span>{(x.quoteVolume/1e6).toFixed(2)}M</span><em>SPOT</em></button>)}
            {screenerRows.length===0&&<div className="screener-empty">Waiting for exchange ticker data…</div>}</div>
            <div className="module-note"><b>Data integrity</b><span>Volume and price change are from the selected exchange only. No cross-exchange volume blending or generated signals.</span></div>
          </div>}
          {active === "Order Flow" && <div className="card module-card orderbook-card">
            <div className="card-heading"><div><div className="section-kicker">LIVE EXCHANGE DEPTH</div><h2>{selected} · Order Book</h2></div><span className="subtle-tag">{bookStatus}</span></div>
            <div className="screener-controls"><label>EXCHANGE <select value={bookExchange} onChange={e=>setBookExchange(e.target.value)}><option value="binance">BINANCE</option><option value="bybit">BYBIT</option><option value="mexc">MEXC</option></select></label><span>Refreshes every 3 seconds · top 25 levels</span></div>
            {book?<><div className="book-summary"><div><small>BID DEPTH</small><b>{book.bids.reduce((n,x)=>n+x.price*x.quantity,0).toLocaleString("en-US",{maximumFractionDigits:0})}</b></div><div><small>ASK DEPTH</small><b>{book.asks.reduce((n,x)=>n+x.price*x.quantity,0).toLocaleString("en-US",{maximumFractionDigits:0})}</b></div><div><small>IMBALANCE</small><b>{(book.bids.reduce((n,x)=>n+x.price*x.quantity,0)/(book.asks.reduce((n,x)=>n+x.price*x.quantity,0)||1)).toFixed(2)}×</b></div></div>
            <div className="book-columns"><div><h3>BIDS · BUY SIDE</h3>{book.bids.slice(0,15).map((x,i)=><div className="book-row bid-row" key={"b"+i}><span>{x.price.toLocaleString("en-US",{maximumFractionDigits:6})}</span><span>{x.quantity.toFixed(5)}</span><b>{(x.price*x.quantity).toLocaleString("en-US",{maximumFractionDigits:0})}</b></div>)}</div><div><h3>ASKS · SELL SIDE</h3>{book.asks.slice(0,15).map((x,i)=><div className="book-row ask-row" key={"a"+i}><span>{x.price.toLocaleString("en-US",{maximumFractionDigits:6})}</span><span>{x.quantity.toFixed(5)}</span><b>{(x.price*x.quantity).toLocaleString("en-US",{maximumFractionDigits:0})}</b></div>)}</div></div></>:<div className="screener-empty">Select a USDT spot pair to load live order-book depth. {bookStatus}</div>}
            <div className="module-note"><b>Order-flow scope</b><span>This is visible spot order-book depth, not hidden liquidity, footprint delta, or a full historical heatmap. Depth is exchange-specific and can change rapidly.</span></div>
          </div>}
          {active === "Market Radar" && <div className="card module-card"><div className="card-heading"><div><div className="section-kicker">CROSS-MARKET MONITOR</div><h2>Market Radar</h2></div><span className="subtle-tag">PROVIDER SYNC PENDING</span></div><div className="radar-grid">{[{s:"BTCUSDT",m:"CRYPTO"},{s:"XAUUSD",m:"METALS"},{s:"DXY",m:"CURRENCY INDEX"},{s:"USOIL",m:"ENERGY"},{s:"SPX",m:"INDICES"},{s:"EURUSD",m:"FOREX"}].map(x=><button key={x.s} onClick={()=>{if(watchlist.some(w=>w.symbol===x.s))setSelected(x.s);}}><small>{x.m}</small><b>{x.s}</b><span>—</span><em>Feed pending</em></button>)}</div><div className="module-note"><b>Correlation and macro radar</b><span>Relative strength, correlation matrix, volatility regime and macro event overlays will be enabled after provider integration.</span></div></div>}
          {active === "Journal" && <div className="card module-card journal-card"><div className="section-kicker">TRADING RESEARCH</div><h2>Trading journal</h2><p>Record your market thesis, observations and review notes. Draft is saved in this browser.</p><textarea value={journalText} onChange={e=>{setJournalText(e.target.value);setJournalSaved(false);}} placeholder="Write your market plan or trade review..."/><div className="journal-actions"><span>{journalText.length} characters · Local browser draft</span><button className="control-button" onClick={()=>{localStorage.setItem("nvx-journal-draft",journalText);setJournalSaved(true);}}>Save draft</button></div>{journalSaved&&<span className="saved-label">Draft saved on this device</span>}</div>}
        </section>}
        <div className={`dashboard-grid ${active !== "Overview" ? "overview-hidden" : ""}`}>
          <section className="card chart-card">
            <div className="card-heading chart-heading"><div><div className="section-kicker">PRICE ACTION</div><div className="instrument-title"><strong>{current.symbol}</strong><span>{current.name}</span><span className="feed-badge"><i/> NO FEED</span></div></div><div className="chart-actions"><button className="control-button"><Star size={14}/> Watch</button><button className="control-button"><Settings2 size={14}/></button></div></div>
            <div className="chart-toolbar"><div className="timeframes">{["1m","5m","15m","1H","4H","1D","1W"].map(t=><button key={t} className={period===t?"time-active":""} onClick={()=>setPeriod(t)}>{t}</button>)}</div><div className="chart-tools"><span><BarChart3 size={14}/> Indicators</span><span><Layers3 size={14}/> Layout</span></div></div>
            <LiveChart symbol={selected} period={period}/>
            <div className="chart-footer"><span><CircleDot size={13}/> Chart engine <b>READY</b></span><span>Data source <b>NOT CONNECTED</b></span><span>Timezone <b>UTC</b></span></div>
          </section>

          <section className="card watch-card">
            <div className="card-heading"><div><div className="section-kicker">YOUR MARKETS</div><h2>Watchlist</h2></div><button className="icon-button" aria-label="Add symbol"><Plus size={17}/></button></div>
            <div className="watch-search"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search markets..."/></div>
            <div className="watch-columns"><span>INSTRUMENT</span><span>LAST PRICE</span></div>
            <div className="watch-rows">{filtered.map(item=><button key={item.symbol} className={selected===item.symbol?"watch-row watch-selected":"watch-row"} onClick={()=>setSelected(item.symbol)}><span className="asset-icon">{item.symbol.slice(0,1)}</span><span className="asset-info"><b>{item.symbol}</b><small>{item.name}</small></span><span className="asset-price"><b>{fmtPrice(quote(item.symbol)?.price)}</b><small className={quote(item.symbol)?.change>=0?"quote-up":"quote-down"}>{quote(item.symbol)?`${quote(item.symbol).change>=0?"+":""}${quote(item.symbol).change.toFixed(2)}%`:"Awaiting feed"}</small></span></button>)}{filtered.length===0&&<div className="no-results">No matching instruments</div>}</div>
            <button className="manage-watchlist">MANAGE WATCHLIST <span>→</span></button>
          </section>

          <section className="card metrics-card">
            <div className="card-heading"><div><div className="section-kicker">MARKET SNAPSHOT</div><h2>Global conditions</h2></div><span className="subtle-tag">LIVE DATA PENDING</span></div>
            <div className="metric-grid">{[{label:"TOTAL CRYPTO CAP",value:"—",icon:Gauge},{label:"BTC DOMINANCE",value:"—",icon:Activity},{label:"MARKET VOLUME",value:"—",icon:BarChart3},{label:"FEAR & GREED",value:"—",icon:Compass}].map(({label,value,icon:Icon})=><div className="metric" key={label}><div><span>{label}</span><Icon size={15}/></div><strong>{value}</strong><small>Awaiting provider data</small></div>)}</div>
          </section>

          <section className="card providers-card">
            <div className="card-heading"><div><div className="section-kicker">DATA INFRASTRUCTURE</div><h2>Provider connections</h2></div><span className="provider-count">0 / 5 ONLINE</span></div>
            <div className="provider-list">{providers.map(name=>{const p=providerInfo.find(x=>x.name.toUpperCase()===name);return <div className="provider-row" key={name}><span className="provider-mark">{name.slice(0,1)}</span><b>{name}</b><span className="provider-status"><i/> {p?.credentialsConfigured?"KEY CONFIGURED":p?.publicMarketData?"PUBLIC FEED":"STATUS UNKNOWN"}</span></div>;})}</div>
            <div className="provider-foot"><ShieldCheck size={14}/> API credentials are stored server-side.</div>
          </section>

          <section className="card intelligence-card">
            <div className="intel-glow"><Sparkles size={18}/></div><div><div className="section-kicker">NORDVEX INTELLIGENCE</div><h2>AI Trade Pilot</h2><p>Market context, multi-factor bias and trade analysis will appear here once data services are online.</p><span className="subtle-tag">ENGINE INITIALIZING</span></div>
          </section>
        </div>
        <footer className="app-footer"><span>NORDVEX CHARTING <i>•</i> TERMINAL BUILD 0.1</span><span><Clock3 size={12}/> ALL TIMES UTC <i>•</i> DATA STATUS: PENDING</span></footer>
      </div>
    </main>
  </div>;
}
createRoot(document.getElementById("root")).render(<App />);
