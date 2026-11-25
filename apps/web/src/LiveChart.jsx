import React, { useCallback, useEffect, useRef, useState } from "react";

const TF = { "1m":"1m","5m":"5m","15m":"15m","1H":"1h","4H":"4h","1D":"1d","1W":"1w" };
const SYMBOLS = { BTCUSDT:"btcusdt", ETHUSDT:"ethusdt" };

export default function LiveChart({ symbol, period }) {
  const canvasRef = useRef(null);
  const dataRef = useRef([]);
  const viewRef = useRef({ scale: 1, offset: 0, crossX: null, crossY: null, dragging: false, lastX: 0 });
  const [status,setStatus] = useState("CONNECTING");
  const [price,setPrice] = useState("—");
  const [range,setRange] = useState(180);
  const [error,setError] = useState("");
  const [revision,setRevision] = useState(0);

  const draw = useCallback(() => {
    const canvas=canvasRef.current; if(!canvas) return;
    const rect=canvas.getBoundingClientRect(), dpr=Math.min(window.devicePixelRatio||1,2);
    const w=Math.max(1,rect.width), h=Math.max(1,rect.height);
    canvas.width=Math.floor(w*dpr); canvas.height=Math.floor(h*dpr);
    const ctx=canvas.getContext("2d"); ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,w,h); ctx.fillStyle="#0b131a"; ctx.fillRect(0,0,w,h);
    const data=dataRef.current, right=76, top=18, bottom=36, volH=Math.max(48,h*.19), plotBottom=h-bottom-volH, plotH=plotBottom-top, plotW=w-right-12;
    ctx.font="10px Manrope, sans-serif"; ctx.lineWidth=1;
    ctx.strokeStyle="#192832"; ctx.fillStyle="#718692";
    for(let i=0;i<=5;i++){const y=top+plotH*i/5;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(plotW,y);ctx.stroke();}
    for(let i=0;i<=6;i++){const x=plotW*i/6;ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,plotBottom);ctx.stroke();}
    if(!data.length){ctx.fillStyle="#8fa2ad";ctx.textAlign="center";ctx.font="700 12px Manrope";ctx.fillText("Waiting for market data",plotW/2,h/2);return;}
    const step=Math.max(2,Math.min(24,Math.floor(9*viewRef.current.scale))), visible=Math.max(10,Math.floor(plotW/step)), end=Math.max(0,data.length-viewRef.current.offset), start=Math.max(0,end-visible), rows=data.slice(start,end);
    if(!rows.length)return;
    let lo=Math.min(...rows.map(x=>x.low)), hi=Math.max(...rows.map(x=>x.high)); const pad=(hi-lo)*.08||hi*.001;lo-=pad;hi+=pad;
    const y=v=>top+(hi-v)/(hi-lo)*plotH, maxVol=Math.max(...rows.map(x=>x.volume||0),1);
    ctx.textAlign="left";ctx.fillStyle="#738894";ctx.font="10px DM Mono, monospace";
    for(let i=0;i<=5;i++){const v=hi-(hi-lo)*i/5;ctx.fillText(v.toLocaleString("en-US",{maximumFractionDigits:v>100?2:5}),plotW+9,top+plotH*i/5+3);}
    const candleW=Math.max(2,step*.64);
    rows.forEach((c,i)=>{const x=plotW-(rows.length-1-i)*step-step*.5, up=c.close>=c.open, color=up?"#42bda5":"#d36f70";
      ctx.strokeStyle=color;ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(x,y(c.high));ctx.lineTo(x,y(c.low));ctx.stroke();
      const yo=y(Math.max(c.open,c.close)), bh=Math.max(1,Math.abs(y(c.open)-y(c.close)));ctx.fillRect(x-candleW/2,yo,candleW,bh);
      const vh=(c.volume||0)/maxVol*(volH-8);ctx.globalAlpha=.65;ctx.fillRect(x-candleW/2,h-bottom-vh,candleW,vh);ctx.globalAlpha=1;
    });
    const last=rows[rows.length-1], py=y(last.close);ctx.setLineDash([4,4]);ctx.strokeStyle="#73cfc0";ctx.beginPath();ctx.moveTo(0,py);ctx.lineTo(plotW,py);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle="#1c514b";ctx.fillRect(plotW+3,py-9,right-7,18);ctx.fillStyle="#d7f5ef";ctx.font="700 10px DM Mono";ctx.fillText(last.close.toLocaleString("en-US",{maximumFractionDigits:5}),plotW+7,py+4);
    ctx.fillStyle="#718692";ctx.font="9px DM Mono";ctx.textAlign="center";
    [0,.25,.5,.75,1].forEach((p,i)=>{const idx=Math.min(rows.length-1,Math.floor(p*(rows.length-1)));const date=new Date(rows[idx].time*1000);ctx.fillText(date.toLocaleString("en-US",{month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}),plotW*p,h-10);});
    const cross=viewRef.current;
    if(cross.crossX!==null&&cross.crossX<plotW){ctx.strokeStyle="#8da7ad";ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(cross.crossX,top);ctx.lineTo(cross.crossX,h-bottom);ctx.stroke();ctx.beginPath();ctx.moveTo(0,cross.crossY);ctx.lineTo(plotW,cross.crossY);ctx.stroke();ctx.setLineDash([]);}
  },[]);

  useEffect(()=>{draw();},[draw,revision,range]);
  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas)return;
    const observer=new ResizeObserver(draw);observer.observe(canvas);return()=>observer.disconnect();
  },[draw]);

  useEffect(()=>{
    let socket, retry, cancelled=false;
    dataRef.current=[];setError("");setPrice("—");
    const stream=SYMBOLS[symbol];
    if(!stream){setStatus("FEED NOT CONFIGURED");setRevision(x=>x+1);return;}
    const interval=TF[period]||"1h";setStatus("LOADING HISTORY");
    fetch("https://api.binance.com/api/v3/klines?symbol="+symbol+"&interval="+interval+"&limit=500")
      .then(r=>{if(!r.ok)throw new Error("Market history request failed");return r.json();})
      .then(rows=>{
        if(cancelled)return;
        dataRef.current=rows.map(k=>({time:Math.floor(k[0]/1000),open:+k[1],high:+k[2],low:+k[3],close:+k[4],volume:+k[5]}));
        viewRef.current.offset=0;setRange(dataRef.current.length);setPrice(dataRef.current.at(-1)?.close.toLocaleString("en-US",{maximumFractionDigits:5})||"—");setStatus("LIVE · BINANCE SPOT");setRevision(x=>x+1);
        const connect=()=>{socket=new WebSocket("wss://stream.binance.com:9443/ws/"+stream+"@kline_"+interval);
          socket.onmessage=e=>{const k=JSON.parse(e.data).k, candle={time:Math.floor(k.t/1000),open:+k.o,high:+k.h,low:+k.l,close:+k.c,volume:+k.v};const arr=dataRef.current;if(arr.length&&arr[arr.length-1].time===candle.time)arr[arr.length-1]=candle;else arr.push(candle);if(arr.length>1200)arr.shift();setPrice(candle.close.toLocaleString("en-US",{maximumFractionDigits:5}));setRevision(x=>x+1);};
          socket.onerror=()=>setStatus("STREAM INTERRUPTED");socket.onclose=()=>{if(!cancelled){setStatus("RECONNECTING");retry=setTimeout(connect,2000);}};
        };connect();
      }).catch(e=>{if(!cancelled){setStatus("DATA UNAVAILABLE");setError(e.message);}});
    return()=>{cancelled=true;clearTimeout(retry);socket?.close();};
  },[symbol,period]);

  const pointerDown=e=>{viewRef.current.dragging=true;viewRef.current.lastX=e.clientX;e.currentTarget.setPointerCapture(e.pointerId);};
  const pointerMove=e=>{const r=e.currentTarget.getBoundingClientRect(),v=viewRef.current;if(v.dragging){const dx=e.clientX-v.lastX;v.offset=Math.max(0,Math.min(dataRef.current.length-10,v.offset+Math.round(dx/-9)));v.lastX=e.clientX;}else{v.crossX=e.clientX-r.left;v.crossY=e.clientY-r.top;}setRevision(x=>x+1);};
  const pointerUp=()=>{viewRef.current.dragging=false;};
  const wheel=e=>{e.preventDefault();const v=viewRef.current;v.scale=Math.max(.45,Math.min(4,v.scale*(e.deltaY<0?1.12:.89)));setRevision(x=>x+1);};
  return <div className="live-chart-wrap nvx-native-chart">
    <div className="live-chart-meta"><span><i className={status.startsWith("LIVE")?"live-dot":""}/>{status} · NORDVEX NATIVE ENGINE</span><b>{price}</b></div>
    {error&&<div className="chart-error">{error}</div>}
    {!SYMBOLS[symbol]&&<div className="chart-overlay"><b>{symbol} feed not connected</b><span>Native chart engine is ready. A licensed or exchange-specific data adapter is required for this instrument.</span></div>}
    <canvas ref={canvasRef} className="nvx-chart-canvas" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onWheel={wheel} onPointerLeave={()=>{viewRef.current.crossX=null;setRevision(x=>x+1);}}/>
    <div className="native-chart-controls"><button onClick={()=>{viewRef.current.scale=Math.min(4,viewRef.current.scale*1.2);setRevision(x=>x+1);}}>＋</button><button onClick={()=>{viewRef.current.scale=Math.max(.45,viewRef.current.scale/1.2);setRevision(x=>x+1);}}>−</button><button onClick={()=>{viewRef.current.offset=0;viewRef.current.scale=1;setRevision(x=>x+1);}}>RESET VIEW</button></div>
  </div>;
}
