import React,{useEffect,useMemo,useRef,useState} from "react";
const API=import.meta.env.VITE_API_URL||"https://nvx-api-production.up.railway.app";
const intervals=["1m","5m","15m","1h","4h","1d"];
const loadSaved=()=>{try{return JSON.parse(localStorage.getItem("nvx-scalping-ledger")||"[]")}catch{return []}};
const atr=(a,i,n=14)=>{if(i<n)return 0;let s=0;for(let k=i-n+1;k<=i;k++){let p=a[k-1]?.close??a[k].close;s+=Math.max(a[k].high-a[k].low,Math.abs(a[k].high-p),Math.abs(a[k].low-p))}return s/n};
function engine(a,old,opts){
 let sh=null,sl=null,structure=0,bull=null,bear=null,trades=old.map(x=>({...x}));
 if(a.length<40)return {trades,structure:"NEUTRAL"};
 for(let i=0;i<a.length;i++){let b=a[i],p=a[i-1];if(!p)continue;
  let pi=i-3;if(pi>=3){let h=a[pi].high,l=a[pi].low,okH=true,okL=true;for(let k=pi-3;k<=pi+3;k++){if(k!==pi){if(a[k].high>=h)okH=false;if(a[k].low<=l)okL=false}}if(okH)sh={v:h,i:pi};if(okL)sl={v:l,i:pi}}
  let up=sh&&b.close>sh.v&&p.close<=sh.v,dn=sl&&b.close<sl.v&&p.close>=sl.v;if(up)structure=1;if(dn)structure=-1;
  let av=atr(a,i);if(!av)continue;let body=Math.abs(b.close-b.open);
  if(up||(b.close>b.open&&body>=av*.35&&b.close>p.high)){for(let k=i-1;k>=Math.max(0,i-12);k--)if(a[k].close<a[k].open){bull={hi:a[k].high,lo:a[k].low,i:k};break}}
  if(dn||(b.close<b.open&&body>=av*.35&&b.close<p.low)){for(let k=i-1;k>=Math.max(0,i-12);k--)if(a[k].close>a[k].open){bear={hi:a[k].high,lo:a[k].low,i:k};break}}
  for(let t of trades){if(t.status==="TP"||t.status==="SL")continue;let r=Math.abs(t.entry-t.initialSL);
   if(opts.be&&t.status==="ACTIVE"&&(t.side==="BUY"?b.high>=t.entry+r:b.low<=t.entry-r)){t.sl=t.entry;t.status="RISK-FREE"}
   let stop=t.side==="BUY"?b.low<=t.sl:b.high>=t.sl,target=t.side==="BUY"?b.high>=t.tp:b.low<=t.tp;
   if(stop){t.status="SL";t.exit=t.sl;t.closedAt=b.time}else if(target){t.status="TP";t.exit=t.tp;t.closedAt=b.time}
  }
  if(i!==a.length-1)continue;
  let bs=sl&&b.low<sl.v&&b.close>sl.v&&b.close>b.open,ss=sh&&b.high>sh.v&&b.close<sh.v&&b.close<b.open;
  let br=bull&&i>bull.i&&i-bull.i<100&&b.low<=bull.hi&&b.close>bull.hi&&b.close>b.open;
  let sr=bear&&i>bear.i&&i-bear.i<100&&b.high>=bear.lo&&b.close<bear.lo&&b.close<b.open;
  let cooldown=!trades[0]||a.length-trades[0].barIndex>5;
  let side=(bs||br)&&(!opts.gate||structure===1)&&cooldown?"BUY":(ss||sr)&&(!opts.gate||structure===-1)&&cooldown?"SELL":null;
  if(side){let entry=b.close,edge=side==="BUY"?(bs?b.low:Math.min(b.low,bull?.lo??b.low)):(ss?b.high:Math.max(b.high,bear?.hi??b.high)),stop=edge+(side==="BUY"?-1:1)*av*.15,r=Math.abs(entry-stop);
   if(r>0){let id=String(b.time)+side;if(!trades.some(t=>t.id===id))trades.unshift({id:id,side:side,entry:entry,initialSL:stop,sl:stop,tp:entry+(side==="BUY"?1:-1)*r*opts.rr,rr:opts.rr,status:"ACTIVE",reason:bs||ss?"LIQUIDITY SWEEP":"OB RETEST",barIndex:i,time:b.time,symbol:opts.symbol,timeframe:opts.tf})}
  }
 }
 return {trades:trades.slice(0,150),structure:structure===1?"BULLISH":structure===-1?"BEARISH":"NEUTRAL"};
}
export default function ScalpingEngine({symbol="BTCUSDT",period="5m"}){
 const [exchange,setExchange]=useState("binance"),[tf,setTf]=useState(period.toLowerCase()),[bars,setBars]=useState([]),[trades,setTrades]=useState(loadSaved),[structure,setStructure]=useState("NEUTRAL"),[status,setStatus]=useState("CONNECTING"),[error,setError]=useState(""),[rr,setRr]=useState(2),[gate,setGate]=useState(true),[be,setBe]=useState(true),[notify,setNotify]=useState(false),[lastAlert,setLastAlert]=useState("");

 useEffect(()=>setTf(period.toLowerCase()),[period]);
 useEffect(()=>{localStorage.setItem("nvx-scalping-ledger",JSON.stringify(trades))},[trades]);
 useEffect(()=>{
  let dead=false,ws=null,retry=null;
  const connect=()=>{ws=new WebSocket(API.replace(/^http/,"ws")+"/ws/scalping");
   ws.onmessage=e=>{try{const m=JSON.parse(e.data);if(m.type!=="scalping-alert")return;const p=m.payload||{};const msg=p.source+" "+p.event+" · "+p.side+" "+p.symbol+" · Entry "+p.entry+" · TP "+p.tp+" · SL "+p.sl;setLastAlert(msg);if(notify&&"Notification"in window&&Notification.permission==="granted")new Notification("NORDVEX "+p.event,{body:msg})}catch{}};
   ws.onclose=()=>{if(!dead)retry=setTimeout(connect,2500)};
  };connect();return()=>{dead=true;clearTimeout(retry);ws?.close()};
 },[notify]);


 useEffect(()=>{
  let dead=false,ws=null,retry=null,rows=[];
  const load=async()=>{
   try{
    if(!/^[A-Z0-9]{5,20}USDT$/.test(symbol)){setStatus("BROKER FEED REQUIRED");setError("XAUUSD, FX and Oil require a licensed broker feed. No crypto proxy data is substituted.");return}
    setStatus("LOADING HISTORY");let res=await fetch(API+"/api/v1/market/candles?exchange="+exchange+"&symbol="+symbol+"&interval="+tf+"&limit=500"),d=await res.json();if(!res.ok)throw Error(d.detail||d.error||"History unavailable");
    rows=(d.candles||[]).map(x=>({time:+x.time<1e12?+x.time*1000:+x.time,open:+x.open,high:+x.high,low:+x.low,close:+x.close,volume:+x.volume||0}));if(dead)return;setBars(rows);
    let url=exchange==="binance"?"wss://stream.binance.com:9443/ws/"+symbol.toLowerCase()+"@kline_"+tf:exchange==="bybit"?"wss://stream.bybit.com/v5/public/spot":"wss://wbs-api.mexc.com/ws";ws=new WebSocket(url);
    ws.onopen=()=>{if(exchange==="bybit")ws.send(JSON.stringify({op:"subscribe",args:["kline."+({"1m":"1","5m":"5","15m":"15","1h":"60","4h":"240","1d":"D"}[tf]||"5")+"."+symbol]}));if(exchange==="mexc")ws.send(JSON.stringify({method:"SUBSCRIPTION",params:["spot@public.kline.v3.api@"+symbol+"@"+({"1m":"Min1","5m":"Min5","15m":"Min15","1h":"Min60","4h":"Hour4","1d":"Day1"}[tf]||"Min5")]}));setStatus("LIVE · "+exchange.toUpperCase())};
    ws.onmessage=e=>{try{let m=JSON.parse(e.data),k,c,closed=false;if(exchange==="binance"){k=m.k;if(!k)return;closed=!!k.x;c={time:k.t,open:+k.o,high:+k.h,low:+k.l,close:+k.c,volume:+k.v}}else if(exchange==="bybit"){k=m.data?.[0];if(!k)return;closed=!!k.confirm;c={time:+k.start,open:+k.open,high:+k.high,low:+k.low,close:+k.close,volume:+k.volume}}else{k=m.d?.k||m.d;if(!k?.t)return;closed=!!k.x;c={time:+k.t,open:+k.o,high:+k.h,low:+k.l,close:+k.c,volume:+k.v}}if(!closed)return;c.time=c.time<1e12?c.time*1000:c.time;rows=[...rows.filter(x=>x.time!==c.time),c].sort((x,y)=>x.time-y.time).slice(-1000);if(!dead)setBars(rows)}catch{}};
    ws.onclose=()=>{if(!dead){setStatus("RECONNECTING");retry=setTimeout(load,2500)}};ws.onerror=()=>setStatus("STREAM INTERRUPTED");
   }catch(e){if(!dead){setStatus("DATA UNAVAILABLE");setError(e.message)}}
  };load();return()=>{dead=true;clearTimeout(retry);ws?.close()};
 },[symbol,exchange,tf]);
 useEffect(()=>{if(!bars.length)return;let out=engine(bars,trades,{rr,gate,be,symbol,tf});let ids=new Set(trades.map(t=>t.id)),fresh=out.trades.filter(t=>!ids.has(t.id));for(let t of fresh){let msg="NORDVEX "+t.side+" "+symbol+" "+tf+" Entry "+t.entry+" TP "+t.tp+" SL "+t.sl+" RR 1:"+rr;
  if(notify&&"Notification"in window&&Notification.permission==="granted")new Notification("NORDVEX "+t.side,{body:msg});
  fetch(API+"/api/v1/scalping/alerts",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...t,event:"ENTRY"})}).catch(()=>{});
 }setTrades(out.trades);setStructure(out.structure)},[bars,rr,gate,be,symbol,tf]);
 const stats=useMemo(()=>({tp:trades.filter(t=>t.status==="TP").length,sl:trades.filter(t=>t.status==="SL").length,rf:trades.filter(t=>t.status==="RISK-FREE").length,active:trades.filter(t=>t.status==="ACTIVE"||t.status==="RISK-FREE").length}),[trades]);
 const enable=async()=>{if(!("Notification"in window))return setError("Browser notifications are unavailable.");let p=await Notification.requestPermission();setNotify(p==="granted")};
 return <section className="nvx-scalp card"><div className="scalp-head"><div><div className="section-kicker">NORDVEX PROPRIETARY SIGNAL ENGINE</div><h2>Institutional Scalping Engine</h2><p>Closed-candle signals · OB retests · Liquidity sweeps · Persistent ledger</p></div><span className={status.startsWith("LIVE")?"scalp-status is-live":"scalp-status"}>{status}</span></div>
 <div className="scalp-controls"><label>EXCHANGE <select value={exchange} onChange={e=>setExchange(e.target.value)}><option value="binance">BINANCE</option><option value="bybit">BYBIT</option><option value="mexc">MEXC</option></select></label><label>TIMEFRAME <select value={tf} onChange={e=>setTf(e.target.value)}>{intervals.map(x=><option key={x}>{x}</option>)}</select></label><label>R:R <select value={rr} onChange={e=>setRr(+e.target.value)}><option value="1.5">1:1.5</option><option value="2">1:2</option><option value="2.5">1:2.5</option><option value="3">1:3</option></select></label><label className="scalp-check"><input type="checkbox" checked={gate} onChange={e=>setGate(e.target.checked)}/> STRUCTURE FILTER</label><label className="scalp-check"><input type="checkbox" checked={be} onChange={e=>setBe(e.target.checked)}/> BREAK EVEN +1R</label><button onClick={enable}>ENABLE NOTIFICATIONS</button></div>
 {error&&<div className="scalp-error">{error}</div>}<div className="scalp-stats">{[["ACTIVE",stats.active],["STRUCTURE",structure],["TP CLOSED",stats.tp],["SL CLOSED",stats.sl],["RISK-FREE",stats.rf]].map(x=><div key={x[0]}><small>{x[0]}</small><b>{x[1]}</b></div>)}</div>
 <div className="scalp-ledger-head"><b>TRADE LEDGER · {symbol}</b><span>{trades.length} SAVED</span></div><div className="scalp-trades">{trades.filter(t=>t.symbol===symbol).slice(0,35).map(t=><article className="scalp-trade" key={t.id}><div className="scalp-trade-title"><b className={t.side==="BUY"?"buy":"sell"}>{t.side}</b><span>{t.reason}</span><em className={"trade-state "+(t.status==="TP"?"tp":t.status==="SL"?"sl":t.status==="RISK-FREE"?"rf":"")}>{t.status}</em></div><div className="scalp-levels"><span>ENTRY <b>{t.entry}</b></span><span>TP <b>{t.tp}</b></span><span>SL <b>{t.sl}</b></span><span>R:R <b>1:{t.rr}</b></span><span>AGE <b>{Math.max(0,bars.length-1-t.barIndex)} bars</b></span></div></article>)}{!trades.some(t=>t.symbol===symbol)&&<div className="scalp-empty">Waiting for a confirmed setup. A signal is created only after candle close.</div>}</div>
 {lastAlert&&<div className="scalp-last-alert">{lastAlert}</div>}<div className="scalp-foot">No accuracy guarantee. Backtest and forward-test before relying on signals.</div></section>
}
