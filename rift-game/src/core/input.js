import * as THREE from 'three';
export class Input{
  constructor(canvas,camera){this.keys=new Set();this.mouse=new THREE.Vector2();this.down=false;this.camera=camera;this.canvas=canvas;
    addEventListener('keydown',e=>{this.keys.add(e.code);this.pressed.add(e.code)});addEventListener('keyup',e=>this.keys.delete(e.code));
    canvas.addEventListener('mousemove',e=>{const r=canvas.getBoundingClientRect();this.mouse.set((e.clientX-r.left)/r.width*2-1,-((e.clientY-r.top)/r.height)*2+1)});
    canvas.addEventListener('mousedown',e=>{if(e.button===0)this.down=true;if(e.button===2)this.rdown=true});addEventListener('mouseup',()=>{this.down=false;this.rdown=false});
    canvas.addEventListener('contextmenu',e=>e.preventDefault());this.pressed=new Set();this.rdown=false;this.ray=new THREE.Raycaster();this.plane=new THREE.Plane(new THREE.Vector3(0,1,0),0);this.aim=new THREE.Vector3()}
  key(c){return this.keys.has(c)}
  update(){this.ray.setFromCamera(this.mouse,this.camera);this.ray.ray.intersectPlane(this.plane,this.aim)}
  endFrame(){this.pressed.clear()}
  get move(){const x=(this.key('KeyD')?1:0)-(this.key('KeyA')?1:0),z=(this.key('KeyS')?1:0)-(this.key('KeyW')?1:0);return new THREE.Vector2(x,z)}
}
