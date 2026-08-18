#!/usr/bin/env python3
"""
Rebuild every harness from the CURRENT prototype and run them.

This exists because the harnesses were being generated once into /tmp and then
re-run by hand afterwards. They carry frozen copies of the game's functions, so
after an edit they happily report on code that no longer exists — which is how
a fix to the tower billboards showed as still broken for three runs. A test
that can silently describe an older build is worse than no test.
"""
import re, subprocess, sys, os

SRC = os.path.join(os.path.dirname(__file__), 'hookpunks_prototype1_0_5.html')
STUB = os.path.join(os.path.dirname(__file__), 'stub.js')
src = open(SRC).read()


def between(a, b, start=0):
    i = src.index(a, start)
    j = src.index(b, i)
    return src[i:j]


COMMON = """
const THREE=require('%s');
const V3=THREE.Vector3, UP=new V3(0,1,0);
const clamp=THREE.MathUtils.clamp, lerp=THREE.MathUtils.lerp;
const LOOK={smog:0x0d0603,haze:0x6b3010,horizon:0xd4671f,sodium:0xffb347,ember:0xff6a1f,
  rust:0x8a3418,ash:0x1a120c,concrete:0x120c08,bone:0xfff0cf,arc:0xaef2ff,arcHot:0xf2fdff,
  sign:0xffcf4a,amb:0x4a2410,key:0xffb066,rim:0x4a6c96};
global.performance={now:()=>0};
global.document={createElement:()=>({width:0,height:0,getContext:()=>{
  const ctx={fillRect(){},strokeRect(){},fillText(){},measureText(){return{width:10};}};
  return new Proxy(ctx,{get:(t,k)=>k in t?t[k]:undefined,set:()=>true}); }})};
""" % STUB

MERGE = between("function mergeGeos(entries,withColor){",
                "// -------------------------------------------------------------------\n// COACHWORK")
SKY = between("// ---------- BILLBOARDS ----------", "function cleanupTowers(b){")
TOWERSIGN = between("function addTowerSign(sol,w,d,h,side,pal){", "function maybeSpawnTowers(a){")
TRAFFIC = between("// ---------- TRAFFIC ON THE CROSSING ----------", "let nextOverpassS=460;")
LANES = between("// ---------- LANE TRAFFIC ----------", "// ---------- CAR SPAWNING ----------")
PERP = between("function pathToWorldPerp(s,lat,h){", "let pathQueryCount=0;")
PARAMS = between("const P={", "const P_KEYS")
CARTYPES = between("const CAR_TYPES=[", "const CAR_COUNT=")
ANCHOR = between("// world point -> the car's own frame", "function cross2(")
HITCHGEO = between("function hitchPerimeter(c){", "function nearestPerimeterU(")

WORLD_STUBS = """
const scene=new THREE.Group(), decor=[];
function addDecor(m,sEnd){ scene.add(m); decor.push({mesh:m,sEnd}); return m; }
function worldFloorY(){ return -40; }
function boxClearOfRoad(){ return true; }
function paletteAt(){ return {smog:0x0d0603,sign:0xffcf4a,concrete:0x120c08,ash:0x1a120c}; }
function windowMaterial(w,h,base){ return new THREE.MeshStandardMaterial({color:base}); }
const _palProp={};
const P={skylineDensity:{v:3},billboardChance:{v:1},signChance:{v:1}};
const g=k=>P[k].v;
function samplePath(s){ return {x:s,y:0,z:0,heading:0.3}; }
"""

TESTS = {}

# ---------------------------------------------------------------- skyline
TESTS['skyline'] = COMMON + WORLD_STUBS + MERGE + "\n" + SKY + r'''
const Box3=THREE.Box3;
let lastBoxes=[]; const _partBoxes=partBoxes;
partBoxes=function(gg){ lastBoxes=_partBoxes(gg); return lastBoxes; };
let checked=0,buried=0,worstPen=0;
const _placeSign=placeSign;
placeSign=function(sg,scratch,x,y,z,ry){
  _placeSign(sg,scratch,x,y,z,ry);
  const f0=new Box3().setFromObject(sg.g);
  const f={min:{x:f0.min.x-0.1,y:f0.min.y-0.1,z:f0.min.z-0.1},
           max:{x:f0.max.x+0.1,y:f0.max.y+0.1,z:f0.max.z+0.1}};
  checked++;
  let pen=0;
  for (const b of lastBoxes){
    const ox=Math.min(f.max.x,b.max.x)-Math.max(f.min.x,b.min.x);
    const oy=Math.min(f.max.y,b.max.y)-Math.max(f.min.y,b.min.y);
    const oz=Math.min(f.max.z,b.max.z)-Math.max(f.min.z,b.min.z);
    if (ox>0.05&&oy>0.05&&oz>0.05) pen=Math.max(pen,Math.min(ox,oy,oz));
  }
  if (pen>0){ buried++; worstPen=Math.max(worstPen,pen); }
};
const rots=[];
for (let i=0;i<3000;i++){
  const before=decor.length;
  spawnSkylineAt(500+i*70,(i%2)?1:-1);
  for (let k=before;k<decor.length;k++) rots.push(decor[k].mesh.rotation.y);
}
let meshes=0; for(const d of decor) d.mesh.traverse(o=>{if(o.isMesh)meshes++;});
report('boards placed',checked);
assertEq('boards buried in their building',buried,0);
report('worst penetration',worstPen.toFixed(3));
report('yaw spread (rad)',(Math.max(...rots)-Math.min(...rots)).toFixed(2));
report('mean draw calls/building',(meshes/decor.length).toFixed(2));
'''

# --------------------------------------------------------- skyline control
TESTS['skyline-control'] = TESTS['skyline'].replace("side*(ext+0.8)", "side*(ext*0.25)") \
    .replace("assertEq('boards buried in their building',buried,0);",
             "assertGt('CONTROL: broken placement must be caught',buried,100);")

# ----------------------------------------------------------------- towers
TESTS['towers'] = COMMON + WORLD_STUBS + MERGE + "\n" + SKY + TOWERSIGN + r'''
const Box3=THREE.Box3;
function fakeTower(w,d,h,baseY){
  const floor=worldFloorY();
  const sunkBase=Math.min(baseY,floor), sunkH=(baseY+h)-sunkBase;
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,sunkH,d),
    new THREE.MeshStandardMaterial({color:0x111111}));
  mesh.position.set(0,sunkBase+sunkH/2,0);
  return {mesh,topY:baseY+h,w,d};
}
let checked=0,below=0,worst=0;
for (let i=0;i<4000;i++){
  const w=12+Math.random()*14, d=12+Math.random()*16, h=6+Math.random()*26;
  const sol=fakeTower(w,d,h,-2+Math.random()*6);
  const n0=sol.mesh.children.length;
  addTowerBillboard(sol,w,d,h,(i%2)?1:-1);
  if (sol.mesh.children.length===n0) continue;
  const bb=new Box3().setFromObject(sol.mesh.children[sol.mesh.children.length-1]);
  checked++;
  const dep=sol.topY-bb.min.y;
  if (dep>0.01){ below++; worst=Math.max(worst,dep); }
}
report('tower boards placed',checked);
assertEq('boards sunk below the roof',below,0);
report('worst sink',worst.toFixed(3));
'''

# ---------------------------------------------------------- towers control
TESTS['towers-control'] = TESTS['towers'].replace(
    "const roofLocal=sol.topY-sol.mesh.position.y;", "const roofLocal=h/2;").replace(
    "assertEq('boards sunk below the roof',below,0);",
    "assertGt('CONTROL: mounting off h/2 must be caught',below,1000);")

# -------------------------------------------------------------- deck traffic
TESTS['traffic'] = COMMON + r'''
const scene=new THREE.Group(), decor=[];
function addDecor(m,sEnd){ scene.add(m); decor.push({mesh:m,sEnd}); return m; }
const rnd=(a,b)=>a+Math.random()*(b-a);
const player={position:new V3(0,0,0)};
''' + MERGE + "\n" + TRAFFIC + r'''
const Box3=THREE.Box3;
let over=0,convoys=0,meshes=0,cases=0;
for (let trial=0; trial<400; trial++){
  deckTraffic.length=0; decor.length=0;
  const span=240+Math.random()*140, deckW=16+Math.random()*8;
  const cross=Math.random()*6.28, deckTop=12+Math.random()*4;
  const p={x:rnd(-50,50),y:0,z:rnd(-50,50)};
  addDeckTraffic(p,cross,deckW,span,deckTop,999);
  convoys+=deckTraffic.length;
  for (const t of deckTraffic){
    t.mesh.traverse(o=>{ if(o.isMesh) meshes++; });
    for (let k=0;k<24;k++){
      t.off=k/24*t.period;
      t.mesh.position.set(t.bx+t.dx*t.off,0,t.bz+t.dz*t.off);
      const b=new Box3().setFromObject(t.mesh);
      for (const c of [[b.min.x,b.min.z],[b.max.x,b.max.z]]){
        const along=(c[0]-p.x)*t.dx+(c[1]-p.z)*t.dz;
        over=Math.max(over,Math.abs(along)-span/2);
      }
      cases++;
    }
  }
}
report('convoys',convoys); report('draw calls each',(meshes/convoys).toFixed(2));
report('wrap positions tested',cases);
assertEq('cars past the deck end',+over.toFixed(3),0);
const t=deckTraffic[0];
player.position.set(t.cx,t.deckTop,t.cz);    updateDeckTraffic(0.016);
assertEq('convoy hidden with player on the deck',t.mesh.visible,false);
player.position.set(t.cx,t.deckTop-30,t.cz); updateDeckTraffic(0.016);
assertEq('convoy visible from the road below',t.mesh.visible,true);
'''

# ---------------------------------------------------------- hitch geometry
TESTS['hitch-geometry'] = COMMON + r"""
const P={}; const g=k=>0;
const _hn=new V3();
""" + HITCHGEO + r"""
// Does the hold land ON the bodywork when the car is pitched? Build the same
// point independently from the car's own rotation and compare.
const type={w:2.2,h:1.3,d:4.6};
function car(x,y,z,yaw,pitch){
  const m=new THREE.Mesh(new THREE.BoxGeometry(type.w,type.h,type.d),
    new THREE.MeshStandardMaterial({}));
  m.rotation.order='YXZ'; m.position.set(x,y,z); m.rotation.set(pitch,yaw,0);
  m.updateMatrixWorld(true);
  return {mesh:m,type};
}
const stand=new V3(), body=new V3();
let worstFlat=0, worstRamp=0, cases=0;
for (let t=0;t<600;t++){
  const yaw=Math.random()*6.283, pitch=(Math.random()*70-35)*Math.PI/180;
  const c=car(Math.random()*40-20,3+Math.random()*4,Math.random()*40-20,yaw,pitch);
    const uu=Math.random()*hitchPerimeter(c);
  const L=hitchWorld(c,uu,0.62,stand,body);
  const want=new V3(L.lr,type.h*0.2,L.lf).applyQuaternion(c.mesh.quaternion)
    .add(c.mesh.position);
  const err=body.distanceTo(want);
  if (Math.abs(pitch)<0.01) worstFlat=Math.max(worstFlat,err);
  worstRamp=Math.max(worstRamp,err); cases++;
}
report('holds tested',cases);
assertEq('hold off the bodywork on a slope',+worstRamp.toFixed(6),0);
// and a flat car must be unchanged from the old flat-only expression
let worstLegacy=0;
for (let t=0;t<300;t++){
  const yaw=Math.random()*6.283;
  const c=car(Math.random()*40-20,3,Math.random()*40-20,yaw,0);
  const uu=Math.random()*hitchPerimeter(c);
  const L=hitchWorld(c,uu,0.62,stand,body);
  const fx=Math.sin(yaw),fz=Math.cos(yaw),rx=Math.cos(yaw),rz=-Math.sin(yaw);
  const legacy=new V3(c.mesh.position.x+fx*L.lf+rx*L.lr,
                      c.mesh.position.y+type.h*0.2,
                      c.mesh.position.z+fz*L.lf+rz*L.lr);
  worstLegacy=Math.max(worstLegacy,body.distanceTo(legacy));
}
assertEq('flat ground unchanged from before',+worstLegacy.toFixed(6),0);
"""

# ---------------------------------------------------------- hitch geo control
TESTS['hitch-geometry-control'] = TESTS['hitch-geometry'].replace(
    "_hvB.set(L.lr,c.type.h*0.2,L.lf).applyQuaternion(c.mesh.quaternion);\n    bodyOut.set(c.mesh.position.x+_hvB.x,c.mesh.position.y+_hvB.y,c.mesh.position.z+_hvB.z);",
    "bodyOut.set(bx,c.mesh.position.y+c.type.h*0.2,bz);").replace(
    "assertEq('hold off the bodywork on a slope',+worstRamp.toFixed(6),0);",
    "assertGt('CONTROL: the flat-offset version must be caught',worstRamp,0.5);")

# ------------------------------------------------------------- harpoon bite
TESTS['anchor'] = COMMON + "const harp={car:null,carLocal:null,carLocalFor:null};\n" + ANCHOR + r'''
function makeCar(x,z,h,type){ return {mesh:{position:new V3(x,type.h/2,z),rotation:{y:h}},type}; }
const type={w:2.2,h:1.3,d:4.6}, out=new V3();
let worst=0,tailOk=0,cases=0;
for (let trial=0; trial<800; trial++){
  const h0=Math.random()*6.283;
  const car=makeCar(Math.random()*40-20,Math.random()*40-20,h0,type);
  const f=(Math.random()-0.5)*type.d*0.9, r=(Math.random()<0.5?1:-1)*type.w*0.5;
  const y=type.h*(0.2+Math.random()*0.5);
  const fx=Math.sin(h0),fz=Math.cos(h0);
  const world=new V3(car.mesh.position.x+fx*f+fz*r,car.mesh.position.y+y,
                     car.mesh.position.z+fz*f-fx*r);
  harp.carLocal=carLocalOf(car,world); harp.carLocalFor=car; harp.car=car;
  carAttachPoint(car,out); worst=Math.max(worst,out.distanceTo(world));
  const h1=h0+Math.random()*2-1;
  car.mesh.position.set(car.mesh.position.x+30,car.mesh.position.y,car.mesh.position.z-12);
  car.mesh.rotation.y=h1;
  const gx=Math.sin(h1),gz=Math.cos(h1);
  const expect=new V3(car.mesh.position.x+gx*f+gz*r,car.mesh.position.y+y,
                      car.mesh.position.z+gz*f-gx*r);
  carAttachPoint(car,out); worst=Math.max(worst,out.distanceTo(expect));
  harp.carLocal=null; harp.carLocalFor=null; carAttachPoint(car,out);
  const tail=new V3(car.mesh.position.x-gx*(type.d/2),car.mesh.position.y+type.h*0.15,
                    car.mesh.position.z-gz*(type.d/2));
  if (out.distanceTo(tail)<1e-9) tailOk++;
  cases++;
}
report('bites tested',cases);
assertEq('worst drift from the bitten panel',+worst.toFixed(6),0);
assertEq('tail fallback with no bite',tailOk,cases);
const a=makeCar(0,0,0,type), b=makeCar(10,0,0,type);
harp.carLocal=carLocalOf(a,new V3(1.1,0.9,1)); harp.carLocalFor=a;
carAttachPoint(b,out);
const bt=new V3(b.mesh.position.x,b.mesh.position.y+type.h*0.15,b.mesh.position.z-type.d/2);
assertEq('a bite does not leak onto another car',out.distanceTo(bt)<1e-9,true);
'''


# ------------------------------------------------------------- lane traffic
# The property under test is not "the following model is nicely tuned", it is
# "two cars are never inside each other". So this drives the real simulation
# for thousands of frames — with the player moving, cars recycling in and out
# of the window, and a car on the rope for part of it — and measures actual
# box interpenetration after every single frame.
LANE_STUBS = r"""
const ROAD_WIDTH=28,LANE_COUNT=5,LANE_WIDTH=ROAD_WIDTH/LANE_COUNT;
const cars=[];
const harp={attached:false,car:null}, hitch={car:null};
const st={pathS:0};
const scene={add(){}};
// A road that actually bends. The straight stub this harness used to carry
// hid a whole class of bug: every conflict test works in (pathS, laneX), and
// on a straight those ARE metres, so nothing could ever disagree. Curvature
// here reaches 1/34 — the tightest the loop generator produces — while the
// heading only swings 34 degrees either way, so the corridor never folds back
// over itself and every overlap the test finds is a real one.
const _pts=[]; {
  let x=0,z=0,hd=0;
  for (let s=0;s<=4000;s+=0.5){
    _pts.push({x,z,heading:hd});
    const k=Math.sin(s/20)/34;
    hd-=k*0.5; x+=Math.sin(hd)*0.5; z+=Math.cos(hd)*0.5;
  }
}
function samplePath(s){
  const i=Math.max(0,Math.min(_pts.length-2,Math.floor(s/0.5)));
  const f=(s-i*0.5)/0.5, a=_pts[i], b=_pts[i+1];
  return {x:a.x+(b.x-a.x)*f, y:0, z:a.z+(b.z-a.z)*f,
          heading:a.heading+(b.heading-a.heading)*f, pitch:0};
}
"""
LANE_HARNESS = r"""
// ---- overlap where the eye sees it: world-space OBB, by separating axis ----
function obb(c){
  const h=c.mesh.rotation.y;
  return {x:c.mesh.position.x,z:c.mesh.position.z,
          fx:Math.sin(h),fz:Math.cos(h),rx:Math.cos(h),rz:-Math.sin(h),
          hd:c.type.d*0.5,hw:c.type.w*0.5};
}
function penetration(a,b){
  let best=Infinity;
  for (const ax of [[a.fx,a.fz],[a.rx,a.rz],[b.fx,b.fz],[b.rx,b.rz]]){
    const d=Math.abs((b.x-a.x)*ax[0]+(b.z-a.z)*ax[1]);
    const ra=Math.abs(a.fx*ax[0]+a.fz*ax[1])*a.hd+Math.abs(a.rx*ax[0]+a.rz*ax[1])*a.hw;
    const rb=Math.abs(b.fx*ax[0]+b.fz*ax[1])*b.hd+Math.abs(b.rx*ax[0]+b.rz*ax[1])*b.hw;
    const ov=ra+rb-d;
    if (ov<=0) return 0;
    if (ov<best) best=ov;
  }
  return best;
}

function makeCar(type){
  const c={mesh:{position:new V3(),rotation:{x:0,y:0}},type,lane:0,laneTo:0,
    laneBase:laneCentre(0),laneX:laneCentre(0),changeT:0,changeCd:0,blockedFor:0,
    latV:0,pathS:-1e7,speed:0,baseSpeed:0,avoidSpeed:0,weavePhase:0,weaveAmp:0,
    k:1,aborting:false,held:false,isCar:true,gen:0};
  cars.push(c); placeCarIn(c,0,340,1); return c;
}
for (let i=0;i<40;i++) makeCar(CAR_TYPES[i%CAR_TYPES.length]);

// ---- the vibrating car ----
// A lane change that is aborted, un-aborted and re-aborted every frame moves
// nothing out of place: laneX is continuous under the swap, so no gap test and
// no overlap test can see it. What reverses is latV, at 60 Hz, and latV sets
// the rendered steering angle — so the car flips between two poses and is
// drawn as two cars merged into one. These two counters are the only way to
// catch it: how many times one change can be abandoned, and how many times a
// car can reverse direction across the road in quick succession.
let aborts=0, worstAbortsPerChange=0, reversals=0, worstChain=0;
const _steer=steerLane;
steerLane=function(c,dt,lead){
  const before=c.laneTo, t=c.changeT;
  _steer(c,dt,lead);
  if (t>0&&c.laneTo!==before){
    aborts++; c._ab=(c._ab||0)+1;
    if (c._ab>worstAbortsPerChange) worstAbortsPerChange=c._ab;
  }
  if (c.laneTo===c.lane) c._ab=0;
};
const _sign=new Map(), _flipAt=new Map(), _chain=new Map();
function watchJitter(f){
  for (const c of cars){
    const s=Math.abs(c.latV)<0.4?0:Math.sign(c.latV);
    if (s===0) continue;
    const prev=_sign.get(c);
    if (prev!==undefined&&prev!==s){
      reversals++;
      const at=_flipAt.get(c);
      const run=(at!==undefined&&f-at<12)?(_chain.get(c)||1)+1:1;
      _chain.set(c,run); _flipAt.set(c,f);
      if (run>worstChain) worstChain=run;
    }
    _sign.set(c,s);
  }
}

// Interpenetration in WORLD SPACE, by separating axis. This used to be
// measured in (pathS, laneX) — the space the simulation reasons in — and that
// was wrong for exactly the reason the simulation itself was wrong: on a bend,
// arc length is not distance. A pair correctly held 5.1 metres apart on the
// ground reads as 4.5 apart in pathS, and the test called it a collision. The
// harness has to work in the units the eye does.
function worstOverlap(){
  let worst=0, pair=null;
  const b=cars.map(obb);
  for (let i=0;i<cars.length;i++) for (let j=i+1;j<cars.length;j++){
    const pen=penetration(b[i],b[j]);
    if (pen>worst){ worst=pen; pair=[cars[i].type.name,cars[j].type.name]; }
  }
  return {worst,pair};
}

let worstPen=0, worstPair=null, changes=0, offRoad=0, frames=0, bad=0;
// Two failures that leave no interpenetration behind and so slip past the
// overlap test entirely, both of which read on screen as one car drawn twice:
//   · a steering angle taken off a finite difference of lateral position,
//     which spikes to eighty metres a second when anything discontinuous
//     happens and snaps the mesh through seventy degrees for a frame;
//   · two cars either side of an empty lane both taking it, converging, and
//     running half a metre apart without ever quite touching.
const LAT_CAP=LANE_WIDTH*1.5/P.laneChangeTime.v;
let latSpikes=0, tooClose=0, worstLatV=0, minClear=99, worldPen=0, worldBad=0, minLead=99;
const straddle=new Map(); let worstStraddle=0;
const STRADDLE_MAX=Math.ceil(P.laneChangeTime.v*2/(1/60));
const wasChanging=new Map();
const DT=1/60;
for (let f=0; f<6000; f++){
  // the player runs down the corridor at a plausible tow speed, which is what
  // drives cars through the recycle window in both directions
  st.pathS+=30*DT;
  // hold a car for a spell, release, hold another: this is the case the old
  // code could not survive at all, since a held car ignored everything ahead
  if (f%900===0){ const c=cars[(f/900|0)%cars.length]; harp.attached=true; harp.car=c; }
  if (f%900===600){ harp.attached=false; harp.car=null; }
  updateTraffic(DT);
  watchJitter(f);
  frames++;
  const o=worstOverlap();
  if (o.worst>worstPen){ worstPen=o.worst; worstPair=o.pair; }
  if (o.worst>1e-9) bad++;
  // What a car is ACTUALLY leaving in front of it, in metres of road. This is
  // the number the arc-length bug attacks: it never quite closes to a
  // collision, it just quietly shrinks every following distance on a bend by
  // up to the ratio of the inner lane radius to the centreline's.
  if (f>600) for (const c of cars){
    const l=leaderOf(c); if (!l) continue;
    const a=c.mesh.position, b=l.car.mesh.position;
    const gap=Math.hypot(b.x-a.x,b.z-a.z)-(c.type.d+l.car.type.d)*0.5;
    if (gap<minLead){ minLead=gap; }
  }
  const boxes=cars.map(obb);
  for (let i=0;i<cars.length;i++) for (let j=i+1;j<cars.length;j++){
    const a=cars[i],b=cars[j];
    // Alongside is a question about the ground, so ask it there — and it is
    // the component ALONG the direction of travel that decides it, not the
    // straight-line distance. Two cars abreast in neighbouring lanes are 5.6
    // apart and nose-to-tail with each other at the same time.
    const along=Math.abs((boxes[j].x-boxes[i].x)*boxes[i].fx
                        +(boxes[j].z-boxes[i].z)*boxes[i].fz);
    if (along>=(a.type.d+b.type.d)*0.5) continue;
    // the tightest legitimate pass on this road: neighbouring lane centres,
    // less the weave, less the two half-widths. Anything under it is two cars
    // sharing a lane, whether or not they have touched yet.
    const floor=LANE_WIDTH-WEAVE_LAT-(a.type.w+b.type.w)*0.5;
    const clear=Math.abs(a.laneX-b.laneX)-(a.type.w+b.type.w)*0.5;
    if (clear<minClear) minClear=clear;
    if (clear<floor-1e-6) tooClose++;
  }
  // How long a car spends off a lane centre. A change takes laneChangeTime; an
  // abort turns back partway and costs at most that again. Anything longer is a
  // car parked on the lane line, which is the straddle.
  for (const c of cars){
    const onCentre=Math.abs(c.laneBase-laneCentre(c.lane))<1e-6&&c.laneTo===c.lane;
    if (onCentre) straddle.set(c,0);
    else { const n=(straddle.get(c)||0)+1; straddle.set(c,n);
           if (n>worstStraddle) worstStraddle=n; }
  }
  for (const c of cars){
    const limit=ROAD_WIDTH*0.5-c.type.w*0.5;
    if (Math.abs(c.laneX)>limit+1e-6) offRoad++;
    worstLatV=Math.max(worstLatV,Math.abs(c.latV));
    if (Math.abs(c.latV)>LAT_CAP+1e-6) latSpikes++;
    if (!isFinite(c.pathS)||!isFinite(c.speed)||c.speed<-1e-9) bad++;
    const ch=c.laneTo!==c.lane;
    if (ch&&!wasChanging.get(c)) changes++;
    wasChanging.set(c,ch);
  }
}
report('frames simulated',frames);
report('car pairs tested',frames*cars.length*(cars.length-1)/2);
report('lane changes made',changes);
report('worst overlap on the ground',worstPen.toFixed(4)+(worstPair?' ('+worstPair.join(' / ')+')':''));
report('worst lateral rate (m/s)',worstLatV.toFixed(2)+' of '+LAT_CAP.toFixed(2)+' allowed');
report('tightest pass alongside',minClear.toFixed(3));
report('tightest following gap (m)',minLead.toFixed(3)+' of '+P.carGap.v+' asked for');
report('lane changes abandoned',aborts);
report('lateral direction reversals',reversals);
assertEq('one change abandoned more than once',worstAbortsPerChange<=1,true);
assertEq('a car reversing across the road repeatedly',worstChain<=2,true);
assertEq('frames with a car inside another car',bad,0);
assertEq('steering angle taken off a spike',latSpikes,0);
assertEq('two cars converging into one lane',tooClose,0);
assertEq('cars off the carriageway',offRoad,0);
report('longest time off a lane centre',worstStraddle+' frames, limit '+STRADDLE_MAX);
assertGt('overtakes actually happen',changes,50);
assertLt('a car left straddling the lane line',worstStraddle,STRADDLE_MAX);

// And a blocked car must genuinely get past, not merely be allowed to try.
// One slow car parked in lane 2 with a fast one behind it: without a lane
// change the fast one is stuck at the slow one's speed forever.
cars.length=0;
const slow=makeCar(CAR_TYPES[0]), fast=makeCar(CAR_TYPES[1]);
slow.lane=slow.laneTo=2; slow.laneBase=slow.laneX=laneCentre(2);
slow.pathS=60; slow.speed=slow.baseSpeed=20;
fast.lane=fast.laneTo=2; fast.laneBase=fast.laneX=laneCentre(2);
fast.pathS=20; fast.speed=fast.baseSpeed=44;
st.pathS=0;
let passed=false, pen2=0;
for (let f=0; f<900; f++){
  st.pathS=Math.min(slow.pathS,fast.pathS)-40;
  slow.baseSpeed=20; fast.baseSpeed=44;          // hold intent against recycling
  updateTraffic(DT);
  pen2=Math.max(pen2,worstOverlap().worst);
  if (fast.pathS>slow.pathS+8) passed=true;
}
assertEq('the fast car gets past the slow one',passed,true);
assertEq('and does not go through it on the way',+pen2.toFixed(6),0);

// ---- the car caught halfway across ----
// The failure this guards against never touches anything, which is why waiting
// for it in free-flowing traffic is a coin toss — thirty thousand frames turned
// it up one run in six. So put the state there directly. A braking chain can
// shuffle a follower to nose-to-tail with the car in front; if it is halfway
// through a lane change when that happens it is not BEHIND that car any more,
// it is beside it, with three quarters of a metre in between. Nothing is
// touching, every gap test passes, and what is drawn is one car with a second
// growing out of its flank.
cars.length=0;
const A=makeCar(CAR_TYPES[1]), B=makeCar(CAR_TYPES[1]);
function put(c,lane,s,v){
  c.lane=c.laneTo=lane; c.changeT=0; c.changeCd=0; c.blockedFor=0; c.latV=0;
  c.laneBase=c.laneX=laneCentre(lane); c.pathS=s;
  c.speed=c.baseSpeed=c.avoidSpeed=v; c.k=laneScale(s,c.laneX);
}
put(A,2,120,21);
put(B,2,120-(A.type.d+B.type.d)/2+1.2,25);     // overlapping A by 1.2
B.laneTo=1; B.changeT=0.5;                     // and halfway out of the lane
B.laneBase=B.laneX=(laneCentre(2)+laneCentre(1))/2;
st.pathS=B.pathS-40;
const wasBeside=Math.abs(A.pathS-B.pathS)<(A.type.d+B.type.d)*0.5;
updateTraffic(1/60);
const sideClear=Math.abs(A.laneX-B.laneX)-(A.type.w+B.type.w)*0.5;
const stillBeside=Math.abs(A.pathS-B.pathS)<(A.type.d+B.type.d)*0.5;
const floor2=LANE_WIDTH-WEAVE_LAT-(A.type.w+B.type.w)*0.5;
report('halfway-across clearance',sideClear.toFixed(2)+' vs '+floor2.toFixed(2)+' needed');
assertEq('the setup really is side by side',wasBeside&&sideClear<floor2,true);
assertEq('left drawn beside a car with no room',stillBeside,false);

// ---- the merge that cannot be completed ----
// A car commits to a hole and the hole shuts. Aborting has to be a decision
// taken ONCE: swapping the two lanes over makes the lane it CAME FROM the new
// target, and that lane still holds the car it was escaping, so re-testing the
// same condition next frame fails again and it swaps back. One frame forward,
// one frame back, indefinitely, hanging across the lane line — and because
// smoothstep is symmetric the reversal is continuous, so no gap test and no
// overlap test sees anything wrong at all. What is measured here is the only
// thing that shows it: how long a car is allowed to be between lanes.
cars.length=0;
const lead3=makeCar(CAR_TYPES[0]), blk=makeCar(CAR_TYPES[0]), mv=makeCar(CAR_TYPES[0]);
put(mv,2,132.6,26);
mv.laneTo=1; mv.changeT=0.4;                   // already out over the line
{ const e=0.4*0.4*(3-2*0.4);
  mv.laneBase=mv.laneX=laneCentre(2)+(laneCentre(1)-laneCentre(2))*e; }
let between=0, worstBetween=0, everSettled=false;
const CHANGE_FRAMES=Math.ceil(P.laneChangeTime.v*60);
for (let f=0; f<900; f++){
  // Both lanes held shut, which is the configuration that matters: a car
  // blocked behind something slow, escaping into a lane that is also occupied.
  // One shut lane is not enough — the abort finds its way home and the fault
  // never shows. This is staged rather than simulated because the thing under
  // test is the decision, not the following law that would open the gap.
  for (const o of [lead3,blk]){
    o.pathS=mv.pathS+7.4; o.speed=o.baseSpeed=o.avoidSpeed=mv.speed; o.k=mv.k;
    o.changeT=0; o.laneBase=o.laneX=laneCentre(o.lane=o.laneTo=(o===lead3?2:1));
  }
  st.pathS=mv.pathS-40;
  updateTraffic(1/60);
  if (mv.laneTo!==mv.lane) between++;
  else { between=0; everSettled=true; }
  if (between>worstBetween) worstBetween=between;
}
report('longest spell between lanes',worstBetween+' frames of '+CHANGE_FRAMES+' allowed');
assertEq('a car that gives up on a merge reaches a lane',everSettled,true);
assertEq('and is never left hanging over the line',worstBetween<=CHANGE_FRAMES+4,true);

"""
TESTS['lane-traffic'] = COMMON + LANE_STUBS + PARAMS + "const g=k=>P[k].v;\n" \
    + CARTYPES + "\n" + PERP + "\n" + LANES + LANE_HARNESS

# ------------------------------------------------------- lane traffic control
# Reinstates the two things that were actually wrong — recycling into a slot
# without asking whether anything is standing in it, and trusting the model
# instead of enforcing separation. A suite that has stopped noticing cars
# inside each other fails here rather than showing a row of zeros.
TESTS['lane-traffic-control'] = TESTS['lane-traffic'].replace(
    "    if (slotFree(c,s,laneCentre(li))) return {s,lane:li};\n  }\n  for (let k=1;k<=48;k++){",
    "    return {s,lane:li};\n  }\n  for (let k=1;k<=48;k++){").replace(
    "function resolveOverlaps(){\n  _order.length=0;",
    "function resolveOverlaps(){\n  if (1) return;\n  _order.length=0;").replace(
    "assertEq('left drawn beside a car with no room',stillBeside,false);","").replace(
    "assertEq('the setup really is side by side',wasBeside&&sideClear<floor2,true);","").replace(
    "assertEq('frames with a car inside another car',bad,0);",
    "assertGt('CONTROL: unchecked recycling must be caught',bad,20);").replace(
    "assertEq('one change abandoned more than once',worstAbortsPerChange<=1,true);","").replace(
    "assertEq('a car reversing across the road repeatedly',worstChain<=2,true);","").replace(

    "assertEq('one change abandoned more than once',worstAbortsPerChange<=1,true);","").replace(
    "assertEq('a car reversing across the road repeatedly',worstChain<=2,true);","").replace(
    "assertEq('cars off the carriageway',offRoad,0);","").replace(
    "assertEq('steering angle taken off a spike',latSpikes,0);","").replace(
    "assertEq('two cars converging into one lane',tooClose,0);","").replace(
    "assertEq('and does not go through it on the way',+pen2.toFixed(6),0);","")


# ------------------------------------------------------ lane claim control
# Collapses a car's lateral claim back to the single point it currently
# occupies, which is what let two cars either side of an empty lane both take
# it. Nothing interpenetrates when this is broken — they converge and run
# alongside each other — so this is the only harness that catches it.
TESTS['lane-claim-control'] = TESTS['lane-traffic'].replace(
    "const cLo=atX===undefined?claimLo(c):atX, cHi=atX===undefined?claimHi(c):atX;\n  return bandGap(cLo,cHi,claimLo(o),claimHi(o))<(c.type.w+o.type.w)*0.5+pad;",
    "const X=atX===undefined?c.laneX:atX;\n  return Math.abs(o.laneX-X)<(c.type.w+o.type.w)*0.5+pad;").replace(
    "assertEq('two cars converging into one lane',tooClose,0);",
    "assertGt('CONTROL: point-testing the lane must be caught',tooClose,0);").replace(
    "assertEq('one change abandoned more than once',worstAbortsPerChange<=1,true);","").replace(
    "assertEq('a car reversing across the road repeatedly',worstChain<=2,true);","").replace(

    "assertEq('one change abandoned more than once',worstAbortsPerChange<=1,true);","").replace(
    "assertEq('a car reversing across the road repeatedly',worstChain<=2,true);","").replace(
    "for (let f=0; f<6000; f++){","for (let f=0; f<30000; f++){").replace(
    "assertEq('frames with a car inside another car',bad,0);","").replace(
    "assertEq('steering angle taken off a spike',latSpikes,0);","")

# --------------------------------------------------------- abreast control
# Puts the overlap resolve back on hull contact instead of abreast. It then
# fires only once two cars are already touching — and the case that matters
# never touches: a follower shuffled nose-to-tail by a braking chain, halfway
# through a lane change, ends up BESIDE the car in front with under a metre
# between them. Rare enough that a short run misses it, which is why this one
# is five times the length.
TESTS['abreast-control'] = TESTS['lane-traffic'].replace(
    "if (Math.abs(c.laneX-o.laneX)>=ABREAST) continue;",
    "if (Math.abs(c.laneX-o.laneX)>=(c.type.w+o.type.w)*0.5+0.10) continue;").replace(
    "assertEq('left drawn beside a car with no room',stillBeside,false);",
    "assertEq('CONTROL: resolving only on contact must be caught',stillBeside,true);").replace(
    "assertEq('one change abandoned more than once',worstAbortsPerChange<=1,true);","").replace(
    "assertEq('a car reversing across the road repeatedly',worstChain<=2,true);","").replace(

    "assertEq('one change abandoned more than once',worstAbortsPerChange<=1,true);","").replace(
    "assertEq('a car reversing across the road repeatedly',worstChain<=2,true);","").replace(
    "assertEq('two cars converging into one lane',tooClose,0);","").replace(
    "assertEq('frames with a car inside another car',bad,0);","").replace(
    "assertEq('cars overlapping on the ground, not in pathS',worldBad,0);","")

# ----------------------------------------------------- failed merge control
# Re-takes the abort decision on the return leg. The lane a car aborts back
# into is the one it just left, which still contains whatever it was trying to
# overtake, so the return is refused as well and the car flips target every
# frame — stuck between two lanes with its steering angle snapping sign, which
# on screen is a doubled, ghosting mesh.
TESTS['failed-merge-control'] = TESTS['lane-traffic'].replace(
    "if (!c.aborting&&!laneClear(c,laneCentre(c.laneTo))){",
    "if (!laneClear(c,laneCentre(c.laneTo))){").replace(
    "assertEq('one change abandoned more than once',worstAbortsPerChange<=1,true);",
    "assertGt('CONTROL: re-deciding the abort must be caught',worstAbortsPerChange,2);").replace(
    "assertLt('a car left straddling the lane line',worstStraddle,STRADDLE_MAX);",
    "assertGt('CONTROL: and it leaves cars on the lane line',worstStraddle,STRADDLE_MAX);").replace(
    "assertEq('a car that gives up on a merge reaches a lane',everSettled,true);",
    "assertEq('CONTROL: the car never reaches a lane at all',everSettled,false);").replace(
    "assertEq('and is never left hanging over the line',worstBetween<=CHANGE_FRAMES+4,true);",
    "assertGt('CONTROL: and hangs over the line indefinitely',worstBetween,CHANGE_FRAMES+4);").replace(
    "assertEq('two cars converging into one lane',tooClose,0);","")

PRELUDE = r'''
let FAILED=0;
function report(k,v){ console.log('    '+k+': '+v); }
function assertEq(k,got,want){
  const ok=got===want;
  console.log('    '+(ok?'ok  ':'FAIL')+'  '+k+': '+got+(ok?'':'  (expected '+want+')'));
  if(!ok) FAILED++;
}
function assertLt(k,got,want){
  const ok=got<want;
  console.log('    '+(ok?'ok   ':'FAIL ')+' '+k+': '+got+(ok?'':'  (expected < '+want+')'));
  if(!ok) failed++;
}
function assertGt(k,got,want){
  const ok=got>want;
  console.log('    '+(ok?'ok  ':'FAIL')+'  '+k+': '+got+(ok?'':'  (expected > '+want+')'));
  if(!ok) FAILED++;
}
process.on('exit',()=>{ if(FAILED) process.exitCode=1; });
'''

# Repeats matter. The skyline burial that held up the 1.0 checkpoint showed up
# in roughly one run in eight, so a single pass of a randomised suite is a coin
# toss dressed up as a result.
REPEATS = int(os.environ.get('REPEATS', '5'))
fails = 0
import re

# ===================================================================
# BOOT FILL  (source invariant, not a simulation)
# ===================================================================
# Nothing here runs the game. It reads the numbers out of the file and checks
# that the boot fill actually reaches the first of everything, because the way
# this fails is silent: `while (nextSkylineS<a)` with the cursor past `a` is
# zero iterations and no error. The city still appears — a few seconds later,
# during play, dragging every first-time shader compile in the build with it.
print('\n== boot-fill ==  (source invariant)')
_bf = 0
def _need(k, ok, detail):
    global _bf
    print('    ' + ('ok    ' if ok else 'FAIL  ') + k + ': ' + detail)
    if not ok: _bf += 1

def _num(pat):
    m = re.search(pat, src)
    return float(m.group(1)) if m else None

LOOKAHEAD = _num(r'LOOKAHEAD=(\d+)')
cursors = {
    'skyline':   _num(r'let nextSkylineS=(\d+)'),
    'overpasses':_num(r'let nextOverpassS=(\d+)'),
    'towers':    _num(r'let nextTowerS=(\d+)'),
    'lamps':     _num(r'let nextLampS=(\d+)'),
}
boot = src[src.index("// BOOT\n"):src.index("function animate()")]
m = re.search(r"const BOOT_FILL=Math\.max\(([^)]*)\)\+LOOKAHEAD;", boot)
_need('the boot fill target is derived from the cursors', bool(m),
      m.group(1) if m else 'BOOT_FILL not found')
if m and LOOKAHEAD:
    named = [c.strip() for c in m.group(1).split(',')]
    fill = max(cursors[k] for k in cursors
               if ('next' + ('Skyline' if k=='skyline' else 'Overpass' if k=='overpasses'
                   else 'Tower' if k=='towers' else 'Lamp') + 'S') in named) + LOOKAHEAD
    for name, cur in sorted(cursors.items()):
        _need('boot builds the first ' + name, cur < fill,
              'cursor %g, fill reaches %g' % (cur, fill))
for name, call in [('towers','maybeSpawnTowers(BOOT_FILL)'),
                   ('skyline','maybeSpawnSkyline(BOOT_FILL'),
                   ('lamps','maybeSpawnLamps(BOOT_FILL)'),
                   ('overpasses','maybeSpawnOverpasses(BOOT_FILL)')]:
    _need('boot fills ' + name + ' at all', call in boot, call)
_need('shaders are compiled before the start screen clears',
      'renderer.compile(' in boot, 'renderer.compile(scene,camera)')
fails += _bf

for name, body in TESTS.items():
    path = '/tmp/hp_test_%s.js' % name
    open(path, 'w').write(PRELUDE + body)
    print('\n== %s ==  (x%d)' % (name, REPEATS))
    bad = 0
    for run in range(REPEATS):
        r = subprocess.run(['node', path], capture_output=True, text=True)
        if run == 0:
            sys.stdout.write(r.stdout)
            if r.stderr:
                sys.stdout.write(r.stderr)
        if r.returncode:
            bad += 1
    if bad:
        print('    !! failed %d of %d runs' % (bad, REPEATS))
        fails += 1

# the rider harness maintains its own extraction and is run as-is
print('\n== rider ==')
r = subprocess.run(['node', 'smoke.js'], capture_output=True, text=True,
                   cwd=os.path.dirname(__file__))
if r.returncode:
    sys.stdout.write(r.stderr); fails += 1
else:
    import json
    d = json.loads(r.stdout)
    def chk(k, got, want):
        global fails
        ok = got == want
        print('    %s  %s: %s' % ('ok  ' if ok else 'FAIL', k, got))
        if not ok: fails += 1
    chk('aim arm chain error', d['aim']['armChainErr'], 0)
    chk('rear cone breaches', d['aim']['breachedRearClamp'], 0)
    chk('muzzle transform error', d['aim']['muzzleErr'], 0)
    chk('head aim error (deg)', d['headLook']['worstAimErrorDeg'], 0)
    chk('grabs needing a stretched arm', d['grab']['casesNeedingAStretchedArm'], 0)
    chk('hitched grabs stretched', d['hitchAim']['grabArmStretched'], 0)
    chk('sidearm vs target (deg)', d['hitchAim']['sidearmVsTargetDeg'], 0)
    chk('pose drift after settling', d['hitchAim']['poseDriftAfterSettling'], 0)
    chk('stance flips with the car side', d['stance']['stanceActuallyFlipped'], True)
    chk('grabs across her own chest', d['stance']['acrossChestWhileAimingAhead'], 0)
    chk('gun hand mirrors with the side', d['stance']['gunHandMirrorsWithSide'], True)
    chk('stretch during the arm swap', d['stance']['worstStretchDuringSwap'], 0)
    chk('tail hitch: gun on the wrong side', d['stance']['tailHitch_gunOnWrongSide'], 0)
    chk('tail hitch: grab hand on the aim side', d['stance']['tailHitch_grabOnAimSide'], 0)
    chk('nose hitch: gun on the wrong side', d['stance']['noseHitch_gunOnWrongSide'], 0)
    chk('reach envelope: grabs needing a stretched arm', d['ramp']['stretched'], 0)
    print('    rider draw calls: %s' % d['riderMeshes'])

print('\n%s' % ('ALL PASS' if not fails else '%d SUITE(S) FAILED' % fails))
sys.exit(1 if fails else 0)
