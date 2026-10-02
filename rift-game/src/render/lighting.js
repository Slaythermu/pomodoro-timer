import * as THREE from 'three';
export function init(ctx){const s=new THREE.DirectionalLight(0xffffff,3);s.position.set(20,40,10);s.castShadow=true;ctx.scene.add(s,new THREE.AmbientLight(0x667788,0.6));return {sun:s}}
