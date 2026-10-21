// Plate coordinates use assets/art/bg-plate.map.json's 1672 × 941 reference.
// The active iso-ground plate is drawn into [-900,-506.25,1800,1012.5].
export const PLATE = { width: 1672, height: 941, x: -900, y: -506.25, w: 1800, h: 1012.5 };
export const plateToWorld = ([x,y]) => [PLATE.x+x/PLATE.width*PLATE.w, PLATE.y+y/PLATE.height*PLATE.h];
export const worldToPlate = ([x,y]) => [(x-PLATE.x)/PLATE.w*PLATE.width,(y-PLATE.y)/PLATE.h*PLATE.height];
// Conservative brick plaza inset: excludes the stairs, planters, lawn and foreground beds.
export const WALKABLE_PLATE = [[[330,595],[780,535],[1080,555],[1400,655],[1320,810],[1000,935],[570,855],[330,730]]];
export const WALKABLE = WALKABLE_PLATE.map(poly=>poly.map(plateToWorld));
export function isWalkable(x,y) {
  return WALKABLE.some(poly=>{
    let inside=false;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++){
      const [ax,ay]=poly[j],[bx,by]=poly[i];
      if(Math.abs((x-ax)*(by-ay)-(y-ay)*(bx-ax))<1e-6 && x>=Math.min(ax,bx)-1e-6 && x<=Math.max(ax,bx)+1e-6 && y>=Math.min(ay,by)-1e-6 && y<=Math.max(ay,by)+1e-6)return true;
      if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)inside=!inside;
    }
    return inside;
  });
}
export const STAGE_Y=140;
export const stagePoint=([x,y])=>[x,y+STAGE_Y];
export const ORDER=stagePoint([-96,65]);
export const PICKUP=stagePoint([148,58]);
export const SPAWNS=[[-380,155],[-380,175],[-380,195]];
export const EXIT=[420,230];
// Fixed body-width spacing; normal service occupies the first rope/pickup slots.
// Overflow uses distinct paved slots rather than compressing or stacking bodies.
function overflowSlots(initial){
  const slots=[...initial];
  for(let y=150;y<=470;y+=38)for(let x=-500;x<=450;x+=38){
    if(isWalkable(x,y)&&slots.every(p=>Math.hypot(p[0]-x,p[1]-y)>=38))slots.push([x,y]);
  }
  return slots;
}
const queueSlots=overflowSlots(Array.from({length:24},(_,i)=>{const row=Math.floor(i/6),col=i%6;return [-132-(row%2?5-col:col)*38,232+row*48];}));
const pickupSlots=overflowSlots(Array.from({length:9},(_,i)=>i===0?[148,247]:[228+(i-1)%2*48,274+Math.floor((i-1)/2)*48]));
export const queuePoint=i=>queueSlots[i%queueSlots.length];
export const pickupPoint=i=>pickupSlots[i%pickupSlots.length];
export const AMBIENT_ROUTES=[
  [[-420,180],[-400,160],[-365,145]],
  [[-300,370],[-100,410],[80,410]],
  [[230,110],[340,160],[390,220]],
  [[-220,390],[30,440],[240,420]],
];
export function ambientPoint(i,t){
  const route=AMBIENT_ROUTES[i%AMBIENT_ROUTES.length];
  const lengths=route.slice(1).map((p,j)=>Math.hypot(p[0]-route[j][0],p[1]-route[j][1]));
  const total=lengths.reduce((a,b)=>a+b,0),phase=(t*(i%2?23:19)+i*71)%(total*2);
  let d=phase>total?total*2-phase:phase;
  for(let j=0;j<lengths.length;j++){if(d<=lengths[j]){const u=d/lengths[j];return route[j].map((v,k)=>v+(route[j+1][k]-v)*u);}d-=lengths[j];}
  return route.at(-1);
}
// Shared visible height: far = 44 world px, nearest = 52.8 (1.20×), smooth in y.
export const personHeight=y=>44*(1+.2*Math.max(0,Math.min(1,(y-40)/310)));
