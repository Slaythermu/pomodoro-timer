import * as THREE from 'three';
export function init(ctx){const m=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:0x335544}));m.rotation.x=-Math.PI/2;m.receiveShadow=true;ctx.scene.add(m);
 return {heightAt:(x,z)=>0,size:200,blocked:(x,z,r)=>false,props:[]}}
