import React, { useMemo, useState } from "react";
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
          <div className="connection-pill"><i/> CONNECTING TO FEEDS</div>
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
          {["BTCUSDT","ETHUSDT","XAUUSD","EURUSD","USOIL"].map((symbol,i)=><button key={symbol} className={selected===symbol?"ticker active-ticker": "ticker"} onClick={()=>setSelected(symbol)}><span>{symbol}</span><b>—</b><small className="ticker-muted">Awaiting feed</small></button>)}
        </section>

        <div className="dashboard-grid">
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
            <div className="watch-rows">{filtered.map(item=><button key={item.symbol} className={selected===item.symbol?"watch-row watch-selected":"watch-row"} onClick={()=>setSelected(item.symbol)}><span className="asset-icon">{item.symbol.slice(0,1)}</span><span className="asset-info"><b>{item.symbol}</b><small>{item.name}</small></span><span className="asset-price"><b>{item.price}</b><small>{item.change}</small></span></button>)}{filtered.length===0&&<div className="no-results">No matching instruments</div>}</div>
            <button className="manage-watchlist">MANAGE WATCHLIST <span>→</span></button>
          </section>

          <section className="card metrics-card">
            <div className="card-heading"><div><div className="section-kicker">MARKET SNAPSHOT</div><h2>Global conditions</h2></div><span className="subtle-tag">LIVE DATA PENDING</span></div>
            <div className="metric-grid">{[{label:"TOTAL CRYPTO CAP",value:"—",icon:Gauge},{label:"BTC DOMINANCE",value:"—",icon:Activity},{label:"MARKET VOLUME",value:"—",icon:BarChart3},{label:"FEAR & GREED",value:"—",icon:Compass}].map(({label,value,icon:Icon})=><div className="metric" key={label}><div><span>{label}</span><Icon size={15}/></div><strong>{value}</strong><small>Awaiting provider data</small></div>)}</div>
          </section>

          <section className="card providers-card">
            <div className="card-heading"><div><div className="section-kicker">DATA INFRASTRUCTURE</div><h2>Provider connections</h2></div><span className="provider-count">0 / 5 ONLINE</span></div>
            <div className="provider-list">{providers.map(name=><div className="provider-row" key={name}><span className="provider-mark">{name.slice(0,1)}</span><b>{name}</b><span className="provider-status"><i/> NOT SYNCED</span></div>)}</div>
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
