export class FightAudio {
 private context?: AudioContext;
 enabled=true;
 unlock(){this.context??=new AudioContext();void this.context.resume();}
 hit(power:number,blocked=false){if(!this.enabled||!this.context)return;const ctx=this.context,t=ctx.currentTime;const o=ctx.createOscillator(),g=ctx.createGain();o.type='triangle';o.frequency.setValueAtTime(blocked?180:100,t);o.frequency.exponentialRampToValueAtTime(35,t+.12);g.gain.setValueAtTime(.1+power*.1,t);g.gain.exponentialRampToValueAtTime(.001,t+.16);o.connect(g).connect(ctx.destination);o.start(t);o.stop(t+.17);}
 bell(){if(!this.enabled||!this.context)return;const ctx=this.context;for(const f of [660,1040]){const o=ctx.createOscillator(),g=ctx.createGain();o.frequency.value=f;g.gain.setValueAtTime(.07,ctx.currentTime);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+1);o.connect(g).connect(ctx.destination);o.start();o.stop(ctx.currentTime+1);}}
 dispose(){void this.context?.close();}
}
