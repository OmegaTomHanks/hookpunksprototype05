// Tiny stand-in for the slice of three.js the model-building code touches.
// Enough real behaviour (matrices, attributes) to run buildCarBody and the
// player rig and catch anything that would throw in the browser.
class Vector3{
  constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
  set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}
  copy(v){this.x=v.x;this.y=v.y;this.z=v.z;return this;}
  clone(){return new Vector3(this.x,this.y,this.z);}
  subVectors(a,b){this.x=a.x-b.x;this.y=a.y-b.y;this.z=a.z-b.z;return this;}
  addScaledVector(v,s){this.x+=v.x*s;this.y+=v.y*s;this.z+=v.z*s;return this;}
  add(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this;}
  length(){return Math.hypot(this.x,this.y,this.z);}
  lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z;}
  normalize(){const l=this.length()||1;this.x/=l;this.y/=l;this.z/=l;return this;}
  multiplyScalar(s){this.x*=s;this.y*=s;this.z*=s;return this;}
  dot(v){return this.x*v.x+this.y*v.y+this.z*v.z;}
  crossVectors(a,b){this.x=a.y*b.z-a.z*b.y;this.y=a.z*b.x-a.x*b.z;this.z=a.x*b.y-a.y*b.x;return this;}
  applyQuaternion(q){
    const {x,y,z}=this,qx=q.x,qy=q.y,qz=q.z,qw=q.w;
    const ix=qw*x+qy*z-qz*y, iy=qw*y+qz*x-qx*z, iz=qw*z+qx*y-qy*x, iw=-qx*x-qy*y-qz*z;
    this.x=ix*qw+iw*-qx+iy*-qz-iz*-qy;
    this.y=iy*qw+iw*-qy+iz*-qx-ix*-qz;
    this.z=iz*qw+iw*-qz+ix*-qy-iy*-qx;
    return this;}
  sub(v){this.x-=v.x;this.y-=v.y;this.z-=v.z;return this;}
  lerp(v,t){this.x+=(v.x-this.x)*t;this.y+=(v.y-this.y)*t;this.z+=(v.z-this.z)*t;return this;}
  distanceTo(v){return Math.hypot(this.x-v.x,this.y-v.y,this.z-v.z);}
  applyMatrix4(m){const e=m.elements,{x,y,z}=this;
    const w=1/((e[3]*x+e[7]*y+e[11]*z+e[15])||1);
    this.x=(e[0]*x+e[4]*y+e[8]*z+e[12])*w;
    this.y=(e[1]*x+e[5]*y+e[9]*z+e[13])*w;
    this.z=(e[2]*x+e[6]*y+e[10]*z+e[14])*w;return this;}
}
class Quaternion{
  constructor(){this.x=0;this.y=0;this.z=0;this.w=1;this._cb=null;}
  set(x,y,z,w){this.x=x;this.y=y;this.z=z;this.w=w;this._onChange();return this;}
  _onChange(){if(this._cb)this._cb();}
  setFromUnitVectors(a,b){
    let r=a.dot(b)+1;
    if(r<1e-8){r=0;
      if(Math.abs(a.x)>Math.abs(a.z))this.set(-a.y,a.x,0,r);else this.set(0,-a.z,a.y,r);
    } else {
      const c=new Vector3().crossVectors(a,b);
      this.set(c.x,c.y,c.z,r);
    }
    const l=Math.hypot(this.x,this.y,this.z,this.w)||1;
    this.x/=l;this.y/=l;this.z/=l;this.w/=l;this._onChange();return this;}
  // order matters: the rig uses ZXY for the torso and YXZ for the neck and
  // boots, and composing them all as XYZ silently produces a different pose
  setFromEuler(e){
    const c1=Math.cos(e._x/2),c2=Math.cos(e._y/2),c3=Math.cos(e._z/2);
    const s1=Math.sin(e._x/2),s2=Math.sin(e._y/2),s3=Math.sin(e._z/2);
    switch(e.order){
      case 'YXZ':
        this.x=s1*c2*c3+c1*s2*s3;this.y=c1*s2*c3-s1*c2*s3;
        this.z=c1*c2*s3-s1*s2*c3;this.w=c1*c2*c3+s1*s2*s3;break;
      case 'ZXY':
        this.x=s1*c2*c3-c1*s2*s3;this.y=c1*s2*c3+s1*c2*s3;
        this.z=c1*c2*s3+s1*s2*c3;this.w=c1*c2*c3-s1*s2*s3;break;
      case 'ZYX':
        this.x=s1*c2*c3-c1*s2*s3;this.y=c1*s2*c3+s1*c2*s3;
        this.z=c1*c2*s3-s1*s2*c3;this.w=c1*c2*c3+s1*s2*s3;break;
      default:  // XYZ
        this.x=s1*c2*c3+c1*s2*s3;this.y=c1*s2*c3-s1*c2*s3;
        this.z=c1*c2*s3+s1*s2*c3;this.w=c1*c2*c3-s1*s2*s3;
    }
    this._onChange();return this;}
  copy(q){this.x=q.x;this.y=q.y;this.z=q.z;this.w=q.w;this._onChange();return this;}
  setFromRotationMatrix(m){
    const te=m.elements,m11=te[0],m12=te[4],m13=te[8],m21=te[1],m22=te[5],m23=te[9],
      m31=te[2],m32=te[6],m33=te[10],tr=m11+m22+m33;
    if(tr>0){const S=0.5/Math.sqrt(tr+1);this.w=0.25/S;this.x=(m32-m23)*S;this.y=(m13-m31)*S;this.z=(m21-m12)*S;}
    else if(m11>m22&&m11>m33){const S=2*Math.sqrt(1+m11-m22-m33);this.w=(m32-m23)/S;this.x=0.25*S;this.y=(m12+m21)/S;this.z=(m13+m31)/S;}
    else if(m22>m33){const S=2*Math.sqrt(1+m22-m11-m33);this.w=(m13-m31)/S;this.x=(m12+m21)/S;this.y=0.25*S;this.z=(m23+m32)/S;}
    else{const S=2*Math.sqrt(1+m33-m11-m22);this.w=(m21-m12)/S;this.x=(m13+m31)/S;this.y=(m23+m32)/S;this.z=0.25*S;}
    if(!isFinite(this.x+this.y+this.z+this.w))throw new Error('NaN quaternion from basis');
    this._onChange();return this;}
  clone(){return new Quaternion().copy(this);}
  multiply(q){return this.multiplyQuaternions(this,q);}
  multiplyQuaternions(a,b){
    const qax=a.x,qay=a.y,qaz=a.z,qaw=a.w,qbx=b.x,qby=b.y,qbz=b.z,qbw=b.w;
    this.x=qax*qbw+qaw*qbx+qay*qbz-qaz*qby;
    this.y=qay*qbw+qaw*qby+qaz*qbx-qax*qbz;
    this.z=qaz*qbw+qaw*qbz+qax*qby-qay*qbx;
    this.w=qaw*qbw-qax*qbx-qay*qby-qaz*qbz;
    this._onChange();return this;}
  invert(){this.x*=-1;this.y*=-1;this.z*=-1;this._onChange();return this;}
}
class Euler{
  constructor(x=0,y=0,z=0,order='XYZ'){this._x=x;this._y=y;this._z=z;this.order=order;this._cb=null;}
  get x(){return this._x;} set x(v){this._x=v;this._onChange();}
  get y(){return this._y;} set y(v){this._y=v;this._onChange();}
  get z(){return this._z;} set z(v){this._z=v;this._onChange();}
  _onChange(){if(this._cb)this._cb();}
  set(x,y,z,order){this._x=x;this._y=y;this._z=z;if(order)this.order=order;this._onChange();return this;}
  setFromQuaternion(){return this;}
  copy(e){this._x=e._x;this._y=e._y;this._z=e._z;this.order=e.order;this._onChange();return this;}
  clone(){const e=new Euler();e.copy(this);return e;}
}
class Matrix4{
  constructor(){this.elements=[1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];}
  copy(m){this.elements=m.elements.slice();return this;}
  clone(){return new Matrix4().copy(this);}
  identity(){this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];return this;}
  compose(p,q,s){
    const te=this.elements;
    const x=q.x,y=q.y,z=q.z,w=q.w,x2=x+x,y2=y+y,z2=z+z;
    const xx=x*x2,xy=x*y2,xz=x*z2,yy=y*y2,yz=y*z2,zz=z*z2;
    const wx=w*x2,wy=w*y2,wz=w*z2;
    te[0]=(1-(yy+zz))*s.x; te[1]=(xy+wz)*s.x; te[2]=(xz-wy)*s.x; te[3]=0;
    te[4]=(xy-wz)*s.y; te[5]=(1-(xx+zz))*s.y; te[6]=(yz+wx)*s.y; te[7]=0;
    te[8]=(xz+wy)*s.z; te[9]=(yz-wx)*s.z; te[10]=(1-(xx+yy))*s.z; te[11]=0;
    te[12]=p.x; te[13]=p.y; te[14]=p.z; te[15]=1; return this;}
  multiplyMatrices(a,b){
    const ae=a.elements,be=b.elements,te=this.elements.slice();
    for(let c=0;c<4;c++)for(let r=0;r<4;r++){
      let v=0; for(let k=0;k<4;k++) v+=ae[k*4+r]*be[c*4+k];
      te[c*4+r]=v;}
    this.elements=te;return this;}
  makeRotationY(t){const c=Math.cos(t),s=Math.sin(t);
    this.elements=[c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1];return this;}
  makeRotationZ(t){const c=Math.cos(t),s=Math.sin(t);
    this.elements=[c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1];return this;}
  makeBasis(x,y,z){this.elements=[x.x,x.y,x.z,0, y.x,y.y,y.z,0, z.x,z.y,z.z,0, 0,0,0,1];return this;}
  makeTranslation(x,y,z){this.identity();this.elements[12]=x;this.elements[13]=y;this.elements[14]=z;return this;}
}
class Matrix3{ constructor(){this.elements=[1,0,0,0,1,0,0,0,1];}
  getNormalMatrix(){return this;} }
class Color{
  constructor(c){this.setHex(c||0xffffff);}
  setHex(h){this.hex=h;this.r=((h>>16)&255)/255;this.g=((h>>8)&255)/255;this.b=(h&255)/255;return this;}
  getHex(){return this.hex;}
  lerp(){return this;}
}

class Box3{
  constructor(){this.min={x:1/0,y:1/0,z:1/0};this.max={x:-1/0,y:-1/0,z:-1/0};}
  setFromObject(o){
    this.min={x:1/0,y:1/0,z:1/0};this.max={x:-1/0,y:-1/0,z:-1/0};
    o.updateMatrixWorld(true);
    const v=new Vector3();
    o.traverse(c=>{
      if(!c.isMesh) return;
      const a=c.geometry.attributes.position;
      // stub primitives carry zeroed arrays, so fall back to the recorded
      // nominal size the test helper stamped on the geometry
      const s=c.geometry.__size||{w:1,h:1,d:1};
      for(const sx of[-1,1])for(const sy of[-1,1])for(const sz of[-1,1]){
        v.set(sx*s.w/2,sy*s.h/2,sz*s.d/2).applyMatrix4(c.matrixWorld);
        this.min.x=Math.min(this.min.x,v.x);this.max.x=Math.max(this.max.x,v.x);
        this.min.y=Math.min(this.min.y,v.y);this.max.y=Math.max(this.max.y,v.y);
        this.min.z=Math.min(this.min.z,v.z);this.max.z=Math.max(this.max.z,v.z);
      }
    });
    return this;}
}
let uuid=0;
class BufferAttribute{
  constructor(array,itemSize){this.array=array;this.itemSize=itemSize;
    this.count=array.length/itemSize;this.needsUpdate=false;}
  clone(){return new BufferAttribute(this.array.slice(),this.itemSize);}
  applyMatrix4(m){
    const v=new Vector3();
    for(let i=0;i<this.count;i++){
      v.set(this.array[i*3],this.array[i*3+1],this.array[i*3+2]).applyMatrix4(m);
      this.array[i*3]=v.x;this.array[i*3+1]=v.y;this.array[i*3+2]=v.z;}
    return this;}
}
class BufferGeometry{
  constructor(){this.attributes={};this.index=null;this.uuid='g'+(uuid++);this.groups=[];}
  setAttribute(n,a){this.attributes[n]=a;return this;}
  setIndex(a){this.index=a;return this;}
  applyMatrix4(m){ if(this.attributes.position) this.attributes.position.applyMatrix4(m); return this;}
  rotateY(){return this;} rotateZ(){return this;} translate(){return this;}
  computeBoundingSphere(){this.boundingSphere={radius:1};return this;}
  dispose(){this.disposed=true;}
  clone(){const g=new BufferGeometry();
    for(const k in this.attributes) g.attributes[k]=this.attributes[k].clone();
    g.index=this.index?this.index.clone():null; return g;}
  toNonIndexed(){
    if(!this.index) return this.clone();
    const g=new BufferGeometry();
    const idx=this.index.array;
    for(const k in this.attributes){
      const a=this.attributes[k],n=a.itemSize;
      const out=new Float32Array(idx.length*n);
      for(let i=0;i<idx.length;i++)for(let j=0;j<n;j++) out[i*n+j]=a.array[idx[i]*n+j];
      g.attributes[k]=new BufferAttribute(out,n);}
    return g;}
}
function primitive(vertCount){
  const g=new BufferGeometry();
  g.setAttribute('position',new BufferAttribute(new Float32Array(vertCount*3),3));
  g.setAttribute('normal',new BufferAttribute(new Float32Array(vertCount*3),3));
  g.setAttribute('uv',new BufferAttribute(new Float32Array(vertCount*2),2));
  g.setIndex(new BufferAttribute(new Uint16Array(Math.max(3,(vertCount-2)*3)).fill(0),1));
  return g;
}
class BoxGeometry extends BufferGeometry{ constructor(w=1,h=1,d=1){super();Object.assign(this,primitive(24));this.__size={w,h,d};} }
class PlaneGeometry extends BufferGeometry{ constructor(w=1,h=1){super();Object.assign(this,primitive(4));this.__size={w,h,d:0.01};} }
class SphereGeometry extends BufferGeometry{ constructor(r=1,a=8,b=6){super();Object.assign(this,primitive((a+1)*(b+1)));this.__size={w:r*2,h:r*2,d:r*2};} }
class CylinderGeometry extends BufferGeometry{ constructor(a=1,b=1,c=1,seg=8){super();Object.assign(this,primitive((seg+1)*4));this.__size={w:Math.max(a,b)*2,h:c,d:Math.max(a,b)*2};} }
class ConeGeometry extends CylinderGeometry{}
class TorusGeometry extends BufferGeometry{ constructor(r,t,rs=4,ts=8){super();Object.assign(this,primitive((rs+1)*(ts+1)));} }
class RingGeometry extends BufferGeometry{ constructor(){super();Object.assign(this,primitive(64));} }
class TubeGeometry extends BufferGeometry{ constructor(){super();Object.assign(this,primitive(64));} }
class ExtrudeGeometry extends BufferGeometry{
  constructor(shape,opts){super();
    if(!shape||!shape._pts||shape._pts.length<3) throw new Error('bad shape');
    if(!opts||typeof opts.depth!=='number'||!isFinite(opts.depth)) throw new Error('bad extrude depth '+(opts&&opts.depth));
    const n=shape._pts.length*8;
    const g=primitive(n); Object.assign(this,g); this.index=null;
    // three.js ExtrudeGeometry is non-indexed
    const nonIdx=g.toNonIndexed?g:null;
    this.attributes.position=new BufferAttribute(new Float32Array(n*3),3);
    this.attributes.normal=new BufferAttribute(new Float32Array(n*3),3);
    this.attributes.uv=new BufferAttribute(new Float32Array(n*2),2);
  }
}
class Shape{
  constructor(){this._pts=[];}
  moveTo(x,y){if(!isFinite(x)||!isFinite(y))throw new Error('NaN moveTo');this._pts.push([x,y]);}
  lineTo(x,y){if(!isFinite(x)||!isFinite(y))throw new Error('NaN lineTo');this._pts.push([x,y]);}
  closePath(){}
}
class Material{
  constructor(o={}){Object.assign(this,o);this.uuid='m'+(uuid++);
    this.color=new Color(o.color); if(o.emissive!==undefined)this.emissive=new Color(o.emissive);}
}
class MeshStandardMaterial extends Material{}
class MeshBasicMaterial extends Material{}
class Object3D{
  constructor(){
    this.children=[];this.parent=null;
    this.position=new Vector3();this.scale=new Vector3(1,1,1);
    this.rotation=new Euler();this.quaternion=new Quaternion();
    this.rotation._cb=()=>this.quaternion.setFromEuler(this.rotation);
    this.quaternion.setFromEuler(this.rotation);
    this.matrix=new Matrix4();this.matrixWorld=new Matrix4();
    this.matrixAutoUpdate=true;this.visible=true;this.renderOrder=0;
    this.userData={};this.uuid='o'+(uuid++);
  }
  add(o){if(!o)throw new Error('add(undefined)');o.parent=this;this.children.push(o);return this;}
  updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale);}
  updateMatrixWorld(force){
    if(this.matrixAutoUpdate)this.updateMatrix();
    if(this.parent===null)this.matrixWorld.copy(this.matrix);
    else this.matrixWorld.copy(new Matrix4().multiplyMatrices(this.parent.matrixWorld,this.matrix));
    for(const c of this.children)c.updateMatrixWorld(true);
  }
  traverse(fn){fn(this);for(const c of this.children)c.traverse(fn);}
  localToWorld(v){return v;}
  clone(){
    const o=new this.constructor(this.geometry,this.material);
    o.position.copy(this.position);o.scale.copy(this.scale);
    o.rotation.copy(this.rotation);o.renderOrder=this.renderOrder;
    for(const c of this.children)o.add(c.clone());
    return o;}
}
class Group extends Object3D{constructor(){super();this.isGroup=true;}}
class Mesh extends Object3D{
  constructor(geometry,material){super();
    if(!geometry)throw new Error('Mesh with no geometry');
    if(!material)throw new Error('Mesh with no material');
    this.geometry=geometry;this.material=material;this.isMesh=true;}
}
class CanvasTexture{constructor(c){this.image=c;this.wrapS=0;this.wrapT=0;this.repeat={set(){}};
  this.needsUpdate=false;}
  clone(){const t=new CanvasTexture(this.image);t.repeat={set(){}};return t;}}
class PointLight extends Object3D{constructor(c,i,d){super();this.color=new Color(c);this.intensity=i;this.distance=d;}}

module.exports={
  Vector3,Quaternion,Euler,Matrix4,Matrix3,Color,BufferGeometry,BufferAttribute,
  BoxGeometry,PlaneGeometry,SphereGeometry,CylinderGeometry,ConeGeometry,
  TorusGeometry,RingGeometry,TubeGeometry,ExtrudeGeometry,Shape,
  MeshStandardMaterial,MeshBasicMaterial,Object3D,Group,Mesh,PointLight,
  AdditiveBlending:2,DoubleSide:2,FrontSide:0,
  CanvasTexture,ClampToEdgeWrapping:1,RepeatWrapping:1000,
  Box3,
  MathUtils:{clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),lerp:(a,b,t)=>a+(b-a)*t},
};
