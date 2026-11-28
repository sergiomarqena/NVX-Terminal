/* New-coin alert: a short synthesized chime (no audio file) + an on-screen toast.
   Browsers only allow audio after the first tap/click on the page, so the AudioContext is unlocked on first interaction. */
(()=>{
const btn=document.getElementById("sound"),box=document.getElementById("toasts");
let ctx=null,on=true;
try{on=localStorage.getItem("nvx-sound")!=="off";}catch{}
function unlock(){try{ctx=ctx||new(window.AudioContext||window.webkitAudioContext)();if(ctx.state==="suspended")ctx.resume();}catch{}}
["pointerdown","keydown","touchstart"].forEach(ev=>addEventListener(ev,unlock,{passive:true}));
function tone(f,t0,dur,vol){const o=ctx.createOscillator(),g=ctx.createGain();o.type="sine";o.frequency.value=f;g.gain.setValueAtTime(.0001,t0);g.gain.exponentialRampToValueAtTime(vol,t0+.015);g.gain.exponentialRampToValueAtTime(.0001,t0+dur);o.connect(g);g.connect(ctx.destination);o.start(t0);o.stop(t0+dur+.03);}
/* rising C6-E6-G6 arpeggio with a soft sparkle on top; returns false if the browser still blocks audio */
function chime(force){if(!on&&!force)return false;unlock();if(!ctx||ctx.state!=="running")return false;const t=ctx.currentTime+.02;[1046.5,1318.5,1568].forEach((f,i)=>tone(f,t+i*.11,.4,.2));tone(2093,t+.34,.55,.07);try{navigator.vibrate&&navigator.vibrate(120);}catch{}return true;}
function paint(){if(btn){btn.textContent=on?"🔊 Sound":"🔇 Muted";btn.classList.toggle("muted-on",!on);btn.title=on?"Sound on: plays when a new coin is listed (click to mute)":"Sound muted (click to turn on)";}}
if(btn)btn.onclick=()=>{on=!on;try{localStorage.setItem("nvx-sound",on?"on":"off");}catch{}paint();if(on)chime(true);};
paint();

function toast(html,onclick,ms=14000){if(!box)return;const t=document.createElement("div");t.className="toast";t.innerHTML=html;t.onclick=()=>{try{onclick&&onclick();}catch{}t.remove();};box.appendChild(t);while(box.children.length>4)box.firstChild.remove();setTimeout(()=>t.remove(),ms);}
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
window.onNewCoins=function(items){
  if(!items||!items.length)return;
  const played=chime(),first=items[0],names=items.slice(0,3).map(x=>esc(x.base)).join(", ")+(items.length>3?" +"+(items.length-3)+" more":"");
  toast('<b>🆕 New coin'+(items.length>1?"s":"")+' listed</b><span>'+names+' / USDT'+(first.price?" · $"+(+first.price).toPrecision(4):"")+"</span>"+(on&&!played?"<small>Tap anywhere on the page once to enable sound</small>":""),()=>{if(window.openDetail)openDetail(first.symbol);});
};
window.NvxSound={chime:()=>chime(true),isOn:()=>on};
})();
