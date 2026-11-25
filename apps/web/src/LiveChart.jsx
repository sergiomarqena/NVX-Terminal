import React, { useCallback, useEffect, useRef, useState } from "react";

const TF = {"1m":"1m","5m":"5m","15m":"15m","1H":"1h","4H":"4h","1D":"1d","1W":"1w"};
const BYBIT_TF = {"1m":"1","5m":"5","15m":"15","1H":"60","4H":"240","1D":"D","1W":"W"};
const PAIR_OK = ["BTCUSDT","ETHUSDT"];
const avg = (rows, period) => rows.map((r,i) => i+1<period ? null : rows.slice(i-period+1,i+1).reduce((s,x)=>s+x.close,0)/period);
const normalize = (r) => ({time:r.time,open:+r.open,high:+r.high,low:+r.low,close:+r.close,volume:+r.volume});

export default function LiveChart({symbol,period}) {
  const canvasRef=useRef(null), dataRef=useRef([]);
  const view=useRef({scale:1,offset:0,crossX:null,crossY:null,drag:false,lastX:0,anchor:null,line:null});
  const [exchange,setExchange]=useState("BINANCE");
  const [status,setStatus]=useState("CONNECTING");
  const [price,setPrice]=useState("—");
  const [error,setError]=useState("");
  const [revision,setRevision]=useState(0);
  const [indicators,setIndicators]=useState({ema20:true,ema50:false,vwap:false});
  const [tool,setTool]=useState("crosshair");
  const [crossInfo,setCrossInfo]=useState(null);
  const bump=()=>setRevision(v=>v+1);

  const draw=useCallback(()=>{
    const canvas=canvasRef.current;if(!canvas)return;
    const rect=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),w=Math.max(1,rect.width),h=Math.max(1,rect.height);
    canvas.width=Math.floor(w*dpr);canvas.height=Math.floor(h*dpr);
    const ctx=canvas.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.fillStyle="#0b131a";ctx.fillRect(0,0,w,h);
    const all=dataRef.current,right=82,top=17,bottom=33,volH=Math.max(45,h*.18),plotBottom=h-bottom-volH,plotH=plotBottom-top,plotW=w-right-12;
    ctx.strokeStyle="#1a2a33";ctx.lineWidth=1;
    for(let i=0;i<=5;i++){const y=top+plotH*i/5;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(plotW,y);ctx.stroke();}
    for(let i=0;i<=6;i++){const x=plotW*i/6;ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,plotBottom);ctx.stroke();}
    if(!all.length){ctx.fillStyle="#a1b2bb";ctx.font="700 12px Manrope";ctx.textAlign="center";ctx.fillText("Waiting for exchange data",plotW/2,h/2);return;}
    const step=Math.max(2,Math.min(26,Math.floor(9*view.current.scale))),visible=Math.max(10,Math.floor(plotW/step)),end=Math.max(0,all.length-view.current.offset),start=Math.max(0,end-visible),rows=all.slice(start,end);
    if(!rows.length)return;
    let lo=Math.min(...rows.map(x=>x.low)),hi=Math.max(...rows.map(x=>x.high));const pad=(hi-lo)*.08||hi*.001;lo-=pad;hi+=pad;
    const y=v=>top+(hi-v)/(hi-lo)*plotH,xAt=i=>plotW-(rows.length-1-i)*step-step*.5;
    const maxVol=Math.max(...rows.map(x=>x.volume||0),1);
    ctx.font="10px DM Mono,monospace";ctx.fillStyle="#82959e";ctx.textAlign="left";
    for(let i=0;i<=5;i++){const v=hi-(hi-lo)*i/5;ctx.fillText(v.toLocaleString("en-US",{maximumFractionDigits:v>100?2:5}),plotW+8,top+plotH*i/5+3);}
    rows.forEach((c,i)=>{const x=xAt(i),up=c.close>=c.open,color=up?"#43bda5":"#d36f70";ctx.strokeStyle=color;ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(x,y(c.high));ctx.lineTo(x,y(c.low));ctx.stroke();const yy=y(Math.max(c.open,c.close)),bh=Math.max(1,Math.abs(y(c.open)-y(c.close)));ctx.fillRect(x-Math.max(1,step*.32),yy,Math.max(2,step*.64),bh);const vh=(c.volume||0)/maxVol*(volH-7);ctx.globalAlpha=.62;ctx.fillRect(x-Math.max(1,step*.32),h-bottom-vh,Math.max(2,step*.64),vh);ctx.globalAlpha=1;});
    const drawLine=(values,color)=>{ctx.beginPath();let started=false;values.forEach((v,i)=>{if(v==null)return;const x=xAt(i);if(!started){ctx.moveTo(x,y(v));started=true;}else ctx.lineTo(x,y(v));});ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.stroke();};
    if(indicators.ema20)drawLine(avg(rows,20),"#e8b968");
    if(indicators.ema50)drawLine(avg(rows,50),"#9b91df");
    if(indicators.vwap){let pv=0,vol=0;const vals=rows.map(r=>{const v=(r.high+r.low+r.close)/3*r.volume;pv+=v;vol+=r.volume;return vol?pv/vol:null;});drawLine(vals,"#6daee8");}
    const last=rows[rows.length-1],py=y(last.close);ctx.setLineDash([4,4]);ctx.strokeStyle="#73cfc0";ctx.beginPath();ctx.moveTo(0,py);ctx.lineTo(plotW,py);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle="#1c514b";ctx.fillRect(plotW+2,py-9,right-5,18);ctx.fillStyle="#e0f5ef";ctx.font="700 10px DM Mono";ctx.fillText(last.close.toLocaleString("en-US",{maximumFractionDigits:5}),plotW+6,py+4);
    ctx.fillStyle="#748894";ctx.font="9px DM Mono";ctx.textAlign="center";[0,.25,.5,.75,1].forEach(p=>{const r=rows[Math.min(rows.length-1,Math.floor(p*(rows.length-1)))];const dt=new Date(r.time);ctx.fillText(dt.toLocaleString("en-US",{month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}),plotW*p,h-9);});
    const v=view.current;
    if(v.line){ctx.strokeStyle="#d6b46f";ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(v.line.x1,v.line.y1);ctx.lineTo(v.line.x2,v.line.y2);ctx.stroke();}
    if(v.crossX!==null&&tool==="crosshair"){ctx.strokeStyle="#a3b4bd";ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(v.crossX,top);ctx.lineTo(v.crossX,h-bottom);ctx.moveTo(0,v.crossY);ctx.lineTo(plotW,v.crossY);ctx.stroke();ctx.setLineDash([]);}
  },[indicators,tool]);

  useEffect(()=>{draw();},[draw,revision]);
  useEffect(()=>{const c=canvasRef.current;if(!c)return;const ro=new ResizeObserver(draw);ro.observe(c);return()=>ro.disconnect();},[draw]);

  useEffect(()=>{
    let ws,retry,timer,cancelled=false,heartbeat;
    dataRef.current=[];setError("");setPrice("—");setStatus("LOADING HISTORY");view.current.offset=0;view.current.line=null;
    if(!PAIR_OK.includes(symbol)){setStatus("PAIR NOT SUPPORTED");bump();return;}
    const tf=TF[period]||"1h";
    const parseBinance=rows=>rows.map(k=>({time:+k[0],open:+k[1],high:+k[2],low:+k[3],close:+k[4],volume:+k[5]}));
    const parseBybit=rows=>rows.slice().reverse().map(k=>({time:+k[0],open:+k[1],high:+k[2],low:+k[3],close:+k[4],volume:+k[5]}));
    const historyUrl=exchange==="BINANCE"?`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${tf}&limit=500`:exchange==="BYBIT"?`https://api.bybit.com/v5/market/kline?category=spot&symbol=${symbol}&interval=${BYBIT_TF[period]||"60"}&limit=500`:`https://api.mexc.com/api/v3/klines?symbol=${symbol}&interval=${tf}&limit=500`;
    const start=async()=>{
      try{
        const response=await fetch(historyUrl);if(!response.ok)throw new Error(exchange+" history HTTP "+response.status);
        const json=await response.json();let rows;
        if(exchange==="BYBIT"){if(json.retCode!==0)throw new Error(json.retMsg||"Bybit history error");rows=parseBybit(json.result.list);}
        else rows=parseBinance(json);
        if(cancelled)return;
        dataRef.current=rows.map(normalize);setPrice(dataRef.current.at(-1)?.close.toLocaleString("en-US",{maximumFractionDigits:5})||"—");setStatus("LIVE · "+exchange);bump();
        const connect=()=>{
          const url=exchange==="BINANCE"?"wss://stream.binance.com:9443/ws/"+symbol.toLowerCase()+"@kline_"+tf:exchange==="BYBIT"?"wss://stream.bybit.com/v5/public/spot":"wss://wbs-api.mexc.com/ws";
          ws=new WebSocket(url);
          ws.onopen=()=>{setStatus("LIVE · "+exchange);if(exchange==="BYBIT")ws.send(JSON.stringify({op:"subscribe",args:["kline."+(BYBIT_TF[period]||"60")+"."+symbol]}));if(exchange==="MEXC")ws.send(JSON.stringify({method:"SUBSCRIPTION",params:["spot@public.kline.v3.api@"+symbol+"@"+({ "1m":"Min1","5m":"Min5","15m":"Min15","1H":"Min60","4H":"Hour4","1D":"Day1","1W":"Week1"}[period]||"Min60")]}));};
          ws.onmessage=e=>{
            let candle;
            try{
              const m=JSON.parse(e.data);
              if(exchange==="BINANCE"){const k=m.k;candle={time:+k.t,open:+k.o,high:+k.h,low:+k.l,close:+k.c,volume:+k.v};}
              else if(exchange==="BYBIT"){const k=m.data?.[0];if(!k)return;candle={time:+k.start,open:+k.open,high:+k.high,low:+k.low,close:+k.close,volume:+k.volume};}
              else {const k=m.d?.k||m.d;if(!k||!k.t)return;candle={time:+k.t,open:+k.o,high:+k.h,low:+k.l,close:+k.c,volume:+k.v};}
            }catch{return;}
            if(!candle||!Number.isFinite(candle.close))return;
            candle.time=candle.time>1e12?Math.floor(candle.time/1000)*1000:candle.time*1000;
            const arr=dataRef.current;if(arr.length&&arr[arr.length-1].time===candle.time)arr[arr.length-1]=candle;else arr.push(candle);if(arr.length>1500)arr.shift();
            setPrice(candle.close.toLocaleString("en-US",{maximumFractionDigits:5}));bump();
          };
          ws.onerror=()=>setStatus("STREAM INTERRUPTED");
          ws.onclose=()=>{if(!cancelled){setStatus("RECONNECTING");retry=setTimeout(connect,2200);}};
        };connect();
      }catch(e){if(!cancelled){setStatus("DATA UNAVAILABLE");setError(e.message);}}
    };start();
    return()=>{cancelled=true;clearTimeout(retry);clearInterval(heartbeat);ws?.close();};
  },[symbol,period,exchange]);

  const pointerDown=e=>{const r=e.currentTarget.getBoundingClientRect(),v=view.current,x=e.clientX-r.left,y=e.clientY-r.top;if(tool==="trendline"){if(!v.anchor){v.anchor={x,y};}else{v.line={x1:v.anchor.x,y1:v.anchor.y,x2:x,y2:y};v.anchor=null;}bump();return;}v.drag=true;v.lastX=e.clientX;e.currentTarget.setPointerCapture(e.pointerId);};
  const pointerMove=e=>{const r=e.currentTarget.getBoundingClientRect(),v=view.current;if(v.drag){v.offset=Math.max(0,Math.min(dataRef.current.length-10,v.offset+Math.round((v.lastX-e.clientX)/9)));v.lastX=e.clientX;}else{v.crossX=e.clientX-r.left;v.crossY=e.clientY-r.top;const step=Math.max(2,Math.min(26,Math.floor(9*v.scale))),right=82,plotW=r.width-right-12,visible=Math.max(10,Math.floor(plotW/step)),end=Math.max(0,dataRef.current.length-v.offset),start=Math.max(0,end-visible),idx=Math.max(0,Math.min(end-start-1,Math.floor((v.crossX-(plotW-(end-start)*step))/step)));const row=dataRef.current[start+idx];setCrossInfo(row?{time:new Date(row.time).toLocaleString(),open:row.open,high:row.high,low:row.low,close:row.close,volume:row.volume}:null);}bump();};
  const wheel=e=>{e.preventDefault();view.current.scale=Math.max(.45,Math.min(5,view.current.scale*(e.deltaY<0?1.12:.89)));bump();};
  return <div className="live-chart-wrap nvx-native-chart">
    <div className="live-chart-meta"><span><i className={status.startsWith("LIVE")?"live-dot":""}/>{status} · NORDVEX NATIVE ENGINE</span><b>{price}</b></div>
    <div className="native-chart-toolbar">
      <label>EXCHANGE <select value={exchange} onChange={e=>setExchange(e.target.value)}><option>BINANCE</option><option>BYBIT</option><option>MEXC</option></select></label>
      <div className="native-indicators">{[["ema20","EMA 20"],["ema50","EMA 50"],["vwap","VWAP"]].map(([key,label])=><button key={key} className={indicators[key]?"tool-on":""} onClick={()=>setIndicators(v=>({...v,[key]:!v[key]}))}>{label}</button>)}</div>
      <div className="native-tools"><button className={tool==="crosshair"?"tool-on":""} onClick={()=>setTool("crosshair")}>CROSS</button><button className={tool==="trendline"?"tool-on":""} onClick={()=>setTool("trendline")}>TREND LINE</button><button onClick={()=>{view.current.line=null;view.current.anchor=null;view.current.offset=0;view.current.scale=1;setTool("crosshair");bump();}}>RESET</button></div>
    </div>
    {error&&<div className="chart-error">{error}</div>}
    <div className="native-chart-readout">{crossInfo?<>O {crossInfo.open} · H {crossInfo.high} · L {crossInfo.low} · C {crossInfo.close} · V {crossInfo.volume}</>:"Move crosshair over a candle to inspect OHLCV"}</div>
    <canvas ref={canvasRef} className="nvx-chart-canvas" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={()=>{view.current.drag=false;}} onPointerCancel={()=>{view.current.drag=false;}} onWheel={wheel} onPointerLeave={()=>{view.current.crossX=null;setCrossInfo(null);bump();}}/>
  </div>;
}
