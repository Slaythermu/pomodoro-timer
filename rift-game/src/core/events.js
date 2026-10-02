// Tiny pub/sub. Events: 'shoot'{pos,dir,weapon} 'hit'{pos,dmg,target} 'kill'{pos,enemy} 'build'{pos,type} 'wave'{n} 'damage-player'{amount} 'resource'{type,amount}
export class Events{constructor(){this.m=new Map()}on(e,f){(this.m.get(e)||this.m.set(e,[]).get(e)).push(f)}emit(e,d){(this.m.get(e)||[]).forEach(f=>f(d))}}
