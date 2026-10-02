import * as THREE from 'three';
export function init(ctx){const g=new THREE.Mesh(new THREE.BoxGeometry(1.6,2,1.6),new THREE.MeshStandardMaterial({color:0xccaa33}));g.castShadow=true;g.position.y=1;ctx.scene.add(g);return {obj:g,pos:g.position}}
export function update(dt,ctx){const m=ctx.input.move;ctx.player.pos.x+=m.x*dt*9;ctx.player.pos.z+=m.y*dt*9;ctx.camera.position.set(ctx.player.pos.x,0,ctx.player.pos.z).add(ctx.CAM_OFF);ctx.camera.lookAt(ctx.player.pos.x,0,ctx.player.pos.z)}
