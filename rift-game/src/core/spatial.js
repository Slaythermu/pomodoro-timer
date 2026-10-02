// Spatial hash for fast circle queries. Entities need {pos:Vector3, radius:number, alive:boolean}.
export class SpatialHash{constructor(cell=4){this.c=cell;this.m=new Map()}
  clear(){this.m.clear()}
  key(x,z){return (Math.floor(x/this.c)*73856093)^(Math.floor(z/this.c)*19349663)}
  insert(e){const k=this.key(e.pos.x,e.pos.z);(this.m.get(k)||this.m.set(k,[]).get(k)).push(e)}
  query(x,z,r,out=[]){out.length=0;const c=this.c;for(let i=Math.floor((x-r)/c);i<=Math.floor((x+r)/c);i++)for(let j=Math.floor((z-r)/c);j<=Math.floor((z+r)/c);j++){const a=this.m.get((i*73856093)^(j*19349663));if(a)for(const e of a){const dx=e.pos.x-x,dz=e.pos.z-z,rr=r+(e.radius||0);if(dx*dx+dz*dz<=rr*rr)out.push(e)}}return out}}
