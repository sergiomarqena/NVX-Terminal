import React from "react";
import { createRoot } from "react-dom/client";
import { Activity, BarChart3, CandlestickChart, CircleDot, Layers3, RadioTower, Search, Settings2, ShieldCheck } from "lucide-react";
import "./style.css";

function App() {
  return <main className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="mark">N</div><div><b>NORDVEX</b><small>CHARTING TERMINAL</small></div></div>
      <div className="nav-label">WORKSPACE</div>
      <a className="active"><CandlestickChart size={17}/> Charting</a>
      <a><BarChart3 size={17}/> Screener</a>
      <a><Layers3 size={17}/> Order Flow</a>
      <a><RadioTower size={17}/> Market Radar</a>
      <a><Activity size={17}/> Journal</a>
      <div className="sidebar-bottom"><ShieldCheck size={15}/> Private workspace</div>
    </aside>
    <section className="main">
      <header><div className="crumb">MARKETS <span>/</span> OVERVIEW</div><div className="right"><span className="live"><i/> SYSTEM INITIALIZED</span><button><Settings2 size={16}/></button></div></header>
      <div className="welcome"><div><div className="eyebrow">MARKET INTELLIGENCE PLATFORM</div><h1>See the market <em>clearly.</em></h1><p>Your multi-market workspace is being initialized. Live feeds will appear when providers are connected.</p></div><div className="orb"><CircleDot size={34}/></div></div>
      <div className="grid">
        <article className="panel status"><div className="panel-head">PLATFORM STATUS <span className="tag">FOUNDATION</span></div><div className="status-line"><span className="dot"/> Interface online</div><div className="status-line muted"><span className="dot idle"/> Market data providers not connected</div><div className="status-line muted"><span className="dot idle"/> Authentication setup pending</div></article>
        <article className="panel"><div className="panel-head">MARKET UNIVERSE <Search size={15}/></div><div className="markets"><span>CRYPTO</span><span>GOLD</span><span>FOREX</span><span>STOCKS</span><span>INDICES</span></div><p className="hint">Provider-backed quotes and historical data will be enabled in the next integration phase.</p></article>
        <article className="panel chart"><div className="panel-head">CHART WORKSPACE <span className="tag">COMING ONLINE</span></div><div className="chart-empty"><BarChart3 size={28}/><b>Chart engine foundation</b><span>Connect market feeds to render live candles, volume and overlays.</span></div></article>
      </div>
      <footer>NORDVEX CHARTING <span>•</span> PRIVATE MARKET INTELLIGENCE</footer>
    </section>
  </main>;
}
createRoot(document.getElementById("root")).render(<App />);
