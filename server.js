import express from "express";
import {WebSocketServer,WebSocket} from "ws";
import {createServer} from "node:http";

const app=express(),server=createServer(app),wss=new WebSocketServer({noServer:true,perMessageDeflate:{threshold:1024}});
const PORT=Number(process.env.PORT||3000);
const BASE=process.env.MEXC_REST_URL||"https://api.mexc.com";
const FUT=process.env.MEXC_FUTURES_URL||"https://contract.mexc.com";

/* ---- configuration -------------------------------------------------------------------------
   MEXC allows 300 request-weight per 10s per IP and bans IPs that keep hitting 429s, so every
   spot REST call goes through one shared pacer. MEXC_RATE = weight per second (default 15 = half
   the allowance). SCREENER_MAX_COINS limits the universe ("all" or unset = every USDT pair);
   the legacy SCREENER_COINS variable is ignored because it used to cap the universe at 100. */
const RATE=Math.max(2,Number(process.env.MEXC_RATE||15));
const parseLimit=v=>{const s=String(v??"").trim().toLowerCase();if(!s||s==="all")return Infinity;const n=Number(s);return Number.isFinite(n)&&n>0?Math.floor(n):Infinity;};
const MAX_COINS=parseLimit(process.env.SCREENER_MAX_COINS);
const MIN_VOLUME=Math.max(0,Number(process.env.SCREENER_MIN_VOLUME||0));
/* 1m and 5m candles go stale every few minutes, so they are only kept for the most liquid coins. */
const FAST={"1m":Number(process.env.SCREENER_1M_COINS||150),"5m":Number(process.env.SCREENER_5M_COINS||500)};

const TF=["1m","5m","15m","1h","4h","12h","1d","2d","3d","1w"];
const TF_MS={"1m":6e4,"5m":3e5,"15m":9e5,"1h":36e5,"4h":144e5,"12h":432e5,"1d":864e5,"2d":1728e5,"3d":2592e5,"1w":6048e5};
const REST_TF={"1m":"1m","5m":"5m","15m":"15m","1h":"60m","4h":"4h","1d":"1d","1w":"1W"};
const LOAD_ORDER=["4h","1h","1d","15m","1w","5m","1m"]; // bootstrap priority: default view first
const PERIOD=14,MAXC=120;

const state={status:"BOOTING",coins:new Map(),universe:[],lastUpdate:0,liveMarkets:0,errors:[],
  alertRules:{overbought:true,oversold:true,confluence:true,minVolume:5000000},
  oi:{contracts:0,matched:0,updatedAt:0},progress:{loaded:0,total:0,percent:0}};
const clients=wss.clients,cooldown=new Map(),inflight=new Set(),retryAt=new Map();
let backoffUntil=0,dirty=false,contractMeta=new Map();

app.use(express.json({limit:"32kb"}));app.use(express.static("public",{maxAge:"1h"}));
const num=x=>Number.isFinite(Number(x))?Number(x):0,round=x=>Number.isFinite(x)?Math.round(x*10)/10:null;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const logErr=e=>{state.errors.push(String(e.message||e));if(state.errors.length>8)state.errors.shift();};

/* ---- indicators ---------------------------------------------------------------------------- */
function rsi(values){if(!values||values.length<PERIOD+1)return null;let g=0,l=0;for(let i=1;i<=PERIOD;i++){const d=values[i]-values[i-1];g+=Math.max(d,0);l+=Math.max(-d,0);}g/=PERIOD;l/=PERIOD;for(let i=PERIOD+1;i<values.length;i++){const d=values[i]-values[i-1];g=(g*13+Math.max(d,0))/14;l=(l*13+Math.max(-d,0))/14;}return l===0?(g===0?50:100):100-100/(1+g/l);}
function zone(v){return v==null?"loading":v>=70?"overbought":v>=60?"strong":v<=30?"oversold":v<=40?"weak":"neutral";}
/* a frame is {times[],closes[],...}: only closes are needed for RSI, which keeps 1,300 coins x 7 frames small */
function calc(c,tf){const f=c.frames[tf];if(!f||(f.synth||0)>3)return null;return round(rsi(f.closes));}
function setFrame(c,tf,times,closes){c.frames[tf]={times:times.slice(-MAXC),closes:closes.slice(-MAXC),fetchedLast:times.at(-1)||0,fetchedAt:Date.now(),synth:0,nextAt:0};}
function agg(f,periodMs){if(!f)return null;const t=[],cl=[];for(let i=0;i<f.times.length;i++){const k=Math.floor(f.times[i]/periodMs)*periodMs;if(t.length&&t[t.length-1]===k)cl[cl.length-1]=f.closes[i];else{t.push(k);cl.push(f.closes[i]);}}return{times:t.slice(-MAXC),closes:cl.slice(-MAXC)};}
function derive(c){for(const[tf,src]of[["12h","4h"],["2d","1d"],["3d","1d"]]){const d=agg(c.frames[src],TF_MS[tf]);if(d)c.frames[tf]=d;}}
/* Live price -> latest candle. Keeps RSI moving every ticker refresh without re-downloading candles;
   when a candle period has rolled over, a synthetic candle is opened until the real one is fetched. */
function applyTick(c,now){const p=c.price;if(!(p>0))return;for(const tf of LOAD_ORDER){const f=c.frames[tf];if(!f||!f.closes.length)continue;const n=f.times.length,last=f.times[n-1],ms=TF_MS[tf];if(now>=last+ms){const steps=Math.floor((now-last)/ms);f.synth=(f.synth||0)+steps;f.times.push(last+steps*ms);f.closes.push(p);if(f.times.length>MAXC){f.times.shift();f.closes.shift();}}else f.closes[n-1]=p;}derive(c);}
function detectDivergence(c){const a=c.frames["4h"]?.closes||[];if(a.length<50)return"NONE";const x=a.slice(-50),rv=x.map((_,i)=>rsi(x.slice(0,i+1))),p=[];for(let i=5;i<x.length-5;i++){const w=x.slice(i-5,i+6);if(x[i]===Math.max(...w))p.push({price:x[i],rsi:rv[i],type:"H"});if(x[i]===Math.min(...w))p.push({price:x[i],rsi:rv[i],type:"L"});}const hi=p.filter(z=>z.type==="H"&&z.rsi!=null),lo=p.filter(z=>z.type==="L"&&z.rsi!=null);if(hi.length>1){const a=hi.at(-2),b=hi.at(-1);if(b.price>a.price&&b.rsi<a.rsi)return"BEARISH";}if(lo.length>1){const a=lo.at(-2),b=lo.at(-1);if(b.price<a.price&&b.rsi>a.rsi)return"BULLISH";}return"NONE";}
function snapshot(c){const rsis={};for(const tf of TF)rsis[tf]=calc(c,tf);const vals=Object.values(rsis).filter(Number.isFinite),avg=vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null,up=["15m","1h","4h"].every(t=>rsis[t]!=null&&rsis[t]>50),down=["15m","1h","4h"].every(t=>rsis[t]!=null&&rsis[t]<50),h=c.frames["1h"]?.closes||[],change1h=h.length>1&&h[h.length-2]!==0?(h[h.length-1]-h[h.length-2])/h[h.length-2]*100:null;return{symbol:c.symbol,base:c.base,price:c.price,change24h:c.change24h,change1h,quoteVolume:c.quoteVolume,openInterest:c.openInterest||null,oiRank:c.oiRank||null,rsis,averageRsi:round(avg),zone:zone(rsis["4h"]),confluence:up?"BULLISH":down?"BEARISH":"MIXED",divergence:c.divergence||"NONE",updatedAt:c.updatedAt||0};}
function broadcast(type,data){if(!clients.size)return;const msg=JSON.stringify({type,data,at:Date.now()});for(const ws of clients)if(ws.readyState===WebSocket.OPEN)ws.send(msg);}
function marketPayload(){return{coins:[...state.coins.values()].map(snapshot),status:state.status,liveMarkets:state.liveMarkets,progress:state.progress,oi:state.oi,refresh:"live ticks 15s · candles on close",updatedAt:Date.now()};}
function broadcastMarket(){if(clients.size)broadcast("market",marketPayload());}

/* ---- MEXC spot REST (paced) ----------------------------------------------------------------- */
let nextSlot=0;
async function pace(weight=1){for(;;){const now=Date.now();if(now<backoffUntil){await sleep(backoffUntil-now+250);continue;}const start=Math.max(nextSlot,now);nextSlot=start+weight*1000/RATE;if(start>now)await sleep(start-now);if(Date.now()>=backoffUntil)return;}}
async function get(path,weight=1){await pace(weight);const r=await fetch(BASE+path,{headers:{"user-agent":"NORDVEX-RSI-Screener/2.0"},signal:AbortSignal.timeout(15000)});
  if(r.status===429||r.status===418){const wait=Math.min(600,Math.max(10,Number(r.headers.get("retry-after"))||30));backoffUntil=Math.max(backoffUntil,Date.now()+wait*1000);throw new Error("MEXC API HTTP "+r.status+" — backing off "+wait+"s");}
  if(!r.ok)throw new Error("MEXC API HTTP "+r.status+" "+path);const d=await r.json();if(d&&d.code!==undefined&&d.code!==200)throw new Error("MEXC API "+d.code+": "+(d.msg||"request failed"));return d;}
function tickerMap(t){const price=num(t.lastPrice),quote=num(t.quoteVolume)||num(t.volume)*price;return{price,change24h:num(t.priceChangePercent)*100,quoteVolume:quote,high24h:num(t.highPrice),low24h:num(t.lowPrice)};}
function rankCoins(){[...state.coins.values()].sort((a,b)=>b.quoteVolume-a.quoteVolume).forEach((c,i)=>{c.rank=i;});}

async function refreshUniverse(){
  const info=await get("/api/v3/exchangeInfo",10),tickers=await get("/api/v3/ticker/24hr",40),stats=new Map(tickers.map(t=>[t.symbol,t]));
  state.universe=info.symbols.filter(s=>(s.status==="ENABLED"||s.status==="1"||s.status===1)&&s.quoteAsset==="USDT")
    .map(s=>({symbol:s.symbol,base:s.baseAsset,...tickerMap(stats.get(s.symbol)||{})}))
    .filter(x=>x.quoteVolume>MIN_VOLUME).sort((a,b)=>b.quoteVolume-a.quoteVolume);
  const previous=state.coins;state.coins=new Map();
  for(const x of state.universe.slice(0,MAX_COINS)){const old=previous.get(x.symbol);/* reuse the object so in-flight candle jobs keep writing to the live coin */
    if(old){Object.assign(old,x,{updatedAt:Date.now()});state.coins.set(x.symbol,old);}
    else state.coins.set(x.symbol,{...x,frames:{},openInterest:null,oiRank:null,updatedAt:Date.now(),divergence:"NONE"});}
  rankCoins();state.lastUpdate=Date.now();state.liveMarkets=state.coins.size;dirty=true;}
async function refreshTickers(){
  const rows=await get("/api/v3/ticker/24hr",40),stats=new Map(rows.map(t=>[t.symbol,t])),now=Date.now();
  for(const c of state.coins.values()){const t=stats.get(c.symbol);if(t){Object.assign(c,tickerMap(t),{updatedAt:now});applyTick(c,now);}}
  rankCoins();state.lastUpdate=now;broadcastMarket();}

/* ---- MEXC futures open interest ------------------------------------------------------------- */
async function futGet(path){const r=await fetch(FUT+path,{headers:{"user-agent":"NORDVEX-RSI-Screener/2.0"},signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error("MEXC futures HTTP "+r.status+" "+path);const d=await r.json();if(d.success===false||(d.code!==undefined&&d.code!==0&&d.code!==200))throw new Error("MEXC futures "+d.code+": "+(d.message||"request failed"));return d.data;}
async function refreshContracts(){const rows=await futGet("/api/v1/contract/detail"),arr=Array.isArray(rows)?rows:rows?[rows]:[],next=new Map();for(const r of arr){if(r.quoteCoin&&r.quoteCoin!=="USDT")continue;if(r.state!==undefined&&Number(r.state)!==0)continue;if(num(r.contractSize)>0)next.set(r.symbol,num(r.contractSize));}contractMeta=next;}
/* open interest (USD) = contracts held x contract size x fair price */
async function refreshOI(){
  if(!contractMeta.size)await refreshContracts();
  const rows=await futGet("/api/v1/contract/ticker"),arr=Array.isArray(rows)?rows:rows?[rows]:[];
  for(const c of state.coins.values()){c.openInterest=null;c.oiRank=null;}
  let matched=0;
  for(const r of arr){const sym=String(r.symbol||"");if(!sym.endsWith("_USDT"))continue;const c=state.coins.get(sym.replace("_","")),size=contractMeta.get(sym);if(!c||!size)continue;const oi=num(r.holdVol)*size*(num(r.fairPrice)||num(r.lastPrice)||c.price);if(oi>0){c.openInterest=oi;matched++;}}
  [...state.coins.values()].filter(c=>c.openInterest).sort((a,b)=>b.openInterest-a.openInterest).forEach((c,i)=>{c.oiRank=i+1;});
  state.oi={contracts:arr.length,matched,updatedAt:Date.now()};dirty=true;}

/* ---- candle scheduler ----------------------------------------------------------------------- */
function eligible(c,tf){const cap=FAST[tf];return cap===undefined||c.rank<cap;}
function computeProgress(){let total=0,loaded=0;for(const c of state.coins.values())for(const tf of LOAD_ORDER){if(!eligible(c,tf))continue;total++;if(c.frames[tf])loaded++;}state.progress={loaded,total,percent:total?Math.floor(loaded/total*100):0};}
function buildQueue(){
  const now=Date.now(),first=[],stale=[];
  for(const c of state.coins.values())LOAD_ORDER.forEach((tf,i)=>{if(!eligible(c,tf))return;const f=c.frames[tf],key=c.symbol+"|"+tf;if(inflight.has(key)||(retryAt.get(key)||0)>now)return;
    if(!f)first.push({c,tf,key,order:i*1e6+c.rank});else if(now>=f.nextAt)stale.push({c,tf,key,order:f.nextAt});});
  first.sort((a,b)=>a.order-b.order);stale.sort((a,b)=>a.order-b.order||a.c.rank-b.c.rank);
  return first.concat(stale);}
async function runJob({c,tf,key}){
  inflight.add(key);
  try{
    const old=calc(c,tf),prev=c.frames[tf]?.fetchedLast||0,rows=await get("/api/v3/klines?symbol="+c.symbol+"&interval="+REST_TF[tf]+"&limit=100");
    if(!Array.isArray(rows)||!rows.length){retryAt.set(key,Date.now()+600000);return;}
    setFrame(c,tf,rows.map(x=>num(x[0])),rows.map(x=>num(x[4])));
    const f=c.frames[tf],now=Date.now(),due=f.fetchedLast+TF_MS[tf]+2000;
    f.nextAt=due>now?due:now+TF_MS[tf]; // pairs that did not trade in the latest period are re-checked one period later
    if(tf==="4h"||tf==="1d")derive(c);
    if(tf==="4h"&&(!prev||f.fetchedLast>prev))c.divergence=detectDivergence(c);
    c.updatedAt=now;dirty=true;
    if(prev>0&&f.fetchedLast>prev){await notify(c,tf,old,calc(c,tf));if(c.quoteVolume>=state.alertRules.minVolume)broadcast("coin",{coin:snapshot(c),timeframe:tf,closed:true});}
  }catch(e){logErr(e);retryAt.set(key,Date.now()+30000);}
  finally{inflight.delete(key);}}
const queue=[];let lastBuild=0;
function nextJob(){if(!queue.length&&Date.now()-lastBuild>1000){queue.push(...buildQueue());lastBuild=Date.now();}
  for(let j=queue.shift();j;j=queue.shift())if(state.coins.get(j.c.symbol)===j.c&&!inflight.has(j.key))return j;return null;}
async function worker(){for(;;){const j=nextJob();if(!j){await sleep(500);continue;}await runJob(j);}}
function updateStatus(){const p=state.progress,fourH=[...state.coins.values()].filter(c=>c.frames["4h"]).length/(state.coins.size||1);
  state.status=p.total&&p.loaded>=p.total?"LIVE · REAL-TIME":fourH>=0.9?"LIVE · BACKFILL "+p.percent+"%":"LOADING RSI HISTORY "+p.percent+"%";}

/* ---- alerts --------------------------------------------------------------------------------- */
async function notify(c,tf,oldV,newV){if(oldV==null||newV==null)return;if(c.quoteVolume<state.alertRules.minVolume)return;const signal=state.alertRules.overbought&&oldV<70&&newV>=70?"OVERBOUGHT":state.alertRules.oversold&&oldV>30&&newV<=30?"OVERSOLD":null;if(!signal)return;const key=c.symbol+":"+tf+":"+signal,now=Date.now();if(now-(cooldown.get(key)||0)<1800000)return;cooldown.set(key,now);const message="NORDVEX RSI ALERT\n"+c.symbol+" · "+tf+"\n"+signal+" · RSI 14 "+newV.toFixed(1)+"\nPrice: "+c.price+"\nMEXC Spot public market data";const tasks=[];if(process.env.TELEGRAM_BOT_TOKEN&&process.env.TELEGRAM_CHAT_ID)tasks.push(fetch("https://api.telegram.org/bot"+process.env.TELEGRAM_BOT_TOKEN+"/sendMessage",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chat_id:process.env.TELEGRAM_CHAT_ID,text:message})}));if(process.env.WHATSAPP_ACCESS_TOKEN&&process.env.WHATSAPP_PHONE_NUMBER_ID&&process.env.WHATSAPP_TO)tasks.push(fetch("https://graph.facebook.com/v21.0/"+process.env.WHATSAPP_PHONE_NUMBER_ID+"/messages",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+process.env.WHATSAPP_ACCESS_TOKEN},body:JSON.stringify({messaging_product:"whatsapp",to:process.env.WHATSAPP_TO,type:"text",text:{body:message}})}));await Promise.allSettled(tasks);}

/* ---- HTTP API ------------------------------------------------------------------------------- */
app.get("/api/health",(_q,res)=>res.json({ok:true,service:"NORDVEX RSI Screener",status:state.status,coins:state.coins.size,listed:state.universe.length,liveMarkets:state.liveMarkets,progress:state.progress,openInterest:state.oi,rateLimit:{weightPerSecond:RATE,backoffSeconds:Math.max(0,Math.ceil((backoffUntil-Date.now())/1000))},refresh:"ticker every 15s drives live RSI; candles re-fetched on close (1m/5m for top "+FAST["1m"]+"/"+FAST["5m"]+" coins)",errors:state.errors.slice(-4),updatedAt:state.lastUpdate,source:"MEXC Spot + Futures public REST"}));
app.get("/api/config",(_q,res)=>res.json({telegramConfigured:!!(process.env.TELEGRAM_BOT_TOKEN&&process.env.TELEGRAM_CHAT_ID),alertRules:state.alertRules,whatsappConfigured:!!(process.env.WHATSAPP_ACCESS_TOKEN&&process.env.WHATSAPP_PHONE_NUMBER_ID&&process.env.WHATSAPP_TO),timeframes:TF,coinLimit:Number.isFinite(MAX_COINS)?MAX_COINS:"all",source:"MEXC Spot"}));
app.get("/api/market/universe",(_q,res)=>res.json({symbols:state.universe,updatedAt:state.lastUpdate,source:"MEXC Spot"}));
app.get("/api/market/snapshot",(_q,res)=>res.json({status:state.status,coins:[...state.coins.values()].map(snapshot),timeframes:TF,listed:state.universe.length,progress:state.progress,openInterest:state.oi,source:"MEXC Spot",updatedAt:Date.now()}));
app.get("/api/market/scan",(_q,res)=>res.json({data:[...state.coins.values()].flatMap(c=>TF.map(tf=>({symbol:c.symbol,timeframe:tf,rsi:calc(c,tf),close:c.price}))).filter(x=>x.rsi!=null),timeframes:TF,scannedSymbols:state.coins.size,totalSymbols:state.universe.length,updatedAt:Date.now(),source:"MEXC Spot REST + live ticker, Wilder RSI"}));
app.get("/api/backtest",async(req,res)=>{try{const symbol=String(req.query.symbol||"").toUpperCase();if(!/^[A-Z0-9]{4,24}$/.test(symbol))return res.status(400).json({error:"Invalid symbol."});const rows=await get("/api/v3/klines?symbol="+symbol+"&interval=4h&limit=500",2),closes=rows.map(x=>num(x[4])),values=closes.map((_,i)=>i<PERIOD?null:rsi(closes.slice(0,i+1)));let entry=null,trades=[];for(let i=PERIOD+1;i<values.length;i++){const p=values[i-1],v=values[i];if(p==null||v==null)continue;if(entry===null&&p<30&&v>=30)entry={price:closes[i],time:num(rows[i][0])};else if(entry&&v>=50){trades.push({entry:entry.price,exit:closes[i],returnPct:(closes[i]-entry.price)/entry.price*100,entryTime:entry.time,exitTime:num(rows[i][0])});entry=null;}}const wins=trades.filter(t=>t.returnPct>0).length,net=trades.reduce((a,t)=>a+t.returnPct,0);let equity=0,peak=0,maxDd=0;for(const t of trades){equity+=t.returnPct;peak=Math.max(peak,equity);maxDd=Math.max(maxDd,peak-equity);}res.json({symbol,timeframe:"4h",period:14,historyBars:rows.length,trades:trades.length,wins,losses:trades.length-wins,winRate:trades.length?wins/trades.length*100:null,netReturnPct:net,maxDrawdownPct:maxDd,latestTrades:trades.slice(-8).reverse(),method:"Educational RSI-14 illustration: cross back above 30, exit at 50.",disclaimer:"Historical illustration only; excludes fees and slippage. Not a prediction or recommendation."});}catch(e){res.status(502).json({error:e.message});}});
app.post("/api/alerts/rules",(req,res)=>{const r=req.body||{};state.alertRules={overbought:!!r.overbought,oversold:!!r.oversold,confluence:!!r.confluence,minVolume:Math.max(0,num(r.minVolume))};res.json({ok:true,alertRules:state.alertRules});});
app.post("/api/alerts/test",async(req,res)=>{const channel=req.body?.channel;try{if(channel==="telegram"){if(!process.env.TELEGRAM_BOT_TOKEN||!process.env.TELEGRAM_CHAT_ID)return res.status(400).json({error:"Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in Railway Variables."});const r=await fetch("https://api.telegram.org/bot"+process.env.TELEGRAM_BOT_TOKEN+"/sendMessage",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chat_id:process.env.TELEGRAM_CHAT_ID,text:"NORDVEX RSI Screener test alert — Telegram connected."})});const d=await r.json();if(!r.ok||!d.ok)throw Error(d.description||"Telegram rejected message");return res.json({ok:true,message:"Telegram test delivered."});}if(channel==="whatsapp"){const{WHATSAPP_ACCESS_TOKEN,WHATSAPP_PHONE_NUMBER_ID,WHATSAPP_TO}=process.env;if(!WHATSAPP_ACCESS_TOKEN||!WHATSAPP_PHONE_NUMBER_ID||!WHATSAPP_TO)return res.status(400).json({error:"Set WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_TO in Railway Variables."});const r=await fetch("https://graph.facebook.com/v21.0/"+WHATSAPP_PHONE_NUMBER_ID+"/messages",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+WHATSAPP_ACCESS_TOKEN},body:JSON.stringify({messaging_product:"whatsapp",to:WHATSAPP_TO,type:"text",text:{body:"NORDVEX RSI Screener test alert — WhatsApp connected."}})});const d=await r.json();if(!r.ok)throw Error(d.error?.message||"WhatsApp rejected message");return res.json({ok:true,message:"WhatsApp test accepted."});}res.status(400).json({error:"Select Telegram or WhatsApp."});}catch(e){res.status(502).json({error:e.message});}});
app.post("/api/alerts/notify",async(req,res)=>{const{symbol,timeframe,rsi:value,signal}=req.body||{};if(!symbol||!timeframe||!Number.isFinite(Number(value))||!["OVERBOUGHT","OVERSOLD","CONFLUENCE"].includes(signal))return res.status(400).json({error:"Invalid alert."});const message="NORDVEX RSI ALERT\n"+symbol+" · "+timeframe+"\n"+signal+" · RSI 14 "+Number(value).toFixed(1);const tasks=[];if(process.env.TELEGRAM_BOT_TOKEN&&process.env.TELEGRAM_CHAT_ID)tasks.push(fetch("https://api.telegram.org/bot"+process.env.TELEGRAM_BOT_TOKEN+"/sendMessage",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chat_id:process.env.TELEGRAM_CHAT_ID,text:message})}));if(process.env.WHATSAPP_ACCESS_TOKEN&&process.env.WHATSAPP_PHONE_NUMBER_ID&&process.env.WHATSAPP_TO)tasks.push(fetch("https://graph.facebook.com/v21.0/"+process.env.WHATSAPP_PHONE_NUMBER_ID+"/messages",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+process.env.WHATSAPP_ACCESS_TOKEN},body:JSON.stringify({messaging_product:"whatsapp",to:process.env.WHATSAPP_TO,type:"text",text:{body:message}})}));if(!tasks.length)return res.status(400).json({error:"Notification credentials are not configured."});const results=await Promise.allSettled(tasks);res.json({ok:results.some(x=>x.status==="fulfilled"&&x.value.ok)});});
server.on("upgrade",(req,socket,head)=>{if(req.url!=="/ws")return socket.destroy();wss.handleUpgrade(req,socket,head,ws=>wss.emit("connection",ws,req));});
wss.on("connection",ws=>{ws.send(JSON.stringify({type:"hello",data:{status:state.status,coins:state.coins.size,listed:state.universe.length}}));if(state.coins.size)ws.send(JSON.stringify({type:"market",data:marketPayload()}));});

/* ---- boot ----------------------------------------------------------------------------------- */
const every=(ms,fn)=>setInterval(()=>fn().catch(logErr),ms);
server.listen(PORT,"0.0.0.0",async()=>{
  console.log("NORDVEX RSI Screener listening on "+PORT);
  for(;;){try{state.status="LOADING UNIVERSE";await refreshUniverse();break;}catch(e){state.status="DEGRADED";logErr(e);console.error("Universe load failed, retrying in 20s:",e.message);await sleep(20000);}}
  console.log("Universe ready:",state.coins.size,"coins /",state.universe.length,"listed USDT pairs");
  state.status="LOADING RSI HISTORY 0%";
  refreshContracts().then(refreshOI).catch(logErr);
  every(20000,refreshOI);every(3600000,refreshContracts);
  every(15000,refreshTickers);every(3600000,refreshUniverse);
  setInterval(()=>{computeProgress();updateStatus();if(state.progress.loaded<state.progress.total)broadcast("progress",{...state.progress,done:state.progress.loaded,status:state.status});},3000);
  setInterval(()=>{if(dirty){dirty=false;broadcastMarket();}},5000);
  for(let i=0;i<4;i++)worker();
});
