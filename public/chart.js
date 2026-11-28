/* Drawer chart: candlesticks + volume, with an RSI(14) pane underneath (TradingView Lightweight Charts).
   Candles come from /api/klines (cached and rate-limited on the server) and refresh every 5s. */
(()=>{
const IVS=["1m","5m","15m","1h","4h","1d","1w"],IV_SEC={"1m":60,"5m":300,"15m":900,"1h":3600,"4h":14400,"1d":86400,"1w":604800};
const UP="#19c992",DOWN="#ff526c";
let symbol=null,interval="15m",manual=null,priceChart=null,rsiChart=null,cSeries=null,vSeries=null,rSeries=null,timer=null,lastTime=0,token=0,syncing=false;
try{manual=localStorage.getItem("nvx-chart-iv");if(!IVS.includes(manual))manual=null;}catch{}

/* Wilder RSI over all candles; the first 14 points are whitespace so both panes share the same time index */
function rsiData(cs){const out=cs.map(c=>({time:c.time})),n=14;if(cs.length<=n)return out;let g=0,l=0;for(let i=1;i<=n;i++){const d=cs[i].close-cs[i-1].close;g+=Math.max(d,0);l+=Math.max(-d,0);}g/=n;l/=n;
  const val=()=>l===0?(g===0?50:100):100-100/(1+g/l);out[n].value=val();
  for(let i=n+1;i<cs.length;i++){const d=cs[i].close-cs[i-1].close;g=(g*13+Math.max(d,0))/14;l=(l*13+Math.max(-d,0))/14;out[i].value=val();}return out;}
const local=t=>new Date(t*1000);
const precisionFor=p=>p>0?Math.max(2,Math.min(10,4-Math.floor(Math.log10(p)))):2;
const baseOpts=(h)=>({autoSize:true,layout:{background:{type:"solid",color:"#0d1219"},textColor:"#8d9aab",fontSize:11,attributionLogo:false},
  grid:{vertLines:{color:"#161e29"},horzLines:{color:"#161e29"}},crosshair:{mode:0},rightPriceScale:{borderColor:"#232d3a"},
  localization:{timeFormatter:t=>local(t).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false})},
  timeScale:{borderColor:"#232d3a",timeVisible:true,secondsVisible:false,rightOffset:4,tickMarkFormatter:(t,type)=>{const d=local(t);return type>=3?d.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",hour12:false}):type===2?d.toLocaleDateString([],{month:"short",day:"numeric"}):type===1?d.toLocaleDateString([],{month:"short"}):String(d.getFullYear());}}});

function destroy(){clearInterval(timer);timer=null;token++;for(const c of[priceChart,rsiChart]){try{c&&c.remove();}catch{}}priceChart=rsiChart=cSeries=vSeries=rSeries=null;lastTime=0;}
function build(box){
  box.innerHTML='<div class="chart-bar"><b id="chart-title"></b><span class="ivs">'+IVS.map(v=>'<button class="iv" data-iv="'+v+'">'+v+"</button>").join("")+'</span></div><div class="chart-wrap"><div id="chart-price"></div><div id="chart-rsi"></div><div class="chart-msg" id="chart-msg">Loading chart…</div></div>';
  const pe=box.querySelector("#chart-price"),re=box.querySelector("#chart-rsi"),L=window.LightweightCharts;
  priceChart=L.createChart(pe,{...baseOpts(),timeScale:{...baseOpts().timeScale,visible:false}});
  cSeries=priceChart.addCandlestickSeries({upColor:UP,downColor:DOWN,borderUpColor:UP,borderDownColor:DOWN,wickUpColor:UP,wickDownColor:DOWN,priceLineColor:"#7f8da1"});
  vSeries=priceChart.addHistogramSeries({priceFormat:{type:"volume"},priceScaleId:""});vSeries.priceScale().applyOptions({scaleMargins:{top:.82,bottom:0}});
  rsiChart=L.createChart(re,{...baseOpts(),rightPriceScale:{borderColor:"#232d3a",scaleMargins:{top:.08,bottom:.08}}});
  rSeries=rsiChart.addLineSeries({color:"#8fb2ff",lineWidth:2,priceLineVisible:false,lastValueVisible:true,autoscaleInfoProvider:()=>({priceRange:{minValue:0,maxValue:100}})});
  for(const[p,c,s]of[[70,"#ff4568",2],[50,"#5b6778",3],[30,"#25c4b7",2]])rSeries.createPriceLine({price:p,color:c,lineWidth:1,lineStyle:s,axisLabelVisible:p!==50,title:""});
  /* keep both panes scrolled/zoomed together */
  const link=(a,b)=>a.timeScale().subscribeVisibleLogicalRangeChange(r=>{if(syncing||!r)return;syncing=true;try{b.timeScale().setVisibleLogicalRange(r);}catch{}syncing=false;});
  link(priceChart,rsiChart);link(rsiChart,priceChart);
  box.querySelectorAll(".iv").forEach(b=>b.onclick=()=>{manual=b.dataset.iv;try{localStorage.setItem("nvx-chart-iv",manual);}catch{}interval=manual;mark();load(true);});
  mark();
}
function mark(){document.querySelectorAll("#chart-box .iv").forEach(b=>b.classList.toggle("on",b.dataset.iv===interval));const t=document.getElementById("chart-title");if(t)t.textContent=(symbol||"").replace(/USDT$/,"")+"/USDT · "+interval.toUpperCase();}
function msg(text){const m=document.getElementById("chart-msg");if(m){m.textContent=text||"";m.style.display=text?"flex":"none";}}

async function load(full){
  const my=++token,sym=symbol,iv=interval;if(!priceChart)return;
  try{
    const r=await fetch("/api/klines?symbol="+encodeURIComponent(sym)+"&interval="+iv+"&limit=300"),d=await r.json();
    if(my!==token||!priceChart)return;
    if(!r.ok)throw Error(d.error||"Chart data unavailable");
    const cs=d.candles.map(x=>({time:x[0]/1000,open:x[1],high:x[2],low:x[3],close:x[4],volume:x[5]})),vol=c=>({time:c.time,value:c.volume,color:c.close>=c.open?"#19c99244":"#ff526c44"});
    if(!cs.length)throw Error("No candles returned for this pair");
    const rs=rsiData(cs);
    if(full||!lastTime){const pr=precisionFor(cs.at(-1).close);cSeries.applyOptions({priceFormat:{type:"price",precision:pr,minMove:1/10**pr}});cSeries.setData(cs);vSeries.setData(cs.map(vol));rSeries.setData(rs);priceChart.timeScale().fitContent();rsiChart.timeScale().fitContent();priceChart.timeScale().scrollToPosition(4,false);}
    else cs.forEach((c,i)=>{if(c.time>=lastTime){cSeries.update(c);vSeries.update(vol(c));rSeries.update(rs[i]);}});
    lastTime=cs.at(-1).time;msg("");
  }catch(e){if(my===token)msg(e.message);}
}

window.NvxChart={
  show(sym,iv){const box=document.getElementById("chart-box");if(!box)return;destroy();symbol=sym;interval=iv;
    if(!window.LightweightCharts){box.innerHTML='<p class="muted">The chart library could not be loaded.</p>';return;}
    build(box);load(true);timer=setInterval(()=>{if(!document.hidden)load(false);},5000);},
  hide(){destroy();symbol=null;},
  preferred(){return manual;},
  clearPreferred(){manual=null;try{localStorage.removeItem("nvx-chart-iv");}catch{}}
};
})();
