import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

const TF = {"1m":"1m","5m":"5m","15m":"15m","1H":"1h","4H":"4h","1D":"1d","1W":"1w"};
const BYBIT_TF = {"1m":"1","5m":"5","15m":"15","1H":"60","4H":"240","1D":"D","1W":"W"};
const API_BASE = import.meta.env.VITE_API_URL || "https://nvx-api-production.up.railway.app";
const norm = r => { const t=Number(r.time); return {time:t<1e12?t*1000:t,open:+r.open,high:+r.high,low:+r.low,close:+r.close,volume:+r.volume||0}; };
const ema = (a,n) => { const o=Array(a.length).fill(null),k=2/(n+1);let v=null;a.forEach((r,i)=>{v=v===null?r.close:r.close*k+v*(1-k);if(i>=n-1)o[i]=v;});return o; };
const sma = (a,n) => a.map((r,i)=>i<n-1?null:a.slice(i-n+1,i+1).reduce((s,x)=>s+x.close,0)/n);
const bb = a => { const m=sma(a,20),u=[],l=[];m.forEach((v,i)=>{if(v===null){u.push(null);l.push(null);}else{const d=Math.sqrt(a.slice(i-19,i+1).reduce((s,x)=>s+(x.close-v)**2,0)/20)*2;u.push(v+d);l.push(v-d);}});return {u,l}; };
const rsi = a => {const o=Array(a.length).fill(null);let g=0,l=0;for(let i=1;i<a.length;i++){const d=a[i].close-a[i-1].close;g+=Math.max(0,d);l+=Math.max(0,-d);if(i===14){g/=14;l/=14;}else if(i>14){g=(g*13+Math.max(0,d))/14;l=(l*13+Math.max(0,-d))/14;}if(i>=14)o[i]=l===0?100:100-100/(1+g/l);}return o;};
const parse = x => {try{const value=JSON.parse(x);return Array.isArray(value)?value:[];}catch{return [];}};

export default function LiveChart({symbol,period}) {
  const canvasRef=useRef(null),dataRef=useRef([]),geom=useRef(null),v=useRef({scale:1,offset:0,priceZoom:1,pricePan:0,drag:null,anchor:null,preview:null,crossX:null,crossY:null});
  const [exchange,setExchange]=useState("BINANCE"),[status,setStatus]=useState("CONNECTING"),[price,setPrice]=useState("—"),[error,setError]=useState("");
  const [revision,setRevision]=useState(0),[tool,setTool]=useState("crosshair"),[cross,setCross]=useState(null);
  const [ind,setInd]=useState({ema20:true,ema50:false,sma20:false,vwap:false,bb:false,rsi:false});
  const [drawings,setDrawings]=useState([]),[loadedKey,setLoadedKey]=useState("");
  const bump=()=>setRevision(n=>n+1),storeKey="nvx-drawings:"+symbol+":"+exchange+":"+period;
  useEffect(()=>{setDrawings(parse(localStorage.getItem(storeKey)));setLoadedKey(storeKey);},[storeKey]);
  useEffect(()=>{if(loadedKey!==storeKey)return;try{localStorage.setItem(storeKey,JSON.stringify(drawings));}catch{}},[storeKey,drawings,loadedKey]);

  const draw=useCallback(()=>{
    const c=canvasRef.current;if(!c)return;const r=c.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2),w=Math.max(1,r.width),h=Math.max(1,r.height);
    c.width=Math.floor(w*dpr);c.height=Math.floor(h*dpr);const x=c.getContext("2d");x.setTransform(dpr,0,0,dpr,0,0);x.clearRect(0,0,w,h);x.fillStyle="#0b131a";x.fillRect(0,0,w,h);
    const all=dataRef.current,right=82,top=14,bottom=27,volH=Math.max(35,h*.15),rsiH=ind.rsi?62:0,pb=h-bottom-volH-rsiH,ph=Math.max(30,pb-top),pw=Math.max(20,w-right-12);
    const step=Math.max(3,Math.min(34,9*v.current.scale)),visible=Math.max(8,Math.floor(pw/step)),end=Math.max(0,all.length-v.current.offset),start=Math.max(0,end-visible),rows=all.slice(start,end);
    geom.current={top,pb,ph,pw,step,visible,start,end,rows,pLo:0,pHi:0};
    x.strokeStyle="#1a2a33";for(let i=0;i<=5;i++){const yy=top+ph*i/5;x.beginPath();x.moveTo(0,yy);x.lineTo(pw,yy);x.stroke();}for(let i=0;i<=6;i++){const xx=pw*i/6;x.beginPath();x.moveTo(xx,top);x.lineTo(xx,pb);x.stroke();}
    if(!rows.length){x.fillStyle="#a1b2bb";x.font="700 12px Manrope,sans-serif";x.textAlign="center";x.fillText("Waiting for exchange data",pw/2,h/2);return;}
    let lo=Math.min(...rows.map(a=>a.low)),hi=Math.max(...rows.map(a=>a.high)),pad=(hi-lo)*.08||Math.abs(hi)*.001||1;lo-=pad;hi+=pad;
    const mid=(hi+lo)/2,half=(hi-lo)/(2*v.current.priceZoom),pLo=mid-half-v.current.pricePan,pHi=mid+half+v.current.pricePan;
    const Y=n=>top+(pHi-n)/(pHi-pLo)*ph,X=i=>pw-(rows.length-1-i)*step-step/2;geom.current.pLo=pLo;geom.current.pHi=pHi;geom.current.Y=Y;geom.current.X=X;
    x.font="10px 'DM Mono',monospace";x.fillStyle="#82959e";x.textAlign="left";for(let i=0;i<=5;i++){const n=pHi-(pHi-pLo)*i/5;x.fillText(n.toLocaleString("en-US",{maximumFractionDigits:n>100?2:5}),pw+8,top+ph*i/5+3);}
    const cw=Math.max(1,Math.min(10,step*.64)),mv=Math.max(1,...rows.map(a=>a.volume||0));
    rows.forEach((a,i)=>{const xx=X(i),up=a.close>=a.open,col=up?"#43bda5":"#d36f70";x.strokeStyle=col;x.fillStyle=col;x.beginPath();x.moveTo(xx,Y(a.high));x.lineTo(xx,Y(a.low));x.stroke();x.fillRect(xx-cw/2,Y(Math.max(a.open,a.close)),cw,Math.max(1,Math.abs(Y(a.open)-Y(a.close))));x.globalAlpha=.55;x.fillRect(xx-cw/2,h-bottom-(a.volume||0)/mv*(volH-5),cw,(a.volume||0)/mv*(volH-5));x.globalAlpha=1;});
    const line=(vals,col,dash=[])=>{x.beginPath();let begun=false;vals.forEach((n,i)=>{if(n==null||!Number.isFinite(n))return;const xx=X(i);if(!begun){x.moveTo(xx,Y(n));begun=true;}else x.lineTo(xx,Y(n));});x.strokeStyle=col;x.lineWidth=1.5;x.setLineDash(dash);x.stroke();x.setLineDash([]);};
    if(ind.ema20)line(ema(rows,20),"#e8b968");if(ind.ema50)line(ema(rows,50),"#9b91df");if(ind.sma20)line(sma(rows,20),"#73b6e9");
    if(ind.bb){const b=bb(rows);line(b.u,"#7c9fbc",[3,3]);line(b.l,"#7c9fbc",[3,3]);}
    if(ind.vwap){let pv=0,vol=0,day="";const vwapAll=all.map(a=>{const d=new Date(a.time).toISOString().slice(0,10);if(d!==day){day=d;pv=0;vol=0;}pv+=(a.high+a.low+a.close)/3*a.volume;vol+=a.volume;return vol?pv/vol:null;});line(vwapAll.slice(start,end),"#6daee8");}
    const last=rows.at(-1),py=Y(last.close);x.setLineDash([4,4]);x.strokeStyle="#73cfc0";x.beginPath();x.moveTo(0,py);x.lineTo(pw,py);x.stroke();x.setLineDash([]);x.fillStyle="#1c514b";x.fillRect(pw+2,py-9,right-5,18);x.fillStyle="#e0f5ef";x.font="700 10px 'DM Mono'";x.fillText(last.close.toLocaleString("en-US",{maximumFractionDigits:6}),pw+6,py+4);
    x.fillStyle="#748894";x.font="9px 'DM Mono'";x.textAlign="center";[0,.25,.5,.75,1].forEach(p=>{const a=rows[Math.min(rows.length-1,Math.floor(p*(rows.length-1)))];x.fillText(new Date(a.time).toLocaleString("en-US",{month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}),pw*p,h-8);});
    const timeX=t=>{let best=0,dist=Infinity;all.forEach((a,i)=>{const d=Math.abs(a.time-t);if(d<dist){dist=d;best=i;}});return pw-(end-1-best)*step-step/2;};
    const paint=d=>{const x1=timeX(d.a.time),y1=Y(d.a.price),x2=d.b?timeX(d.b.time):x1,y2=d.b?Y(d.b.price):y1;x.strokeStyle=d.color||"#d6b46f";x.fillStyle=d.color||"#d6b46f";x.lineWidth=1.5;
      if(d.type==="hline"){x.beginPath();x.moveTo(0,y1);x.lineTo(pw,y1);x.stroke();}
      else if(d.type==="vline"){x.beginPath();x.moveTo(x1,top);x.lineTo(x1,pb);x.stroke();}
      else if(d.type==="rect")x.strokeRect(x1,y1,x2-x1,y2-y1);
      else if(d.type==="fib"){const diff=d.b.price-d.a.price;[0,.236,.382,.5,.618,.786,1].forEach(q=>{const yy=Y(d.b.price-diff*q);x.beginPath();x.moveTo(Math.min(x1,x2),yy);x.lineTo(pw,yy);x.stroke();x.fillText((q*100).toFixed(1)+"%",Math.min(x1,x2)+4,yy-3);});}
      else{x.beginPath();x.moveTo(x1,y1);x.lineTo(x2,y2);x.stroke();}};
    drawings.forEach(paint);if(v.current.preview)paint(v.current.preview);
    // Persistent NORDVEX trade overlays are read from the same local ledger as the signal panel.
    try{
      const ledger=JSON.parse(localStorage.getItem("nvx-scalping-ledger")||"[]");
      const wanted=String(period).toLowerCase();
      ledger.filter(t=>t.symbol===symbol&&String(t.timeframe).toLowerCase()===wanted).forEach(t=>{
        const gi=all.findIndex(a=>a.time>=Number(t.time));if(gi<0||gi>=end)return;
        const local=gi-start,sx=local<0?0:X(Math.min(rows.length-1,local));
        const closed=t.closedAt?all.findIndex(a=>a.time>=Number(t.closedAt)):-1;
        const ex=closed>=start?X(Math.min(rows.length-1,closed-start)):pw;
        const right=Math.max(sx+2,Math.min(pw,ex));
        const entryY=Y(Number(t.entry)),tpY=Y(Number(t.tp)),slY=Y(Number(t.sl));
        x.fillStyle="rgba(35,164,132,.16)";x.fillRect(sx,Math.min(entryY,tpY),right-sx,Math.abs(entryY-tpY));
        x.strokeStyle="rgba(66,194,158,.65)";x.strokeRect(sx,Math.min(entryY,tpY),right-sx,Math.abs(entryY-tpY));
        x.fillStyle="rgba(207,69,83,.17)";x.fillRect(sx,Math.min(entryY,slY),right-sx,Math.abs(entryY-slY));
        x.strokeStyle="rgba(220,91,103,.7)";x.strokeRect(sx,Math.min(entryY,slY),right-sx,Math.abs(entryY-slY));
        x.font="700 9px 'DM Mono'";x.textAlign="left";x.fillStyle=t.side==="BUY"?"#75d7b6":"#ef9292";
        x.fillText(t.side+" · "+t.status,sx+4,Math.max(top+10,entryY-5));
        x.fillStyle="#71d3b3";x.fillText("TP "+Number(t.tp).toLocaleString("en-US",{maximumFractionDigits:5}),Math.min(pw-90,sx+5),Math.max(top+9,tpY-3));
        x.fillStyle="#ed8888";x.fillText("SL "+Number(t.sl).toLocaleString("en-US",{maximumFractionDigits:5}),Math.min(pw-90,sx+5),Math.min(pb-3,slY+11));
      });
    }catch{}
    if(v.current.crossX!==null&&tool==="crosshair"){x.strokeStyle="#a3b4bd";x.setLineDash([3,4]);x.beginPath();x.moveTo(v.current.crossX,top);x.lineTo(v.current.crossX,pb);x.moveTo(0,v.current.crossY);x.lineTo(pw,v.current.crossY);x.stroke();x.setLineDash([]);}
    if(ind.rsi){const vals=rsi(rows),rh=rsiH-8,ry=pb+5;x.fillStyle="#0d1921";x.fillRect(0,ry,pw,rh);[30,50,70].forEach(n=>{const yy=ry+(100-n)/100*rh;x.strokeStyle="#293a43";x.setLineDash([3,3]);x.beginPath();x.moveTo(0,yy);x.lineTo(pw,yy);x.stroke();x.setLineDash([]);});x.beginPath();let started=false;vals.forEach((n,i)=>{if(n===null)return;const xx=X(i),yy=ry+(100-n)/100*rh;if(!started){x.moveTo(xx,yy);started=true;}else x.lineTo(xx,yy);});x.strokeStyle="#b89de7";x.stroke();x.fillStyle="#a99bd1";x.font="8px 'DM Mono'";x.fillText("RSI 14",5,ry+10);}
  },[ind,drawings,tool,status,symbol,period]);

  useEffect(()=>{draw();},[draw,revision]);useEffect(()=>{const c=canvasRef.current;if(!c)return;const ro=new ResizeObserver(draw);ro.observe(c);return()=>ro.disconnect();},[draw]);
  useEffect(()=>{
    let cancelled=false,ws=null,retry=null,ping=null;dataRef.current=[];setError("");setPrice("—");setStatus("LOADING HISTORY");v.current.offset=0;v.current.priceZoom=1;v.current.pricePan=0;v.current.preview=null;v.current.anchor=null;bump();
    if(!/^[A-Z0-9]{5,20}USDT$/.test(symbol)){setStatus("FEED REQUIRED");setError("This instrument needs its own licensed market-data provider; exchange candles are not substituted.");return()=>{cancelled=true;};}
    const tf=TF[period]||"1h",proxy=API_BASE+"/api/v1/market/candles?exchange="+exchange.toLowerCase()+"&symbol="+symbol+"&interval="+tf+"&limit=500";
    const direct=exchange==="BYBIT"?"https://api.bybit.com/v5/market/kline?category=spot&symbol="+symbol+"&interval="+(BYBIT_TF[period]||"60")+"&limit=500":"https://"+(exchange==="MEXC"?"api.mexc.com":"api.binance.com")+"/api/v3/klines?symbol="+symbol+"&interval="+tf+"&limit=500";
    const read=async(url,signal)=>{const res=await fetch(url,{signal});if(!res.ok)throw new Error("HTTP "+res.status);const j=await res.json();if(url.includes("bybit.com")){if(j.retCode!==0)throw new Error(j.retMsg||"Bybit history error");return j.result.list.slice().reverse().map(k=>norm({time:k[0],open:k[1],high:k[2],low:k[3],close:k[4],volume:k[5]}));}const a=Array.isArray(j)?j:j.candles;if(!Array.isArray(a))throw new Error("Invalid candle payload");return a.map(k=>Array.isArray(k)?norm({time:k[0],open:k[1],high:k[2],low:k[3],close:k[4],volume:k[5]}):norm(k));};
    const start=async()=>{try{let rows;const ac=new AbortController(),t=setTimeout(()=>ac.abort(),8000);try{rows=await read(proxy,ac.signal);}catch{const fb=new AbortController(),ft=setTimeout(()=>fb.abort(),9000);try{rows=await read(direct,fb.signal);}finally{clearTimeout(ft);}}finally{clearTimeout(t);}if(cancelled)return;if(!rows.length)throw new Error("No candles returned");dataRef.current=rows.filter(a=>[a.time,a.open,a.high,a.low,a.close].every(Number.isFinite)).sort((a,b)=>a.time-b.time);const last=dataRef.current.at(-1);setPrice(last.close.toLocaleString("en-US",{maximumFractionDigits:6}));setStatus("HISTORY LOADED · "+exchange);bump();
      const connect=()=>{if(cancelled)return;const url=exchange==="BINANCE"?"wss://stream.binance.com:9443/ws/"+symbol.toLowerCase()+"@kline_"+tf:exchange==="BYBIT"?"wss://stream.bybit.com/v5/public/spot":"wss://wbs-api.mexc.com/ws";ws=new WebSocket(url);
        ws.onopen=()=>{setStatus("LIVE · "+exchange);if(exchange==="BYBIT")ws.send(JSON.stringify({op:"subscribe",args:["kline."+(BYBIT_TF[period]||"60")+"."+symbol]}));if(exchange==="MEXC"){ws.send(JSON.stringify({method:"SUBSCRIPTION",params:["spot@public.kline.v3.api@"+symbol+"@"+({"1m":"Min1","5m":"Min5","15m":"Min15","1H":"Min60","4H":"Hour4","1D":"Day1","1W":"Week1"}[period]||"Min60")]}));ping=setInterval(()=>{if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify({method:"PING"}));},18000);}};
        ws.onmessage=e=>{try{const m=JSON.parse(e.data);let k,z;if(exchange==="BINANCE"){k=m.k;if(!k)return;z={time:k.t,open:k.o,high:k.h,low:k.l,close:k.c,volume:k.v};}else if(exchange==="BYBIT"){k=m.data?.[0];if(!k)return;z={time:k.start,open:k.open,high:k.high,low:k.low,close:k.close,volume:k.volume};}else{k=m.d?.k||m.d;if(!k||!k.t)return;z={time:k.t,open:k.o,high:k.h,low:k.l,close:k.c,volume:k.v};}z=norm(z);if(!Number.isFinite(z.close))return;const a=dataRef.current;if(a.length&&a.at(-1).time===z.time)a[a.length-1]=z;else if(!a.length||z.time>a.at(-1).time)a.push(z);else return;if(a.length>2000)a.shift();setPrice(z.close.toLocaleString("en-US",{maximumFractionDigits:6}));bump();}catch{}};
        ws.onerror=()=>setStatus("STREAM INTERRUPTED");ws.onclose=()=>{clearInterval(ping);if(!cancelled){setStatus("RECONNECTING");retry=setTimeout(connect,2500);}};};connect();
    }catch(e){if(!cancelled){setStatus("DATA UNAVAILABLE");setError("Unable to load "+exchange+" "+symbol+": "+(e.name==="AbortError"?"request timed out":e.message));bump();}}};start();
    return()=>{cancelled=true;clearTimeout(retry);clearInterval(ping);ws?.close();};
  },[symbol,period,exchange]);

  const pointAt=e=>{const g=geom.current;if(!g||!g.rows.length)return null;const rect=e.currentTarget.getBoundingClientRect(),xx=e.clientX-rect.left,yy=e.clientY-rect.top,i=Math.max(0,Math.min(g.rows.length-1,Math.round(g.rows.length-.5-(g.pw-xx)/g.step))),row=g.rows[i];return {time:row.time,price:g.pHi-(yy-g.top)/g.ph*(g.pHi-g.pLo)};};
  const down=e=>{const g=geom.current;if(!g)return;const xx=e.clientX-e.currentTarget.getBoundingClientRect().left;if(tool!=="crosshair"){const p=pointAt(e);if(p){e.currentTarget.setPointerCapture(e.pointerId);v.current.anchor=p;v.current.preview={type:tool,a:p,b:p};bump();return;}}e.currentTarget.setPointerCapture(e.pointerId);v.current.drag={x:e.clientX,offset:v.current.offset,axis:xx>g.pw,priceZoom:v.current.priceZoom,pricePan:v.current.pricePan};};
  const move=e=>{const g=geom.current;if(!g)return;const rect=e.currentTarget.getBoundingClientRect(),xx=e.clientX-rect.left,yy=e.clientY-rect.top;if(v.current.drag){const d=v.current.drag,dx=e.clientX-d.x;if(d.axis){v.current.priceZoom=Math.max(.35,Math.min(8,d.priceZoom*Math.exp(-dx*.004)));}else v.current.offset=Math.max(0,Math.min(Math.max(0,dataRef.current.length-8),d.offset+Math.round((d.x-e.clientX)/g.step)));bump();return;}if(v.current.anchor){const p=pointAt(e);if(p){v.current.preview={...v.current.preview,b:p};bump();}return;}v.current.crossX=xx;v.current.crossY=yy;const i=Math.max(0,Math.min(g.rows.length-1,Math.round(g.rows.length-.5-(g.pw-xx)/g.step))),a=g.rows[i];setCross(a?{time:new Date(a.time).toLocaleString(),open:a.open,high:a.high,low:a.low,close:a.close,volume:a.volume}:null);bump();};
  const up=e=>{if(v.current.anchor&&v.current.preview){const p=pointAt(e);if(p)setDrawings(a=>[...a,{id:Date.now()+Math.random(),type:v.current.preview.type,a:v.current.anchor,b:p,color:"#d6b46f"}]);v.current.anchor=null;v.current.preview=null;}v.current.drag=null;bump();};
  const wheel=e=>{e.preventDefault();const g=geom.current;if(!g)return;const xx=e.clientX-e.currentTarget.getBoundingClientRect().left,local=Math.round(g.rows.length-.5-(g.pw-xx)/g.step),global=g.start+Math.max(0,Math.min(g.rows.length-1,local)),s=Math.max(.35,Math.min(6,v.current.scale*(e.deltaY<0?1.12:.89))),ns=Math.max(3,Math.min(34,9*s)),nv=Math.max(8,Math.floor(g.pw/ns)),newLocal=Math.round(nv-.5-(g.pw-xx)/ns),newStart=Math.max(0,global-newLocal);v.current.scale=s;v.current.offset=Math.max(0,Math.min(dataRef.current.length-8,dataRef.current.length-(newStart+nv)));bump();};
  const reset=()=>{v.current.scale=1;v.current.offset=0;v.current.priceZoom=1;v.current.pricePan=0;v.current.crossX=null;setTool("crosshair");bump();};
  return <div className="live-chart-wrap nvx-native-chart">
    <div className="live-chart-meta"><span><i className={status.startsWith("LIVE")?"live-dot":""}/>{status} · NORDVEX NATIVE ENGINE</span><b>{price}</b></div>
    <div className="native-chart-toolbar">
      <label>EXCHANGE <select value={exchange} onChange={e=>setExchange(e.target.value)}><option>BINANCE</option><option>BYBIT</option><option>MEXC</option></select></label>
      <div className="native-indicators">{[["ema20","EMA 20"],["ema50","EMA 50"],["sma20","SMA 20"],["vwap","VWAP"],["bb","BB 20"],["rsi","RSI 14"]].map(([k,l])=><button key={k} className={ind[k]?"tool-on":""} onClick={()=>setInd(a=>({...a,[k]:!a[k]}))}>{l}</button>)}</div>
      <div className="native-tools">{["crosshair","trendline","hline","vline","rect","fib"].map(k=><button key={k} className={tool===k?"tool-on":""} onClick={()=>setTool(k)}>{({crosshair:"CROSS",trendline:"LINE",hline:"H-LINE",vline:"V-LINE",rect:"RECT",fib:"FIB"})[k]}</button>)}<button onClick={()=>setDrawings(a=>a.slice(0,-1))} disabled={!drawings.length}>UNDO</button><button onClick={()=>setDrawings([])} disabled={!drawings.length}>CLEAR</button><button onClick={reset}>RESET</button></div>
    </div>
    {error&&<div className="chart-error">{error}</div>}
    <div className="native-chart-readout">{cross?cross.time+" · O "+cross.open+" · H "+cross.high+" · L "+cross.low+" · C "+cross.close+" · V "+cross.volume:"Scroll to zoom · Drag to pan · Drag price axis to scale · Drawings save per symbol/timeframe"}</div>
    <canvas ref={canvasRef} className="nvx-chart-canvas" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onWheel={wheel} onPointerLeave={()=>{if(!v.current.drag){v.current.crossX=null;setCross(null);bump();}}}/>
  </div>;
}
