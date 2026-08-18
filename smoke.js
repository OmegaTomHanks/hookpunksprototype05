// Pull the coachwork + player-rig blocks out of the prototype and execute
// them against the stub, to prove the construction path doesn't throw.
const fs=require('fs');
const THREE=require('./stub.js');

const src=fs.readFileSync(process.env.HP||'hookpunks_prototype1_0_5.html','utf8');
function slice(startMark,endMark){
  const a=src.indexOf(startMark); const b=src.indexOf(endMark,a);
  if(a<0||b<0) throw new Error('marker not found: '+startMark.slice(0,40)+' / '+endMark.slice(0,40));
  return src.slice(a,b);
}

const carsBlock  = slice('const CAR_TYPES=[', 'for (let i=0;i<CAR_COUNT;i++) spawnCar');
const playerBlock= slice("const player=new THREE.Group(); player.rotation.order='YXZ';",
                         'const playerLight=new THREE.PointLight');

const prelude=`
const V3=THREE.Vector3, UP=new V3(0,1,0);
const clamp=THREE.MathUtils.clamp, lerp=THREE.MathUtils.lerp;
const LOOK={smog:0x0d0603,haze:0x6b3010,horizon:0xd4671f,sodium:0xffb347,ember:0xff6a1f,
  rust:0x8a3418,ash:0x1a120c,concrete:0x120c08,bone:0xfff0cf,arc:0xaef2ff,arcHot:0xf2fdff,
  sign:0xffcf4a,amb:0x4a2410,key:0xffb066,rim:0x4a6c96};


const cars=[],scene=new THREE.Group();
const st={turnInput:0,roll:0,grounded:true,tailDrag:false,braking:false,drifting:false,
  grinding:false,brakeLevel:0,riderSpin:0};
const hitch={car:null,u:0,face:'rear'};
// a stand-in car and hitch geometry: the grab point is the bodywork, the
// player is parked one standoff out from it on the normal
let HITCH_POINT=new THREE.Vector3();
function hitchWorld(c,u,standoff,out,bodyOut){
  if (bodyOut) bodyOut.copy(HITCH_POINT);
  out.copy(HITCH_POINT);
  return {face:'rear'};
}
const harp={firing:false,attached:false};
// free look is gone; aiming is the ordinary camera ray again. The harness
// drives it by pointing the stand-in ray, exactly as the mouse would.
function aimAt(yaw,pitch){
  const cp=Math.cos(pitch);
  const d=new THREE.Vector3(Math.sin(yaw)*cp,Math.sin(pitch),Math.cos(yaw)*cp);
  raycaster.ray.origin.copy(player.position).addScaledVector(d,-6);
  raycaster.ray.origin.y+=4;
  raycaster.ray.direction.copy(d);
  return d;
}
const P={hitchStandoff:{v:0.62}};
const g=k=>P[k].v;
const solids=[];
const MAX_TARGET_RANGE=55;
const mouseNDC={x:0,y:0};
const camera={};
const _hitTargets=[];
function grappleTargets(){ return []; }
// a stand-in raycaster: setFromCamera writes a ray we control from the test
const raycaster={ray:{origin:new THREE.Vector3(),direction:new THREE.Vector3(0,0,1)},
  setFromCamera(){}, intersectObjects(){ return []; }};
const LANE_COUNT=4,ROAD_WIDTH=16,LANE_WIDTH=4;
`;

const epilogue=`
// build one of every car type and count what a car actually costs
const seen={};
for (const t of CAR_TYPES){
  const g=buildCarBody(t);
  let meshes=0,verts=0;
  g.traverse(o=>{ if(o.isMesh){meshes++; verts+=o.geometry.attributes.position.count;} });
  seen[t.name]={drawCalls:meshes,verts};
}
let riderMeshes=0;
player.traverse(o=>{ if(o.isMesh) riderMeshes++; });
// exercise the per-frame path across the states that drive the pose
// (aim tests run after, once the rig has been posed at least once)
const samples=[];
for (const c of [
  {n:'idle',      spd:0,  roll:0,    ti:0,  g:true,  b:0,   s:{}},
  {n:'cruise',    spd:14, roll:0.10, ti:0.4,g:true,  b:0,   s:{}},
  {n:'flat out',  spd:40, roll:-0.2, ti:-1, g:true,  b:0,   s:{}},
  {n:'tail drag', spd:20, roll:0,    ti:0,  g:true,  b:1,   s:{tailDrag:true,braking:true}},
  {n:'grinding',  spd:30, roll:0.05, ti:0.2,g:true,  b:0,   s:{grinding:true}},
  {n:'airborne',  spd:36, roll:0,    ti:0.6,g:false, b:0,   s:{}},
  {n:'hitched',   spd:34, roll:0.24, ti:0,  g:true,  b:0,   s:{}, hitch:true},
]){
  Object.assign(st,{grounded:true,tailDrag:false,braking:false,drifting:false,grinding:false},c.s);
  st.turnInput=c.ti; st.roll=c.roll; st.grounded=c.g; st.brakeLevel=c.b;
  hitch.car=c.hitch?{}:null;
  const bAng=22*Math.PI/180*c.b;
  board.rotation.x=-bAng; board.position.y=0.15+Math.sin(bAng)*0.9;
  for (let i=0;i<200;i++){ updateRider(0.016,c.spd,bAng); updateDangles(0.016,c.spd,c.roll); }
  const chk=v=>{ if(!isFinite(v)){ console.error('NaN dump',c.n,JSON.stringify({
    pose,STANCE,stanceT,gunSide,gunSideT,rightV:[_rightV.x,_rightV.y,_rightV.z],
    FACE:[FACE.x,FACE.y,FACE.z],shoGun:[_shoGun.x,_shoGun.y,_shoGun.z],
    hip0:[legs[0].hip.x,legs[0].hip.y,legs[0].hip.z]}));
    throw new Error('NaN in pose: '+c.n);} return +v.toFixed(3); };
  const row={state:c.n,crouch:chk(pose.crouch),lean:chk(pose.lean),pitch:chk(pose.pitch)};
  for (const [tag,i] of [['front',0],['back',1]]){
    const L=legs[i];
    const hip=L.hip.clone().applyMatrix4(_poseM);   // hip is a live V3 now
    // reconstruct the knee from the posed thigh bone: origin + scaled +Y axis
    const q=L.thigh.quaternion, sy=L.thigh.scale.y;
    const ax=2*(q.x*q.y-q.w*q.z)*sy, ay=(1-2*(q.x*q.x+q.z*q.z))*sy, az=2*(q.y*q.z+q.w*q.x)*sy;
    const kn={x:L.thigh.position.x+ax,y:L.thigh.position.y+ay,z:L.thigh.position.z+az};
    const ank=L.ankle;
    // the two bones must still exactly span hip->ankle or the leg has snapped
    const d=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
    // the chain must close: hip->knee == thigh length, knee->ankle == shin
    const chain=Math.abs(d(hip,L.thigh.position))
               +Math.abs(d(hip,kn)-L.thigh.scale.y)
               +Math.abs(d(kn,ank)-L.shin.scale.y);
    row[tag+'Boot']=chk(L.boot.g.position.y);
    row[tag+'Hip'] =chk(hip.y);
    row[tag+'Knee']=chk(kn.y);
    row[tag+'Gap'] =+(d(hip,ank)-(L.thigh.scale.y+L.shin.scale.y)).toFixed(3);
    row[tag+'Err'] =+(Math.abs(chain)).toFixed(4);
  }
  samples.push(row);
}
// ---- AIM ----
// Point the camera ray at a grid of targets all round the player and check
// three things: the arm chain closes, the launcher ends up in her hand, and
// the muzzle world position agrees with an independent transform.
const V=THREE.Vector3;
Object.assign(st,{grounded:true,tailDrag:false,braking:false,drifting:false,grinding:false});
st.turnInput=0; st.roll=0; st.brakeLevel=0;
hitch.car=null;
player.position.set(12,3,-40);
player.rotation.set(0.05,0.7,-0.12);
rider.rotation.y=0.2;
board.position.y=0.15;

let chainErr=0, gripErr=0, muzzleErr=0, behind=0, n=0, minZ=1e9;
for (let yaw=-Math.PI; yaw<Math.PI; yaw+=0.2) for (const pitch of [-0.9,-0.3,0,0.4,1.0]){
  // aim the stand-in camera ray straight at a chosen world point
  const dir=new V(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
  raycaster.ray.origin.copy(player.position).addScaledVector(dir,-6).add(new V(0,4,0));
  raycaster.ray.direction.copy(dir);
  for (let k=0;k<40;k++) updateRider(0.016,20,0);   // settle
  n++;

  // 1. arm chain closes: shoulder->elbow == upper, elbow->grip == fore
  const sho=_shoGun.clone().applyMatrix4(_poseM);
  const q=aimUpper.quaternion, sy=aimUpper.scale.y;
  const el=new V(aimUpper.position.x+2*(q.x*q.y-q.w*q.z)*sy,
                 aimUpper.position.y+(1-2*(q.x*q.x+q.z*q.z))*sy,
                 aimUpper.position.z+2*(q.y*q.z+q.w*q.x)*sy);
  chainErr=Math.max(chainErr,Math.abs(aimUpper.position.distanceTo(sho)));
  chainErr=Math.max(chainErr,Math.abs(el.distanceTo(sho)-AIM_UPPER));
  chainErr=Math.max(chainErr,Math.abs(aimFore.scale.y-AIM_FORE));

  // 2. the launcher sits at the end of the forearm, not floating
  const wristQ=aimFore.quaternion, wy=aimFore.scale.y;
  const wrist=new V(aimFore.position.x+2*(wristQ.x*wristQ.y-wristQ.w*wristQ.z)*wy,
                    aimFore.position.y+(1-2*(wristQ.x*wristQ.x+wristQ.z*wristQ.z))*wy,
                    aimFore.position.z+2*(wristQ.y*wristQ.z+wristQ.w*wristQ.x)*wy);
  gripErr=Math.max(gripErr,wrist.distanceTo(launcher.position));

  // 3. muzzle world position, recomputed independently
  const qr=new THREE.Quaternion().copy(player.quaternion).multiply(rider.quaternion);
  const mw=new V(MUZZLE[0],MUZZLE[1],MUZZLE[2])
    .applyQuaternion(launcher.quaternion).add(launcher.position)
    .applyQuaternion(qr).add(player.position);
  muzzleErr=Math.max(muzzleErr,mw.distanceTo(aim.muzzle));

  // 4. she never points it behind her own head
  minZ=Math.min(minZ,aim.dir.z);
  if (aim.dir.z<-0.36) behind++;
}
const aimRes={samplesTested:n,
  armChainErr:+chainErr.toFixed(5),
  launcherOffHand:+gripErr.toFixed(5),
  muzzleErr:+muzzleErr.toFixed(5),
  mostRearwardAimZ:+minZ.toFixed(3),
  breachedRearClamp:behind};

// hands full: the weapon must come down when she grabs a car
hitch.car={};
for (let k=0;k<200;k++) updateRider(0.016,20,0);
aimRes.weightWhenHitched=+aim.weight.toFixed(3);
aimRes.railBoltLoaded=railBolt.visible;
harp.attached=true; updateRider(0.016,20,0);
aimRes.railBoltWhenAttached=railBolt.visible;

// ---- HEAD ----
// The test that matters is not "did the numbers move" but "is her face
// actually pointing at the target". Rebuild the head's forward vector from
// the full parent chain and measure the angle to the thing she should be
// looking at.
const headRes={cases:0,worstErrDeg:0,clamped:0,offsets:[]};
player.position.set(0,0,0); player.rotation.set(0,0,0); rider.rotation.y=0;
hitch.car=null; st.turnInput=0; st.roll=0; st.brakeLevel=0;
for (let yaw=-1.2; yaw<=1.2; yaw+=0.15) for (const pitch of [-0.6,-0.2,0,0.3,0.7]){
  const dir=new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),
                              Math.cos(yaw)*Math.cos(pitch));
  raycaster.ray.origin.set(0,4,0).addScaledVector(dir,-6);
  raycaster.ray.direction.copy(dir);
  for (let k=0;k<300;k++) updateRider(0.016,20,0);
  headRes.cases++;

  // neck world orientation = torso pose * neck local
  const qWorld=new THREE.Quaternion().copy(_poseQ).multiply(neck.quaternion);
  const fwd=new THREE.Vector3(0,0,1).applyQuaternion(qWorld);
  // neck world position, and the point she should be looking at
  const neckPos=new THREE.Vector3(neck.position.x,neck.position.y-0.90,neck.position.z)
    .applyMatrix4(_poseM);
  const want=_aimPt.clone().sub(neckPos).normalize();
  const dot=Math.max(-1,Math.min(1,fwd.dot(want)));
  const errDeg=Math.acos(dot)*180/Math.PI;
  // at the neck limits she is SUPPOSED to fall short
  const atLimit=Math.abs(Math.abs(look.yaw)-1.35)<1e-3||
                Math.abs(look.pitch-0.90)<1e-3||Math.abs(look.pitch+0.80)<1e-3;
  if (atLimit) headRes.clamped++;
  else headRes.worstErrDeg=Math.max(headRes.worstErrDeg,errDeg);
}
// the neck pivot must actually carry the head sideways, not spin it in place
const headPos=[];
for (const yaw of [-1.0,0,1.0]){
  const dir=new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw));
  raycaster.ray.origin.set(0,4,0).addScaledVector(dir,-6);
  raycaster.ray.direction.copy(dir);
  for (let k=0;k<300;k++) updateRider(0.016,20,0);
  const p=new THREE.Vector3(head.position.x,head.position.y,head.position.z)
    .applyQuaternion(neck.quaternion).add(neck.position);
  headPos.push(p);
}
const headSweep=headPos[0].distanceTo(headPos[2]);
const headLook={casesTested:headRes.cases,
  worstAimErrorDeg:+headRes.worstErrDeg.toFixed(3),
  casesAtNeckLimit:headRes.clamped,
  headTravelAcrossFullTurn:+headSweep.toFixed(3)};

// ---- GRABBING ----
// Park the grab point where a real car's bodywork sits relative to a hitched
// player and check she actually reaches it, all the way round the car.
const hitchRes={cases:0,handOffCar:0,worstGap:0,chainErr:0,leans:[],crouches:[],twists:[]};
player.position.set(0,0,0); player.rotation.set(0,0,0); rider.rotation.y=0;
st.turnInput=0; st.roll=0; st.brakeLevel=0;
for (let ang=0; ang<Math.PI*2; ang+=0.25) for (const bodyY of [0.78,0.92,1.06]){
  // standoff 0.62 out from the bodywork, so the body point is 0.62 away
  // horizontally from the player, at the car's own grab height
  HITCH_POINT.set(Math.sin(ang)*0.62, bodyY, Math.cos(ang)*0.62);
  hitch.car={};
  for (let k=0;k<300;k++) updateRider(0.016,24,0);
  hitchRes.cases++;
  // The hand is DRAWN at the target, so checking that proves nothing. What
  // matters is whether the two fixed-length bones actually get there: if the
  // lean fell short, solveKnee clamps and the forearm's far end stops before
  // the car with the hand floating on the bodywork unattached to the arm.
  const tip=o=>{ const q=o.quaternion,sy=o.scale.y; return new THREE.Vector3(
    o.position.x+2*(q.x*q.y-q.w*q.z)*sy,
    o.position.y+(1-2*(q.x*q.x+q.z*q.z))*sy,
    o.position.z+2*(q.y*q.z+q.w*q.x)*sy); };
  // aimBone scales a bone to whatever span it is given, so an out-of-reach
  // grab shows up as a STRETCHED bone, not as a detached hand. That is the
  // number that matters.
  const stretch=Math.abs(trailUpper.scale.y-TRAIL_UPPER)
               +Math.abs(trailFore.scale.y-TRAIL_FORE)
               +tip(trailUpper).distanceTo(trailFore.position);
  if (stretch>0.02) hitchRes.handOffCar++;
  hitchRes.chainErr=Math.max(hitchRes.chainErr,stretch);
  // and record how far the shoulder still had to reach after the lean
  const shoR=_shoGrab.clone().applyMatrix4(_poseM);
  hitchRes.reaches=hitchRes.reaches||[];
  hitchRes.reaches.push(shoR.distanceTo(trailHand.position));
  hitchRes.leans.push(pose.lean); hitchRes.crouches.push(pose.crouch);
  hitchRes.twists.push(pose.twist);
}
const rng=a=>[Math.min(...a).toFixed(2),Math.max(...a).toFixed(2)].join(' .. ');
const grab={casesTested:hitchRes.cases,
  casesNeedingAStretchedArm:hitchRes.handOffCar,
  worstBoneStretch:+hitchRes.chainErr.toFixed(4),
  leanRange:rng(hitchRes.leans),crouchRange:rng(hitchRes.crouches),
  twistRange:rng(hitchRes.twists),
  shoulderToGrabRange:rng(hitchRes.reaches),
  armLimit:+(TRAIL_UPPER+TRAIL_FORE).toFixed(2)};
// and it must let go again
hitch.car=null;
for (let k=0;k<300;k++) updateRider(0.016,24,0);
grab.grabWeightAfterRelease=+pose.grab.toFixed(3);
grab.handReturnsToRest=+trailHand.position.distanceTo(
  new THREE.Vector3(TRAIL_REST[0],TRAIL_REST[1],TRAIL_REST[2])).toFixed(3);

// ---- HITCHED FREE AIM ----
// The dangerous interaction: while hitched the shoulders now follow the GUN,
// not the car, and the reach correction has to absorb that. Sweep every
// combination of grab point and aim heading and check the grabbing arm still
// closes, and that the gun still points where it was told to.
const fa={cases:0,stretched:0,worstStretch:0,worstAimErrDeg:0,
          reaches:[],twists:[],leans:[]};
player.position.set(0,0,0); player.rotation.set(0,0,0); rider.rotation.y=0;
st.turnInput=0; st.roll=0; st.brakeLevel=0;
for (let gAng=0; gAng<Math.PI*2; gAng+=0.45)
for (let aYaw=-Math.PI; aYaw<Math.PI; aYaw+=0.45)
for (const aPitch of [-1.2,0,1.2]){
  HITCH_POINT.set(Math.sin(gAng)*0.62,0.92,Math.cos(gAng)*0.62);
  hitch.car={};
  aimAt(aYaw,aPitch);
  for (let k=0;k<220;k++) updateRider(0.016,24,0);
  fa.cases++;

  const stretch=Math.abs(trailUpper.scale.y-TRAIL_UPPER)
               +Math.abs(trailFore.scale.y-TRAIL_FORE);
  if (stretch>0.02) fa.stretched++;
  fa.worstStretch=Math.max(fa.worstStretch,stretch);

  // The sidearm must point at whatever the cursor is over — but only where
  // she is ALLOWED to point it. The rear cone clamp deliberately stops her
  // aiming behind her own head, so those cases are counted, not measured:
  // folding them into the error just reports the clamp as a fault.
  const want=_aimPt.clone().sub(_shoGun.clone().applyMatrix4(_poseM)).normalize();
  const got=new THREE.Vector3(0,0,1).applyQuaternion(sidearm.quaternion);
  const dot=Math.max(-1,Math.min(1,got.dot(want)));
  const errD=Math.acos(dot)*180/Math.PI;
  if (want.z>-0.30) fa.worstAimErrDeg=Math.max(fa.worstAimErrDeg,errD);
  else { fa.clamped=(fa.clamped||0)+1; fa.worstClampedDeg=Math.max(fa.worstClampedDeg||0,errD); }

  const shoR=_shoGrab.clone().applyMatrix4(_poseM);
  fa.reaches.push(shoR.distanceTo(trailHand.position));
  fa.twists.push(pose.twist); fa.leans.push(pose.lean);
  // The twist is driven off aim.dir, and aim.dir is measured from a shoulder
  // the twist just moved. That is a loop, so prove it settles rather than
  // hunting: run on and see if anything is still moving.
  const t0=pose.twist,l0=pose.lean,c0=pose.crouch;
  for (let k=0;k<40;k++) updateRider(0.016,24,0);
  const dr=Math.abs(pose.twist-t0)+Math.abs(pose.lean-l0)+Math.abs(pose.crouch-c0);
  if (dr>(fa.drift||0)){ fa.drift=dr; fa.worstCase={gAng:+gAng.toFixed(2),
    aYaw:+aYaw.toFixed(2),aPitch,dTwist:+(pose.twist-t0).toFixed(3),
    dLean:+(pose.lean-l0).toFixed(3),dCrouch:+(pose.crouch-c0).toFixed(3)}; }
}
const rg=a=>[Math.min(...a).toFixed(2),Math.max(...a).toFixed(2)].join(' .. ');
const freeAimRes={casesTested:fa.cases,
  grabArmStretched:fa.stretched,worstStretch:+fa.worstStretch.toFixed(4),
  sidearmVsTargetDeg:+fa.worstAimErrDeg.toFixed(3),
  casesBehindTheCone:fa.clamped||0,
  worstClampedShortfallDeg:+(fa.worstClampedDeg||0).toFixed(1),
  poseDriftAfterSettling:+(fa.drift||0).toFixed(5),
  worstDriftCase:fa.worstCase,
  shoulderToGrabRange:rg(fa.reaches),armLimit:+(TRAIL_UPPER+TRAIL_FORE).toFixed(2),
  twistRange:rg(fa.twists),leanRange:rg(fa.leans),
  sidearmVisible:sidearm.visible,launcherVisible:launcher.visible};
hitch.car=null;
for (let k=0;k<300;k++) updateRider(0.016,24,0);
freeAimRes.launcherBackAfterRelease=launcher.visible;
freeAimRes.sidearmStowedAfterRelease=!sidearm.visible;


// ---- REACH ENVELOPE ----
// The ramp stretch turned out to be hitchWorld putting the hold in the wrong
// place, not the solver failing — so modelling the old broken offsets here
// would be testing a geometry that can no longer happen. What's worth testing
// is the envelope that CAN: every car height, the usable standoff band, every
// point round the perimeter, and the residual mismatch between the player's
// ground sample and the car's own height that a crest or trough leaves behind.
const ramp={cases:0,stretched:0,worst:0,worstCase:null,reaches:[]};
player.position.set(0,0,0); player.rotation.set(0,0,0); rider.rotation.y=0;
st.turnInput=0; st.roll=0; st.brakeLevel=0;
aimAt(0,0);
for (const carH of [1.1,1.3,1.4,1.5])           // every car type
for (const standoff of [0.45,0.62,0.85])        // usable hold distance
for (let ang=0; ang<Math.PI*2; ang+=0.5)        // all round the car
for (const tilt of [-0.18,0,0.18]){             // crest / trough mismatch
  const up=carH*0.7;                            // body point above the road
  HITCH_POINT.set(Math.sin(ang)*standoff, up+tilt, Math.cos(ang)*standoff);
  hitch.car={}; settle(400);
  ramp.cases++;
  const st4=Math.abs(trailUpper.scale.y-TRAIL_UPPER)+Math.abs(trailFore.scale.y-TRAIL_FORE);
  if (st4>0.02){ ramp.stretched++;
    if (st4>ramp.worst){ ramp.worst=st4;
      ramp.worstCase={carH,standoff,ang:+ang.toFixed(2),tilt}; } }
  const shoR=_shoGrab.clone().applyMatrix4(_poseM);
  ramp.reaches.push(shoR.distanceTo(trailHand.position));
}
const rampRes={cases:ramp.cases,stretched:ramp.stretched,
  worstStretch:+ramp.worst.toFixed(4),worstCase:ramp.worstCase,
  reachRange:[Math.min(...ramp.reaches).toFixed(2),Math.max(...ramp.reaches).toFixed(2)].join(' .. '),
  armLimit:+(TRAIL_UPPER+TRAIL_FORE).toFixed(2)};
hitch.car=null; for(let k=0;k<300;k++) updateRider(0.016,24,0);

// ---- STANCE AND ARM ASSIGNMENT ----
// Two behaviours that are easy to get backwards: she should end up FACING the
// car whichever side she is on, and the gun should change hands when the
// target crosses behind her.
const stanceRes={};
player.position.set(0,0,0); player.rotation.set(0,0,0); rider.rotation.y=0;
function settle(n){ for(let k=0;k<(n||400);k++) updateRider(0.016,24,0); }
function facesCar(){
  // chest direction vs the direction to the car, in the horizontal plane
  const toCar=new THREE.Vector3(HITCH_POINT.x,0,HITCH_POINT.z).normalize();
  return FACE.x*toCar.x+FACE.z*toCar.z;
}
aimAt(0,0);
hitch.car={};
HITCH_POINT.set(-0.62,0.92,0); settle();
stanceRes.carRoadLeft_stance=+STANCE.toFixed(2);
stanceRes.carRoadLeft_facingDot=+facesCar().toFixed(3);
HITCH_POINT.set(0.62,0.92,0); settle();
stanceRes.carRoadRight_stance=+STANCE.toFixed(2);
stanceRes.carRoadRight_facingDot=+facesCar().toFixed(3);
stanceRes.stanceActuallyFlipped=
  Math.sign(stanceRes.carRoadLeft_stance)!==Math.sign(stanceRes.carRoadRight_stance);
// which foot leads should flip with her
const frontHipZ=[];
HITCH_POINT.set(-0.62,0.92,0); settle(); frontHipZ.push(+legs[0].hip.z.toFixed(3));
HITCH_POINT.set( 0.62,0.92,0); settle(); frontHipZ.push(+legs[0].hip.z.toFixed(3));
stanceRes.frontHipStaysAtNose=frontHipZ.every(v=>v>0);
stanceRes.frontHipSideSwapped=Math.sign(legs[0].hip.x)!==0;

// Grabbing across your own chest is the failure this is meant to prevent:
// the holding hand should be the one already on the car's side.
function handSides(){
  const grabDot=_shoGrab.x*_grabPt.x+_shoGrab.z*_grabPt.z;   // >0 = near hand
  const gunDot =_shoGun.x*_grabPt.x+_shoGun.z*_grabPt.z;     // >0 = gun hand is the near one
  return {grabDot,gunDot,reachesAcross:grabDot<0};
}
aimAt(0,0);
for (const [tag,x] of [['carRoadLeft',-0.62],['carRoadRight',0.62]]){
  HITCH_POINT.set(x,0.92,0); hitch.car={}; settle();
  const h=handSides();
  stanceRes[tag+'_gunSide']=+gunSide.toFixed(2);
  stanceRes[tag+'_grabsAcrossChest']=h.reachesAcross;
  stanceRes[tag+'_grabHandDot']=+h.grabDot.toFixed(3);
}
stanceRes.gunHandMirrorsWithSide=
  Math.sign(stanceRes.carRoadLeft_gunSide)!==Math.sign(stanceRes.carRoadRight_gunSide);

// ---- hitched to the TAIL: the aim picks the hands ----
// Square on to the back of a car neither hand is nearer, so the arm holding
// the gun should be the one on the side you are pointing. Measured in TRAVEL
// space — the x of the shoulder in the world, not in her turned-about frame —
// because "left" means the arm on the left of the screen.
{
  const tail={cases:0,wrongSide:0,across:0,stretched:0};
  HITCH_POINT.set(0,0.92,0.62);            // car body dead ahead: a rear hitch
  hitch.car={};
  for (const yaw of [-1.0,-0.6,-0.25,0.25,0.6,1.0]){
    aimAt(yaw,0); settle(300);
    tail.cases++;
    const gunX=_shoGun.x, grabX=_shoGrab.x;   // rider space == travel space here
    // gun shoulder must be on the side we're aiming, grab hand on the other
    if (Math.sign(gunX)!==Math.sign(yaw)) tail.wrongSide++;
    if (Math.sign(grabX)===Math.sign(yaw)) tail.across++;
    const st3=Math.abs(trailUpper.scale.y-TRAIL_UPPER)+Math.abs(trailFore.scale.y-TRAIL_FORE);
    if (st3>0.02) tail.stretched++;
  }
  stanceRes.tailHitch_cases=tail.cases;
  stanceRes.tailHitch_gunOnWrongSide=tail.wrongSide;
  stanceRes.tailHitch_grabOnAimSide=tail.across;
  stanceRes.tailHitch_armStretched=tail.stretched;
  // and a NOSE hitch is the same geometry mirrored
  HITCH_POINT.set(0,0.92,-0.62);
  let noseWrong=0;
  for (const yaw of [-0.8,0.8]){ aimAt(yaw,0); settle(300);
    if (Math.sign(_shoGun.x)!==Math.sign(yaw)) noseWrong++; }
  stanceRes.noseHitch_gunOnWrongSide=noseWrong;
}

// arm swap: sweep the aim from dead ahead round to dead behind
HITCH_POINT.set(-0.62,0.92,0);
const swap={aheadGunSide:0,behindGunSide:0,stretched:0,worst:0,flips:0};
let prevSide=null;
for (let yaw=0; yaw<=Math.PI*2+0.01; yaw+=0.15){
  const y=yaw>Math.PI?yaw-Math.PI*2:yaw;
  aimAt(y,0);
  settle(140);
  const st2=Math.abs(trailUpper.scale.y-TRAIL_UPPER)+Math.abs(trailFore.scale.y-TRAIL_FORE);
  if (st2>0.02) swap.stretched++;
  swap.worst=Math.max(swap.worst,st2);
  const side=Math.sign(gunSide);
  if (prevSide!==null&&side!==prevSide) swap.flips++;
  prevSide=side;
  if (Math.abs(y)<0.08) swap.aheadGunSide=+gunSide.toFixed(2);
  if (Math.abs(Math.abs(y)-Math.PI)<0.16) swap.behindGunSide=+gunSide.toFixed(2);
  if (handSides().reachesAcross&&Math.abs(y)<1.2) swap.acrossChestAhead=(swap.acrossChestAhead||0)+1;
}
stanceRes.gunSideAimingAhead=swap.aheadGunSide;
stanceRes.gunSideAimingBehind=swap.behindGunSide;
stanceRes.armsSwappedOnce=swap.flips;
stanceRes.grabArmStretchedDuringSwap=swap.stretched;
stanceRes.worstStretchDuringSwap=+swap.worst.toFixed(4);
stanceRes.acrossChestWhileAimingAhead=swap.acrossChestAhead||0;
hitch.car=null; settle();
stanceRes.stanceReturnsToNatural=+STANCE.toFixed(2);

module.exports={seen,riderMeshes,dangleCount:dangles.length,samples,aim:aimRes,grab,headLook,hitchAim:freeAimRes,stance:stanceRes,ramp:rampRes};
`;

const code=prelude+carsBlock+playerBlock+epilogue;
fs.writeFileSync('/tmp/built.js',code);
const m={exports:{}};
new Function('THREE','module','require',code)(THREE,m,require);
console.log(JSON.stringify(m.exports,null,2));
