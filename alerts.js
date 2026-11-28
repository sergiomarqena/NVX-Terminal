/* Custom alert engine: user-defined RSI rules (+ optional volume filter), evaluated server-side so they fire
   while the phone is locked. Delivery: Telegram, Web Push (installed web-app notifications) and the open page.
   Rules, push subscriptions and the recent-alert log live in DATA_DIR/alerts.json. Every management endpoint
   needs the ALERT_PIN (the site itself is public, so nobody else may create rules or message your Telegram). */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import * as webpush from "web-push";

const VOL_TFS=["1m","5m","15m","1h","4h","1d","1w"];
const SCOPES=["all","oi50","oi100","oi200","top60","symbols"];
const clamp=(v,a,b,d)=>{v=Number(v);return Number.isFinite(v)?Math.min(b,Math.max(a,v)):d;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const fmtPrice=p=>!(p>0)?"—":p>=100?p.toFixed(2):p>=1?p.toFixed(4):String(+p.toPrecision(4));

export function createAlerts(ctx){
  const{app,coins,calc,rsi,TF,TF_MS,klines,broadcast,logErr,ready}=ctx;
  const DIR=process.env.DATA_DIR||process.env.RAILWAY_VOLUME_MOUNT_PATH||path.join(process.cwd(),"data"),FILE=path.join(DIR,"alerts.json");
  const durable=!!(process.env.DATA_DIR||process.env.RAILWAY_VOLUME_MOUNT_PATH);
  const SITE=(process.env.PUBLIC_URL||(process.env.RAILWAY_PUBLIC_DOMAIN?"https://"+process.env.RAILWAY_PUBLIC_DOMAIN:"")).replace(/\/$/,"");
  const TG_API=(process.env.TELEGRAM_API_URL||"https://api.telegram.org").replace(/\/$/,"");
  let db={rules:[],subs:[],log:[],vapid:null};
  try{const d=JSON.parse(fs.readFileSync(FILE,"utf8"));db={...db,...d,rules:d.rules||[],subs:d.subs||[],log:d.log||[]};}catch{}
  let saveT=null;
  function save(){if(saveT)return;saveT=setTimeout(()=>{saveT=null;try{fs.mkdirSync(DIR,{recursive:true});const tmp=FILE+".tmp";fs.writeFileSync(tmp,JSON.stringify(db));fs.renameSync(tmp,FILE);}catch(e){logErr(e);}},300);}

  /* ---- web push keys --------------------------------------------------------------------------- */
  let vapid=process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY?{publicKey:process.env.VAPID_PUBLIC_KEY.trim(),privateKey:process.env.VAPID_PRIVATE_KEY.trim()}:db.vapid;
  if(!vapid){vapid=webpush.generateVAPIDKeys();db.vapid=vapid;save();console.warn("VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set: generated temporary keys (push subscriptions break on every redeploy). Set them in Railway Variables.");}
  let pushOk=true;
  try{webpush.setVapidDetails(process.env.VAPID_SUBJECT||SITE||"mailto:alerts@nordvex.local",vapid.publicKey,vapid.privateKey);}catch(e){pushOk=false;logErr(e);}

  /* ---- delivery -------------------------------------------------------------------------------- */
  const last={telegram:null,whatsapp:null,push:null};
  const stamp=(ch,ok,error)=>{last[ch]={ok,error:error||null,at:Date.now()};};
  const tgConfigured=()=>!!(process.env.TELEGRAM_BOT_TOKEN&&process.env.TELEGRAM_CHAT_ID);
  const waConfigured=()=>!!(process.env.WHATSAPP_ACCESS_TOKEN&&process.env.WHATSAPP_PHONE_NUMBER_ID&&process.env.WHATSAPP_TO);
  async function sendTelegram(text){
    if(!tgConfigured())throw Error("Telegram is not configured: set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in Railway Variables.");
    const token=process.env.TELEGRAM_BOT_TOKEN.trim(),chat=process.env.TELEGRAM_CHAT_ID.trim();
    try{
      const r=await fetch(TG_API+"/bot"+token+"/sendMessage",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chat_id:chat,text,disable_web_page_preview:true}),signal:AbortSignal.timeout(12000)});
      const d=await r.json().catch(()=>({}));
      if(!r.ok||!d.ok){let m=d.description||("Telegram HTTP "+r.status);
        if(/chat not found/i.test(m))m+=" — open your bot in Telegram, press Start, and check TELEGRAM_CHAT_ID is YOUR chat id (not the bot's).";
        else if(r.status===401||r.status===404)m+=" — the TELEGRAM_BOT_TOKEN looks wrong.";
        throw Error(m);}
      stamp("telegram",true);
    }catch(e){stamp("telegram",false,e.message);throw e;}
  }
  async function sendWhatsApp(text){
    if(!waConfigured())throw Error("WhatsApp is not configured.");
    try{const r=await fetch("https://graph.facebook.com/v21.0/"+process.env.WHATSAPP_PHONE_NUMBER_ID+"/messages",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+process.env.WHATSAPP_ACCESS_TOKEN},body:JSON.stringify({messaging_product:"whatsapp",to:process.env.WHATSAPP_TO,type:"text",text:{body:text}}),signal:AbortSignal.timeout(12000)});
      const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error?.message||"WhatsApp HTTP "+r.status);stamp("whatsapp",true);}
    catch(e){stamp("whatsapp",false,e.message);throw e;}
  }
  async function sendPush(payload,only){
    if(!pushOk)throw Error("Web push is not available (invalid VAPID keys).");
    const body=JSON.stringify(payload),targets=only?db.subs.filter(s=>s.endpoint===only):db.subs,dead=[];let ok=0,lastErr=null;
    await Promise.all(targets.map(async s=>{try{await webpush.sendNotification({endpoint:s.endpoint,keys:s.keys},body,{TTL:3600,urgency:"high"});ok++;}catch(e){if(e.statusCode===404||e.statusCode===410)dead.push(s.endpoint);else lastErr=e;}}));
    if(dead.length){db.subs=db.subs.filter(s=>!dead.includes(s.endpoint));save();}
    if(targets.length)stamp("push",ok>0,ok>0?null:(lastErr?lastErr.message:"subscription expired"));
    return{ok,total:targets.length,removed:dead.length};
  }

  /* ---- rules ----------------------------------------------------------------------------------- */
  const describe=r=>r.tf+" RSI "+(r.op==="above"?"crosses above ":r.op==="below"?"crosses below ":"crosses ")+r.level+(r.mode==="close"?" · bar close":" · live")+(r.vol.on?" · vol > "+(r.vol.mult!==1?r.vol.mult+"× ":"")+"avg("+r.vol.len+") "+r.vol.tf:"");
  function clean(b,id){
    b=b||{};const tf=String(b.tf||"");if(!TF.includes(tf))throw Error("Pick a timeframe.");
    const level=Number(b.level);if(!(level>0&&level<100))throw Error("RSI level must be between 1 and 99.");
    const scope=SCOPES.includes(b.scope)?b.scope:"all";let symbols=[];
    if(scope==="symbols"){symbols=String(Array.isArray(b.symbols)?b.symbols.join(","):b.symbols||"").toUpperCase().split(/[\s,;]+/).map(s=>s.replace(/[^A-Z0-9]/g,"")).map(s=>s.length>4&&s.endsWith("USDT")?s.slice(0,-4):s).filter(Boolean).slice(0,100);if(!symbols.length)throw Error("Enter at least one coin, e.g. BTC, ETH, SOL.");}
    const v=b.vol||{},r={id:id||crypto.randomBytes(5).toString("hex"),enabled:b.enabled!==false,tf,op:["above","below","either"].includes(b.op)?b.op:"above",level:+level.toFixed(2),
      mode:b.mode==="close"?"close":"live",scope,symbols,minQuoteVolume:clamp(b.minQuoteVolume,0,1e12,0),cooldownMin:Math.round(clamp(b.cooldownMin,1,1440,30)),
      vol:{on:!!v.on,tf:VOL_TFS.includes(v.tf)?v.tf:(VOL_TFS.includes(tf)?tf:"1h"),len:Math.round(clamp(v.len,2,200,20)),mult:+clamp(v.mult,.1,20,1).toFixed(2)},
      channels:{telegram:b.channels?.telegram!==false,push:b.channels?.push!==false,whatsapp:!!b.channels?.whatsapp},createdAt:Date.now()};
    r.name=String(b.name||"").trim().slice(0,40)||describe(r);return r;
  }
  function forget(id){for(const k of mem.keys())if(k.startsWith(id+"|"))mem.delete(k);for(const k of cool.keys())if(k.startsWith(id+"|"))cool.delete(k);}
  const inScope=(r,c,set)=>r.scope==="all"?true:r.scope==="top60"?c.rank<60:r.scope==="symbols"?set.has(c.base)||set.has(c.symbol):!!(c.oiRank&&c.oiRank<=Number(r.scope.slice(2)));

  /* ---- evaluation ------------------------------------------------------------------------------ */
  const mem=new Map(),cool=new Map();
  const rv=x=>x==null?null:Math.round(x*10)/10;
  const crossed=(r,p,v)=>(r.op!=="below"&&p<r.level&&v>=r.level)?"up":(r.op!=="above"&&p>r.level&&v<=r.level)?"down":null;
  /* called after every ticker refresh (15s) */
  function evaluate(){
    if(!ready()||!db.rules.some(r=>r.enabled))return;
    const now=Date.now(),all=[...coins().values()];
    for(const r of db.rules){if(!r.enabled)continue;const set=new Set(r.symbols),hits=[];
      for(const c of all){
        if(!inScope(r,c,set)||(c.quoteVolume||0)<r.minQuoteVolume)continue;
        const f=c.frames[r.tf];if(!f||!f.closes||!f.closes.length)continue;
        const key=r.id+"|"+c.symbol,st=mem.get(key);
        if(r.mode==="live"){
          const v=calc(c,r.tf);if(v==null)continue;
          if(!st){mem.set(key,{v});continue;}
          const p=st.v;st.v=v;const dir=crossed(r,p,v);if(dir)hits.push({c,dir,v,p});
        }else{
          const barT=f.times[f.times.length-1];
          if(!st){mem.set(key,{barT});continue;}
          if(st.barT===barT)continue;
          if(!f.tick&&(f.synth||0)>0&&now-barT<45000)continue; /* wait for the real candle of the bar that just closed */
          st.barT=barT;const cl=f.closes;if(cl.length<17)continue;
          const v=rv(rsi(cl.slice(0,-1))),p=rv(rsi(cl.slice(0,-2)));if(v==null||p==null)continue;
          const dir=crossed(r,p,v);if(dir)hits.push({c,dir,v,p});
        }
      }
      if(hits.length)handleHits(r,hits).catch(logErr);
    }
  }
  /* a restored/refreshed candle series must not look like a fresh crossing */
  function reseed(symbol,tf){for(const r of db.rules)if(r.tf===tf)mem.delete(r.id+"|"+symbol);}

  let active=0;const waiters=[];
  async function limited(fn){if(waiters.length>200)throw Error("volume checks busy");if(active>=4)await new Promise(res=>waiters.push(res));active++;try{return await fn();}finally{active--;const w=waiters.shift();if(w)w();}}
  /* volume filter: the last CLOSED bar of the chosen timeframe must exceed mult x SMA(len) of volume (same maths as the chart's MA line) */
  async function volCheck(symbol,v){
    const rows=await limited(()=>klines(symbol,v.tf,v.len+4)),ms=TF_MS[v.tf],now=Date.now(),closed=rows.candles.filter(x=>x[0]+ms<=now);
    if(closed.length<v.len)return{ok:false,reason:"not enough history"};
    const bar=closed[closed.length-1],win=closed.slice(-v.len),avg=win.reduce((a,x)=>a+x[5],0)/v.len;
    return{ok:avg>0&&bar[5]>v.mult*avg,ratio:avg>0?bar[5]/avg:0,volume:bar[5],avg};
  }
  async function handleHits(r,found){
    const now=Date.now(),hits=[];
    const fresh=found.filter(h=>now-(cool.get(r.id+"|"+h.c.symbol)||0)>=r.cooldownMin*60000);
    const checked=await Promise.all(fresh.map(async h=>{if(!r.vol.on)return h;try{const x=await volCheck(h.c.symbol,r.vol);if(!x.ok)return null;h.vol=x;return h;}catch(e){logErr(e);return null;}}));
    for(const h of checked)if(h){cool.set(r.id+"|"+h.c.symbol,Date.now());hits.push(h);}
    if(!hits.length)return;
    hits.sort((a,b)=>(b.c.quoteVolume||0)-(a.c.quoteVolume||0));
    const items=hits.map(h=>({symbol:h.c.symbol,base:h.c.base,price:h.c.price,change24h:h.c.change24h,rsi:h.v,prev:h.p,dir:h.dir,tf:r.tf,level:r.level,volRatio:h.vol?+h.vol.ratio.toFixed(2):null}));
    for(const it of items.slice(0,40)){db.log.unshift({at:Date.now(),rule:r.name,...it});}
    db.log.length=Math.min(db.log.length,80);save();
    broadcast("alert",{rule:r.name,tf:r.tf,items:items.slice(0,10),total:items.length});
    const digest=items.length>3,texts=digest?[digestText(r,items)]:items.map(it=>oneText(r,it)),pushes=digest?[digestPush(r,items)]:items.map(it=>onePush(r,it));
    if(r.channels.telegram&&tgConfigured())(async()=>{for(const t of texts){try{await sendTelegram(t);}catch(e){logErr(e);}await sleep(500);}})();
    if(r.channels.whatsapp&&waConfigured())sendWhatsApp(texts[0]).catch(logErr);
    if(r.channels.push&&db.subs.length)(async()=>{for(const p of pushes){try{await sendPush(p);}catch(e){logErr(e);}}})();
  }
  const dirWord=it=>it.dir==="up"?"↑":"↓";
  function oneText(r,it){return["🔔 NORDVEX · "+it.base+"/USDT",it.tf+" RSI "+dirWord(it)+" "+it.level+"  →  "+it.rsi.toFixed(1),"Price "+fmtPrice(it.price)+" · 24h "+(it.change24h>=0?"+":"")+(+it.change24h||0).toFixed(2)+"%",
    it.volRatio!=null?"Volume ✓ "+r.vol.tf+" bar "+it.volRatio.toFixed(2)+"× its "+r.vol.len+"-bar average":null,"Rule: "+r.name,SITE?SITE+"/?coin="+it.symbol:null].filter(Boolean).join("\n");}
  function digestText(r,items){return["🔔 NORDVEX · "+items.length+" coins · "+r.name,...items.slice(0,25).map(it=>"• "+it.base+"  "+it.rsi.toFixed(1)+" "+dirWord(it)+"  "+fmtPrice(it.price)+(it.volRatio!=null?"  vol "+it.volRatio.toFixed(1)+"×":"")),items.length>25?"+ "+(items.length-25)+" more":null,SITE||null].filter(Boolean).join("\n");}
  const onePush=(r,it)=>({title:"NORDVEX · "+it.base+"/USDT",body:it.tf+" RSI "+dirWord(it)+" "+it.level+" → "+it.rsi.toFixed(1)+" · "+fmtPrice(it.price)+(it.volRatio!=null?" · vol "+it.volRatio.toFixed(1)+"× avg":""),tag:r.id+":"+it.symbol,url:"/?coin="+it.symbol});
  const digestPush=(r,items)=>({title:"NORDVEX · "+items.length+" coins · "+r.name,body:items.slice(0,6).map(it=>it.base+" "+it.rsi.toFixed(0)).join(", ")+(items.length>6?" +"+(items.length-6)+" more":""),tag:r.id+":digest",url:"/"});

  /* ---- HTTP ------------------------------------------------------------------------------------ */
  const fails=new Map();
  function auth(req,res,next){
    const pin=process.env.ALERT_PIN;if(!pin)return res.status(503).json({error:"Alerts are locked: set ALERT_PIN in Railway Variables.",locked:true});
    const ip=req.ip||"?",now=Date.now(),f=fails.get(ip);
    if(f&&now<f.reset&&f.n>=8)return res.status(429).json({error:"Too many wrong PIN attempts — try again in a few minutes."});
    const a=Buffer.from(String(req.get("x-alert-pin")||"")),b=Buffer.from(pin);
    if(!(a.length===b.length&&crypto.timingSafeEqual(a,b))){const g=f&&now<f.reset?f:{n:0,reset:now+600000};g.n++;fails.set(ip,g);return res.status(401).json({error:"Wrong PIN.",pinRequired:true});}
    fails.delete(ip);next();
  }
  setInterval(()=>{const n=Date.now();for(const[k,v]of fails)if(n>v.reset)fails.delete(k);},60000).unref();
  const status=()=>({rules:db.rules,log:db.log.slice(0,40),telegram:{configured:tgConfigured(),last:last.telegram},whatsapp:{configured:waConfigured(),last:last.whatsapp},push:{subscribers:db.subs.length,last:last.push,ok:pushOk},durable,ready:ready(),site:SITE});
  app.get("/api/push/key",(_q,res)=>res.json({key:vapid.publicKey}));
  app.get("/api/alerts",auth,(_q,res)=>res.json(status()));
  app.post("/api/alerts/rules",auth,(req,res)=>{try{if(db.rules.length>=30)throw Error("Maximum 30 alerts — delete one first.");const r=clean(req.body);db.rules.push(r);save();res.json({ok:true,rule:r,...status()});}catch(e){res.status(400).json({error:e.message});}});
  app.put("/api/alerts/rules/:id",auth,(req,res)=>{try{const i=db.rules.findIndex(r=>r.id===req.params.id);if(i<0)return res.status(404).json({error:"Alert not found."});const old=db.rules[i],b=req.body||{};
    /* a bare {enabled} body just toggles; anything else replaces the rule */
    const r=Object.keys(b).length===1&&"enabled" in b?{...old,enabled:!!b.enabled}:{...clean(b,old.id),createdAt:old.createdAt};forget(old.id);db.rules[i]=r;save();res.json({ok:true,rule:r,...status()});}catch(e){res.status(400).json({error:e.message});}});
  app.delete("/api/alerts/rules/:id",auth,(req,res)=>{const n=db.rules.length;db.rules=db.rules.filter(r=>r.id!==req.params.id);forget(req.params.id);save();res.json({ok:db.rules.length<n,...status()});});
  /* after a redeploy without a volume the file is gone: the browser re-sends its backup copy of the rules */
  app.post("/api/alerts/restore",auth,(req,res)=>{try{if(db.rules.length)return res.json({ok:true,restored:0,...status()});const list=Array.isArray(req.body?.rules)?req.body.rules.slice(0,30):[];let n=0;for(const x of list){try{db.rules.push({...clean(x),enabled:x.enabled!==false});n++;}catch{}}if(n)save();res.json({ok:true,restored:n,...status()});}catch(e){res.status(400).json({error:e.message});}});
  app.post("/api/alerts/test",auth,async(req,res)=>{
    const ch=req.body?.channel;
    try{
      if(ch==="telegram"){await sendTelegram("✅ NORDVEX test alert — Telegram is connected.");return res.json({ok:true,message:"Telegram test delivered — check your chat."});}
      if(ch==="whatsapp"){await sendWhatsApp("NORDVEX test alert — WhatsApp connected.");return res.json({ok:true,message:"WhatsApp test accepted."});}
      if(ch==="push"){if(!db.subs.length)return res.status(400).json({error:"No device is subscribed yet — tap “Enable notifications on this device” first."});
        const r=await sendPush({title:"NORDVEX test",body:"Notifications are working on this device ✅",tag:"nvx-test",url:"/"},req.body?.endpoint);
        if(!r.total)return res.status(400).json({error:"This device is not subscribed — tap “Enable notifications on this device”."});
        if(!r.ok)return res.status(502).json({error:last.push?.error||"The push service rejected the message."});
        return res.json({ok:true,message:"Test notification sent to "+r.ok+" device"+(r.ok>1?"s":"")+"."});}
      res.status(400).json({error:"Unknown channel."});
    }catch(e){res.status(502).json({error:e.message});}});
  app.post("/api/push/subscribe",auth,(req,res)=>{const s=req.body?.subscription||{};
    if(typeof s.endpoint!=="string"||!/^https:\/\//.test(s.endpoint)||s.endpoint.length>800||typeof s.keys?.p256dh!=="string"||typeof s.keys?.auth!=="string")return res.status(400).json({error:"Invalid push subscription."});
    const rec={endpoint:s.endpoint,keys:{p256dh:s.keys.p256dh,auth:s.keys.auth},ua:String(req.get("user-agent")||"").slice(0,120),at:Date.now()},i=db.subs.findIndex(x=>x.endpoint===s.endpoint);
    if(i>=0)db.subs[i]=rec;else{if(db.subs.length>=20)db.subs.shift();db.subs.push(rec);}save();res.json({ok:true,subscribers:db.subs.length});});
  app.post("/api/push/unsubscribe",auth,(req,res)=>{db.subs=db.subs.filter(x=>x.endpoint!==req.body?.endpoint);save();res.json({ok:true,subscribers:db.subs.length});});

  return{evaluate,reseed,status};
}
