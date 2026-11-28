/* Alert center: PIN unlock, delivery status (Telegram / this device), custom alert builder and recent alerts. */
(()=>{
const $=id=>document.getElementById(id);
const TFS=["1m","5m","15m","1h","4h","12h","1d","2d","3d","1w"],VTFS=["1m","5m","15m","1h","4h","1d","1w"];
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const opts=(list,sel)=>list.map(v=>'<option'+(v===sel?" selected":"")+">"+v+"</option>").join("");
const SCOPE={all:"All coins",oi50:"OI Top 50",oi100:"OI Top 100",oi200:"OI Top 200",top60:"Top 60 volume",symbols:"Specific coins"};
let pin="",data=null,editing=null,msg="",msgOk=true;
try{pin=localStorage.getItem("nvx-pin")||"";}catch{}
const root=()=>$("al-root");

async function api(path,method="GET",body){
  const r=await fetch(path,{method,headers:{"content-type":"application/json","x-alert-pin":pin},body:body?JSON.stringify(body):undefined}),d=await r.json().catch(()=>({}));
  if(!r.ok){const e=Error(d.error||"Request failed");e.status=r.status;e.locked=!!d.locked;throw e;}return d;}
function setMsg(t,ok=true){msg=t;msgOk=ok;const m=$("al-msg");if(m){m.textContent=t;m.className="al-msg "+(t?(ok?"ok":"bad"):"");}}
function backup(){try{if(data)localStorage.setItem("nvx-alert-backup",JSON.stringify(data.rules));}catch{}}

async function load(){
  root().innerHTML='<p class="muted">Loading…</p>';
  if(!pin)return renderLogin();
  try{data=await api("/api/alerts");}
  catch(e){if(e.status===401){pin="";try{localStorage.removeItem("nvx-pin");}catch{}return renderLogin(e.message);}return renderLogin(e.message,e.locked);}
  if(!data.rules.length){try{const b=JSON.parse(localStorage.getItem("nvx-alert-backup")||"[]");if(b.length){const r=await api("/api/alerts/restore","POST",{rules:b});data=r;if(r.restored)msg="Restored "+r.restored+" alert"+(r.restored>1?"s":"")+" from this device after a server restart.";}}catch{}}
  backup();render();}

function renderLogin(err,locked){
  root().innerHTML='<p class="muted">'+(locked?"Alerts are locked on the server: add an <b>ALERT_PIN</b> variable in Railway.":"Enter your alert PIN (the <b>ALERT_PIN</b> variable in Railway) to manage alerts from this device. Only you can create alerts or send Telegram messages.")+'</p>'+
    (locked?"":'<div class="al-line"><input id="al-pin" type="password" placeholder="Alert PIN" autocomplete="current-password" autocapitalize="off"><button class="btn primary" id="al-login">Unlock</button></div>')+'<div id="al-msg" class="al-msg'+(err?" bad":"")+'">'+esc(err||"")+"</div>";
  const go=async()=>{pin=($("al-pin").value||"").trim();if(!pin)return;try{localStorage.setItem("nvx-pin",pin);}catch{}load();};
  if($("al-login")){$("al-login").onclick=go;$("al-pin").onkeydown=e=>{if(e.key==="Enter")go();};}}

function ruleLine(r){
  const cond=r.tf+" RSI "+(r.op==="above"?"↑ crosses above ":r.op==="below"?"↓ crosses below ":"crosses ")+r.level+" · "+(r.mode==="close"?"on bar close":"live");
  const parts=[SCOPE[r.scope]+(r.scope==="symbols"?" ("+r.symbols.slice(0,6).join(", ")+(r.symbols.length>6?"…":"")+")":""),r.minQuoteVolume?"vol ≥ $"+Number(r.minQuoteVolume).toLocaleString():null,
    r.vol.on?"volume ≥ "+(r.vol.mult!==1?r.vol.mult+"× ":"")+"avg("+r.vol.len+") on "+r.vol.tf:null,"cooldown "+r.cooldownMin+"m",
    [r.channels.telegram?"Telegram":null,r.channels.push?"notification":null,r.channels.whatsapp?"WhatsApp":null].filter(Boolean).join(" + ")||"in-page only"].filter(Boolean);
  return{cond,sub:parts.join(" · ")};}

function deliveryHtml(){
  const t=data.telegram,p=data.push,sup=window.NvxPWA?NvxPWA.support():{ok:false,why:"Loading…"};
  const last=x=>x&&x.at?(x.ok?"last send OK ":"last send FAILED: "+esc(x.error)+" ")+new Date(x.at).toLocaleTimeString():"";
  return '<div class="al-card"><div class="alert-row"><div><b>Telegram</b><small>'+(t.configured?"Configured · "+(last(t.last)||"no alert sent yet"):"Not configured — set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in Railway")+'</small></div><button class="btn" id="al-test-tg"'+(t.configured?"":" disabled")+'>Send test</button></div>'+
    '<div class="alert-row"><div><b>Notifications on this device</b><small id="al-push-state">'+(sup.ok?(p.subscribers+" device"+(p.subscribers===1?"":"s")+" subscribed"):esc(sup.why))+(p.last&&p.last.at&&!p.last.ok?" · last push failed: "+esc(p.last.error):"")+'</small></div><span class="al-btns"><button class="btn" id="al-push-on"'+(sup.ok?"":" disabled")+'>Enable</button><button class="btn" id="al-push-test">Test</button></span></div>'+
    (window.NvxPWA&&!NvxPWA.standalone()?'<div class="alert-row"><div><b>Install as an app</b><small>'+(NvxPWA.isIOS?"Share ▸ Add to Home Screen (needed for iPhone notifications)":"Adds NORDVEX to your home screen / desktop")+'</small></div><button class="btn" id="al-install">'+(NvxPWA.isIOS?"How?":"Install")+'</button></div>':"")+
    (data.durable?"":'<p class="muted tiny">Alerts are stored on the server’s disk and re-sent from this device after every redeploy, so open this panel once after an update. A Railway Volume (variable DATA_DIR) makes them permanent.</p>')+"</div>";}

function formHtml(r){
  r=r||{tf:"5m",op:"above",level:80,mode:"live",scope:"all",symbols:[],minQuoteVolume:100000,cooldownMin:30,vol:{on:false,tf:"5m",len:20,mult:1},channels:{telegram:true,push:true},name:""};
  return '<form id="al-form" class="al-form" autocomplete="off"><h3>'+(editing?"Edit alert":"New alert")+'</h3>'+
  '<label>Name (optional)<input id="f-name" maxlength="40" placeholder="e.g. 5m pump scanner" value="'+esc(r.name&&r.name!==ruleDefaultName(r)?r.name:"")+'"></label>'+
  '<div class="al-grid"><label>RSI timeframe<select id="f-tf">'+opts(TFS,r.tf)+'</select></label>'+
  '<label>Condition<select id="f-op"><option value="above"'+(r.op==="above"?" selected":"")+'>RSI crosses above</option><option value="below"'+(r.op==="below"?" selected":"")+'>RSI crosses below</option><option value="either"'+(r.op==="either"?" selected":"")+'>Crosses either way</option></select></label>'+
  '<label>RSI level<input id="f-level" type="number" min="1" max="99" step="0.1" inputmode="decimal" value="'+r.level+'"></label>'+
  '<label>Trigger<select id="f-mode"><option value="live"'+(r.mode==="live"?" selected":"")+'>Live — the moment it hits</option><option value="close"'+(r.mode==="close"?" selected":"")+'>Bar close — confirmed</option></select></label>'+
  '<label>Coins<select id="f-scope">'+Object.entries(SCOPE).map(([k,v])=>'<option value="'+k+'"'+(r.scope===k?" selected":"")+">"+v+"</option>").join("")+'</select></label>'+
  '<label id="f-sym-wrap"'+(r.scope==="symbols"?"":" hidden")+'>Coin list<input id="f-symbols" placeholder="BTC, ETH, SOL" value="'+esc((r.symbols||[]).join(", "))+'"></label>'+
  '<label>Min 24h volume ($)<input id="f-minvol" type="number" min="0" inputmode="numeric" value="'+r.minQuoteVolume+'"></label>'+
  '<label>Cooldown per coin (min)<input id="f-cool" type="number" min="1" max="1440" inputmode="numeric" value="'+r.cooldownMin+'"></label></div>'+
  '<label class="al-check"><input type="checkbox" id="f-vol"'+(r.vol.on?" checked":"")+'> <span><b>Volume filter</b> — only alert when the last <em>closed</em> bar’s volume is above its average</span></label>'+
  '<div class="al-grid" id="f-vol-box"'+(r.vol.on?"":" hidden")+'><label>Volume timeframe<select id="f-voltf">'+opts(VTFS,r.vol.tf)+'</select></label><label>Average of last (bars)<input id="f-vollen" type="number" min="2" max="200" inputmode="numeric" value="'+r.vol.len+'"></label><label>Bar must be ≥ (× avg)<input id="f-volmult" type="number" min="0.1" max="20" step="0.1" inputmode="decimal" value="'+r.vol.mult+'"></label></div>'+
  '<div class="al-checks"><span>Send to</span><label><input type="checkbox" id="f-tg"'+(r.channels.telegram?" checked":"")+'> Telegram</label><label><input type="checkbox" id="f-push"'+(r.channels.push?" checked":"")+'> Notification</label></div>'+
  '<div class="al-line"><button class="btn primary" id="f-save" type="submit">'+(editing?"Save changes":"Save alert")+'</button>'+(editing?'<button type="button" class="btn" id="f-cancel">Cancel</button>':"")+"</div></form>";}
const ruleDefaultName=r=>r.tf+" RSI "+(r.op==="above"?"crosses above ":r.op==="below"?"crosses below ":"crosses ")+r.level+(r.mode==="close"?" · bar close":" · live")+(r.vol&&r.vol.on?" · vol > "+(r.vol.mult!==1?r.vol.mult+"× ":"")+"avg("+r.vol.len+") "+r.vol.tf:"");

function render(){
  const rules=data.rules,log=data.log;
  root().innerHTML=deliveryHtml()+'<div id="al-msg" class="al-msg"></div>'+
    '<h3>Your alerts <span class="muted">('+rules.length+")</span></h3>"+
    (rules.length?'<div class="al-rules">'+rules.map(r=>{const l=ruleLine(r);return '<div class="al-rule'+(r.enabled?"":" off")+'" data-id="'+r.id+'"><div class="al-rule-main"><b>'+esc(r.name)+'</b><div class="al-cond">'+esc(l.cond)+'</div><small>'+esc(l.sub)+'</small></div><div class="al-rule-btns"><label class="sw"><input type="checkbox" data-act="toggle"'+(r.enabled?" checked":"")+'><i></i></label><button class="btn" data-act="edit">Edit</button><button class="btn" data-act="del">Delete</button></div></div>';}).join("")+"</div>":'<p class="muted">No alerts yet — create your first one below.</p>')+
    formHtml(editing?rules.find(r=>r.id===editing):null)+
    '<h3>Recent alerts</h3>'+(log.length?'<div class="al-log">'+log.slice(0,15).map(x=>'<div class="al-log-row" data-symbol="'+esc(x.symbol)+'"><b>'+esc(x.base)+'</b><span>'+esc(x.tf)+" RSI "+(x.dir==="up"?"↑":"↓")+" "+Number(x.rsi).toFixed(1)+(x.volRatio!=null?" · vol "+x.volRatio+"×":"")+'</span><small>'+new Date(x.at).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})+"</small></div>").join("")+"</div>":'<p class="muted">Nothing has fired yet.</p>');
  setMsg(msg,msgOk);bind();paintPushBtn();}

function readForm(){
  const v=id=>$(id).value;
  return{name:v("f-name"),tf:v("f-tf"),op:v("f-op"),level:Number(v("f-level")),mode:v("f-mode"),scope:v("f-scope"),symbols:v("f-symbols"),minQuoteVolume:Number(v("f-minvol"))||0,cooldownMin:Number(v("f-cool"))||30,
    vol:{on:$("f-vol").checked,tf:v("f-voltf"),len:Number(v("f-vollen"))||20,mult:Number(v("f-volmult"))||1},channels:{telegram:$("f-tg").checked,push:$("f-push").checked},enabled:true};}

function bind(){
  $("f-scope").onchange=()=>{$("f-sym-wrap").hidden=$("f-scope").value!=="symbols";};
  $("f-vol").onchange=()=>{$("f-vol-box").hidden=!$("f-vol").checked;if($("f-vol").checked&&!editing)$("f-voltf").value=VTFS.includes($("f-tf").value)?$("f-tf").value:"1h";};
  $("f-tf").onchange=()=>{if(!$("f-vol").checked&&VTFS.includes($("f-tf").value))$("f-voltf").value=$("f-tf").value;};
  $("al-form").onsubmit=async e=>{e.preventDefault();const b=$("f-save");b.disabled=true;
    try{const body=readForm();if(editing){const old=data.rules.find(r=>r.id===editing);body.enabled=old?old.enabled:true;}
      data=await api(editing?"/api/alerts/rules/"+editing:"/api/alerts/rules",editing?"PUT":"POST",body);msg=editing?"Alert updated.":"Alert saved — it is watching the market now.";msgOk=true;editing=null;backup();render();}
    catch(err){setMsg(err.message,false);b.disabled=false;}};
  if($("f-cancel"))$("f-cancel").onclick=()=>{editing=null;msg="";render();};
  root().querySelectorAll(".al-rule").forEach(row=>{const id=row.dataset.id;
    row.querySelector('[data-act="toggle"]').onchange=async e=>{try{data=await api("/api/alerts/rules/"+id,"PUT",{enabled:e.target.checked});backup();msg=e.target.checked?"Alert on.":"Alert paused.";render();}catch(err){setMsg(err.message,false);}};
    row.querySelector('[data-act="edit"]').onclick=()=>{editing=id;msg="";render();$("al-form").scrollIntoView({behavior:"smooth",block:"start"});};
    row.querySelector('[data-act="del"]').onclick=async()=>{if(!confirm("Delete this alert?"))return;try{data=await api("/api/alerts/rules/"+id,"DELETE");if(editing===id)editing=null;backup();msg="Alert deleted.";render();}catch(err){setMsg(err.message,false);}};});
  root().querySelectorAll(".al-log-row").forEach(n=>n.onclick=()=>{$("alert-modal").classList.remove("open");if(window.openDetail)openDetail(n.dataset.symbol);});
  const tg=$("al-test-tg");if(tg)tg.onclick=async()=>{tg.disabled=true;setMsg("Sending Telegram test…");try{const d=await api("/api/alerts/test","POST",{channel:"telegram"});setMsg(d.message);load2();}catch(e){setMsg(e.message,false);}tg.disabled=false;};
  const on=$("al-push-on");if(on)on.onclick=async()=>{on.disabled=true;try{
      const sub=await NvxPWA.currentSub();
      if(sub){await NvxPWA.disable(pin);setMsg("Notifications turned off for this device.");}
      else{await NvxPWA.enable(pin);setMsg("Notifications enabled on this device ✅ — tap Test to try it.");}
      await load2();}catch(e){setMsg(e.message,false);}on.disabled=false;};
  const pt=$("al-push-test");if(pt)pt.onclick=async()=>{pt.disabled=true;try{const sub=await NvxPWA.currentSub();
      if(sub){const d=await api("/api/alerts/test","POST",{channel:"push",endpoint:sub.endpoint});setMsg(d.message);}
      else{await NvxPWA.localNotify("NORDVEX test","Notifications work in this browser — enable them to get alerts while the app is closed.");setMsg("Showed a local test notification. Tap Enable to receive real alerts.");}}
    catch(e){setMsg(e.message,false);}pt.disabled=false;};
  const ins=$("al-install");if(ins)ins.onclick=()=>NvxPWA.install();}
async function load2(){try{data=await api("/api/alerts");const keep=msg,ok=msgOk;render();setMsg(keep,ok);}catch{}}
async function paintPushBtn(){const b=$("al-push-on");if(!b||!window.NvxPWA||!NvxPWA.support().ok)return;const sub=await NvxPWA.currentSub();b.textContent=sub?"Turn off":"Enable";}

$("alerts").onclick=()=>{$("alert-modal").classList.add("open");load();};
$("close-alerts").onclick=()=>$("alert-modal").classList.remove("open");
$("alert-modal").onclick=e=>{if(e.target.id==="alert-modal")$("alert-modal").classList.remove("open");};
window.NvxAlerts={reload:load};
})();
