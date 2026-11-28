/* Web-app plumbing: service worker, "Install app" button and push-notification subscription. */
(()=>{
const $=id=>document.getElementById(id);
const standalone=()=>matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
let deferred=null;
const api={reg:null};

if("serviceWorker"in navigator){
  addEventListener("load",()=>navigator.serviceWorker.register("/sw.js").then(r=>{api.reg=r;resubscribe();}).catch(()=>{}));
  navigator.serviceWorker.addEventListener("message",e=>{if(e.data&&e.data.type==="open-coin"&&window.openDetail)openDetail(String(e.data.symbol).toUpperCase());});
}

/* ---- install button ------------------------------------------------------------------------- */
const btn=()=>$("install");
function paintInstall(){const b=btn();if(!b)return;b.hidden=standalone()||!(deferred||isIOS);}
addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferred=e;paintInstall();});
addEventListener("appinstalled",()=>{deferred=null;paintInstall();});
async function install(){
  if(deferred){deferred.prompt();try{await deferred.userChoice;}catch{}deferred=null;paintInstall();return"prompted";}
  if(window.NvxSound)NvxSound.toast("<b>Install NORDVEX</b><span>Tap the Share button, then “Add to Home Screen”.</span>",null,12000);
  return"ios";}
document.addEventListener("DOMContentLoaded",()=>{if(btn())btn().onclick=install;paintInstall();});
if(document.readyState!=="loading"){if(btn())btn().onclick=install;paintInstall();}

/* ---- push ----------------------------------------------------------------------------------- */
const b64=s=>{const p="=".repeat((4-s.length%4)%4),raw=atob((s+p).replace(/-/g,"+").replace(/_/g,"/"));return Uint8Array.from(raw,c=>c.charCodeAt(0));};
function support(){
  if(!("serviceWorker"in navigator))return{ok:false,why:"This browser has no service-worker support."};
  if(isIOS&&!standalone())return{ok:false,why:"On iPhone, add NORDVEX to your Home Screen first (Share ▸ Add to Home Screen), open it from there, then enable notifications."};
  if(!("PushManager"in window)||!("Notification"in window))return{ok:false,why:"This browser does not support push notifications."};
  return{ok:true};}
async function ready(){if(api.reg)return api.reg;return navigator.serviceWorker.ready;}
async function currentSub(){try{const r=await ready();return await r.pushManager.getSubscription();}catch{return null;}}
const post=(path,pin,body)=>fetch(path,{method:"POST",headers:{"content-type":"application/json","x-alert-pin":pin},body:JSON.stringify(body)}).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"Request failed");return d;});
async function enable(pin){
  const s=support();if(!s.ok)throw Error(s.why);
  const perm=Notification.permission==="granted"?"granted":await Notification.requestPermission();
  if(perm!=="granted")throw Error("Notifications are blocked for this site — allow them in your browser/phone settings, then try again.");
  const reg=await ready(),{key}=await fetch("/api/push/key").then(r=>r.json());
  let sub=await reg.pushManager.getSubscription();
  try{if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64(key)});}
  catch(e){if(sub)await sub.unsubscribe();sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64(key)});}
  /* a subscription created with an older server key would be rejected by the push service, so replace it */
  await post("/api/push/subscribe",pin,{subscription:sub.toJSON()});
  return sub.endpoint;}
async function disable(pin){const sub=await currentSub();if(!sub)return;const ep=sub.endpoint;await sub.unsubscribe();try{await post("/api/push/unsubscribe",pin,{endpoint:ep});}catch{}}
/* after a redeploy the server may have lost its subscription list: quietly register this device again */
async function resubscribe(){try{const pin=localStorage.getItem("nvx-pin");if(!pin||!support().ok||Notification.permission!=="granted")return;const sub=await currentSub();if(sub)await post("/api/push/subscribe",pin,{subscription:sub.toJSON()});}catch{}}
/* self-notification that works even if the server is unreachable */
async function localNotify(title,body,url){if(!("Notification"in window))throw Error("This browser has no notification support.");if(Notification.permission!=="granted"&&(await Notification.requestPermission())!=="granted")throw Error("Notifications are blocked for this site — allow them in your browser/phone settings, then try again.");const reg=await ready();await reg.showNotification(title,{body,icon:"/icons/icon-192.png",tag:"nvx-local",data:{url:url||"/"}});}

window.NvxPWA=Object.assign(api,{support,enable,disable,currentSub,localNotify,install,standalone,isIOS,canInstall:()=>!!deferred});
})();
