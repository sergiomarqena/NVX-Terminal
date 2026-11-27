/* NORDVEX scatter background — procedural "tunnel fly-through".
   Teal rays burst out of a dark central void, partial ring arcs expand outward and fade,
   and small dots / tumbling diamonds drift toward the viewer. Pure canvas, no assets. */
(()=>{
const canvas=document.getElementById("bg-fx");
if(!canvas)return;
const ctx=canvas.getContext("2d");
if(!ctx)return;

const TEAL=[38,226,190];                       // ray / ring colour
const rgba=(a,c=TEAL)=>"rgba("+c[0]+","+c[1]+","+c[2]+","+a.toFixed(3)+")";
const rand=(a,b)=>a+Math.random()*(b-a);
const TAU=Math.PI*2;
const Z_FAR=1,Z_NEAR=0.06;                    // depth range; screen radius = scale / z

let W=0,H=0,dpr=1,cx=0,cy=0,scale=1,running=false,last=0,acc=0,raf=0,visible=true;

/* ---- scene objects ----------------------------------------------------------------------- */
const rays=[],rings=[],dots=[],diamonds=[];
function makeRay(initial){const bright=Math.random()<0.14;return{a:rand(0,TAU),z:initial?rand(Z_NEAR*1.2,Z_FAR*0.7):rand(Z_FAR*0.45,Z_FAR*0.7),len:rand(0.45,1.5),speed:rand(0.05,0.14),w:bright?rand(1.1,1.7):rand(0.45,0.9),b:bright?rand(0.8,1):rand(0.25,0.7)};}
function makeRing(initial){const n=2+Math.floor(Math.random()*4),segs=[];for(let i=0;i<n;i++){const span=rand(0.35,2.1);segs.push({a0:rand(0,TAU),span,step:Math.random()<0.55?rand(-0.035,0.035):0});}
  return{z:initial?rand(Z_NEAR*2,Z_FAR):rand(Z_FAR*0.9,Z_FAR*1.15),speed:rand(0.07,0.13),rot:rand(-0.12,0.12),segs,b:rand(0.45,1)};}
function makeDot(initial){return{a:rand(0,TAU),z:initial?rand(Z_NEAR,Z_FAR):rand(Z_FAR*0.8,Z_FAR),speed:rand(0.12,0.3),s:rand(0.7,1.6)};}
function makeDiamond(initial){return{a:rand(0,TAU),z:initial?rand(Z_NEAR*2,Z_FAR):rand(Z_FAR*0.8,Z_FAR),speed:rand(0.08,0.2),s:rand(2.4,4.6),rot:rand(0,TAU),spin:rand(-1.6,1.6),tilt:rand(0.55,1),blur:Math.random()<0.3};}

function seed(){
  rays.length=rings.length=dots.length=diamonds.length=0;
  const area=Math.max(0.5,Math.min(2.2,(W*H)/(1200*470)));
  for(let i=0;i<Math.round(210*Math.sqrt(area));i++)rays.push(makeRay(true));
  for(let i=0;i<9;i++)rings.push(makeRing(true));
  for(let i=0;i<Math.round(150*Math.sqrt(area));i++)dots.push(makeDot(true));
  for(let i=0;i<Math.round(14*Math.sqrt(area));i++)diamonds.push(makeDiamond(true));
}

function resize(){
  const r=canvas.getBoundingClientRect();
  if(!r.width||!r.height)return;
  dpr=Math.min(window.devicePixelRatio||1,1.5);
  W=Math.round(r.width);H=Math.round(r.height);
  canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  cx=W/2;cy=H/2;scale=Math.hypot(W,H)*0.5*Z_NEAR*1.9;   // a z=Z_NEAR object sits just outside the frame
  seed();draw();
}

/* ---- simulation -------------------------------------------------------------------------- */
function step(dt){
  for(const r of rays){r.z-=r.speed*dt;if(r.z<Z_NEAR)Object.assign(r,makeRay(false));}
  for(const g of rings){g.z-=g.speed*dt;for(const s of g.segs)s.a0+=g.rot*dt;if(g.z<Z_NEAR*0.9)Object.assign(g,makeRing(false));}
  for(const d of dots){d.z-=d.speed*dt;if(d.z<Z_NEAR)Object.assign(d,makeDot(false));}
  for(const d of diamonds){d.z-=d.speed*dt;d.rot+=d.spin*dt;if(d.z<Z_NEAR*1.5)Object.assign(d,makeDiamond(false));}
}
const rad=z=>scale/z;                                  // perspective: radius grows as z shrinks
const fade=(z)=>Math.min(1,(Z_FAR*1.05-z)*7)*Math.min(1,(z-Z_NEAR)*9); // fade in at the far end, out at the edge

/* ---- drawing ----------------------------------------------------------------------------- */
function draw(){
  ctx.clearRect(0,0,W,H);
  // base field: near-black with the faint violet cast of the source footage
  ctx.fillStyle="#09080c";ctx.fillRect(0,0,W,H);
  const maxR=Math.hypot(W,H)*0.55;

  ctx.lineCap="round";
  // rays
  for(const r of rays){
    const r1=rad(r.z),r0=rad(r.z+r.len);
    if(r0>maxR*1.1)continue;
    const a=Math.min(1,(Z_FAR-r.z)*5+0.35)*Math.min(1,(r.z-Z_NEAR)*9)*r.b*0.42*Math.min(1,r1/(maxR*0.3));
    if(a<0.01)continue;
    const ca=Math.cos(r.a),sa=Math.sin(r.a);
    ctx.strokeStyle=rgba(a);ctx.lineWidth=r.w;
    ctx.beginPath();ctx.moveTo(cx+ca*Math.max(r0,maxR*0.09),cy+sa*Math.max(r0,maxR*0.09));ctx.lineTo(cx+ca*r1,cy+sa*r1);ctx.stroke();
  }
  // ring arcs with small radial steps (the "HUD ring" look)
  for(const g of rings){
    const R=rad(g.z);
    if(R>maxR*1.25||R<maxR*0.07)continue;
    const a=fade(g.z)*g.b*0.62;
    if(a<0.01)continue;
    ctx.strokeStyle=rgba(a);ctx.lineWidth=Math.max(0.6,Math.min(1.8,R/maxR*1.7));
    for(const s of g.segs){
      const R2=R*(1+s.step);
      ctx.beginPath();ctx.arc(cx,cy,R2,s.a0,s.a0+s.span);ctx.stroke();
      if(s.step){ctx.beginPath();ctx.moveTo(cx+Math.cos(s.a0)*R,cy+Math.sin(s.a0)*R);ctx.lineTo(cx+Math.cos(s.a0)*R2,cy+Math.sin(s.a0)*R2);ctx.stroke();}
    }
  }
  // dots
  for(const d of dots){
    const R=rad(d.z);if(R>maxR*1.1||R<maxR*0.08)continue;
    const a=fade(d.z)*0.85,size=d.s*(0.6+Math.min(1.6,R/maxR*1.6));
    ctx.fillStyle=rgba(a);ctx.fillRect(cx+Math.cos(d.a)*R-size/2,cy+Math.sin(d.a)*R-size/2,size,size);
  }
  // diamonds: small crisp teal squares that tumble and glow, a few out-of-focus ones are larger
  for(const d of diamonds){
    const R=rad(d.z);if(R>maxR*1.05||R<maxR*0.12)continue;
    const a=fade(d.z),s=d.s*(0.5+Math.min(1.4,R/maxR*1.5)),x=cx+Math.cos(d.a)*R,y=cy+Math.sin(d.a)*R;
    ctx.save();ctx.translate(x,y);ctx.rotate(d.rot);ctx.scale(1,d.tilt*Math.abs(Math.cos(d.rot*0.7))*0.6+0.4);
    ctx.shadowColor=rgba(0.9,[60,240,205]);ctx.shadowBlur=d.blur?10:6;
    ctx.fillStyle=rgba(Math.min(1,a*(d.blur?0.55:1.05)),[70,240,205]);const k=d.blur?s*1.7:s;ctx.fillRect(-k/2,-k/2,k,k);
    ctx.restore();
  }
  // dark central void, as in the reference
  const v=ctx.createRadialGradient(cx,cy,0,cx,cy,maxR*0.2);
  v.addColorStop(0,"rgba(5,4,7,1)");v.addColorStop(0.6,"rgba(5,4,7,.92)");v.addColorStop(1,"rgba(5,4,7,0)");
  ctx.fillStyle=v;ctx.fillRect(0,0,W,H);
}

/* ---- loop (30 fps, paused when hidden / off-screen / reduced motion) ---------------------- */
function frame(t){
  raf=0;if(!running)return;
  const dt=Math.min(0.1,(t-last)/1000);last=t;acc+=dt;
  if(acc>=1/30){step(acc);draw();acc=0;}
  raf=requestAnimationFrame(frame);
}
function start(){if(running||!visible||document.hidden||reduce.matches)return;running=true;last=performance.now();raf=requestAnimationFrame(frame);}
function stop(){running=false;if(raf)cancelAnimationFrame(raf);raf=0;}

const reduce=window.matchMedia("(prefers-reduced-motion: reduce)");
reduce.addEventListener?.("change",()=>reduce.matches?stop():start());
document.addEventListener("visibilitychange",()=>document.hidden?stop():start());
if("IntersectionObserver"in window)new IntersectionObserver(es=>{visible=es[0].isIntersecting;visible?start():stop();}).observe(canvas);
if("ResizeObserver"in window)new ResizeObserver(()=>resize()).observe(canvas);else window.addEventListener("resize",resize);

resize();
for(let i=0;i<90;i++)step(1/30);   // pre-roll so the first frame is already populated
draw();
if(reduce.matches)draw();else start();
window.__nvxBg={start,stop,draw};
})();
