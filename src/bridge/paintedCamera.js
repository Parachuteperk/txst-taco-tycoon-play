// Camera/station geometry only. Shared by painted rendering, projection and QA.
import {fitSceneComposition} from './composition.js';
const clamp=(value,lo,hi)=>Math.max(lo,Math.min(hi,value));
export function counterTop(map,x){
  const line=map.counter?.top||[];
  for(let i=1;i<line.length;i++)if(x<=line[i][0]){const [ax,ay]=line[i-1],[bx,by]=line[i];return ay+(by-ay)*clamp((x-ax)/(bx-ax||1),0,1);}
  return line.at(-1)?.[1]??null;
}
export function usesPaintedStation(map,who,actor){
  const home=map.stations?.[who];
  return !!home&&(Math.hypot(actor.i-home.i,actor.j-home.j)<(who==='west'?.8:.55)||(who!=='west'&&!actor.path?.length));
}
export function stationPose(art,who,working=false){
  const map=art.map,home=map.stations[who],sprite=art.crew?.[who],reference=art.crew?.jared?.stand?.height||map.sprite?.bodyPx||351;
  const scale=(map.sprite?.standPx||200)/reference;
  if(who==='antonio'&&art.facingRig&&map.rig?.enabled!==false){const at=map.rig||home,img=art.facingRig,height=(map.sprite?.standPx||200)*1.15;return {x:at.x,y:at.y,height,width:height*img.width/img.height};}
  if(who==='antonio'&&art.rig?.frames?.type){const at=map.rig||home,frame=art.rig.frames.type,height=(map.sprite?.standPx||200)*.8/.68;const scale=height/frame.height;return {x:at.x+(frame.width/2-art.rig.anchorX)*scale,y:at.y+(frame.height-art.rig.anchorY)*scale,height,width:frame.width*scale};}
  if(who==='antonio'&&art.antonioRig){const height=home.rig?.height||(map.sprite?.standPx||200)*1.3;return {x:home.x,y:home.y,height,width:height*art.antonioRig.width/art.antonioRig.height};}
  const stand=sprite?.stand,pose=(working?sprite?.action:stand)||stand;
  let y=home.y;
  if(map.counter?.behind?.includes(who)){
    const top=counterTop(map,home.x);
    if(top!==null)y=top+(1-(map.counter.waist??.56))*(stand?.height||reference)*scale;
    // Work rows are cropped at the waist. Preserve their top/head position
    // rather than anchoring that crop at full-body feet behind the fascia.
    y+=((pose?.height||reference)-(stand?.height||reference))*scale;
  }
  y-=home.lift||0;
  return {x:home.x,y,height:(pose?.height||reference)*scale,width:(pose?.width||reference*.5)*scale};
}
export function paintedContentBounds(art,{wide=false}={}){
  const bounds=[];
  for(const who of Object.keys(art.map.stations||{}).filter(id=>id!=='dale'))for(const working of [false,true]){
    const pose=stationPose(art,who,working);
    bounds.push({id:who,left:pose.x-pose.width/2,top:pose.y-pose.height-35,right:pose.x+pose.width/2,bottom:pose.y+10});
  }
  if(art.map.oldMain){const r=art.map.oldMain;bounds.push({id:'oldMain',left:r.x,top:r.y,right:r.x+r.w,bottom:r.y+r.h});}
  else if(art.map.uiGeometry?.oldMain)bounds.push({id:'oldMain',...art.map.uiGeometry.oldMain});
  if(art.map.sign){const r=art.map.sign;bounds.push({id:'sign',left:r.x,top:r.y,right:r.x+r.w,bottom:r.y+r.h});}
  const poly=art.map.counter?.poly||[];
  if(art.map.composition?.stand)bounds.push({id:'stand',...art.map.composition.stand});
  else if(poly.length)bounds.push({id:'stand',left:Math.min(...poly.map(p=>p[0]))-25,top:Math.min(...poly.map(p=>p[1]))-25,right:Math.max(...poly.map(p=>p[0]))+25,bottom:Math.max(...poly.map(p=>p[1]))+25});
  // First four bends cover the visible lunch/Big Rush approach, without fitting
  // miles of optional offscreen queue path at the expense of crew readability.
  const queue=(wide?art.map.queue:art.map.queue?.slice(0,4))||[];
  if(queue.length)bounds.push({id:'queue',left:Math.min(...queue.map(p=>p.x))-65,top:Math.min(...queue.map(p=>p.y))-220,right:Math.max(...queue.map(p=>p.x))+65,bottom:Math.max(...queue.map(p=>p.y))+15});
  return bounds;
}
// Cover the open hole between the HUD and the roster. Contain-fitting the whole
// plate (sign through Old Main) makes a 390px phone a thin letterboxed strip.
function coverFocus(art,frame,width,height,wide){
  const pw=art.map.plate?.w||1672,ph=art.map.plate?.h||941;
  const fw=Math.max(1,frame.right-frame.left),fh=Math.max(1,frame.bottom-frame.top);
  const spec=art.map.framing||{};
  const phone=width<=600;
  const fr=wide?(phone?spec.rushPhone||spec.rush:spec.rush):(phone?spec.phone:spec.desktop);
  const focus=fr?.focus||[pw/2,ph/2];
  const scale=Math.max(fw/pw,fh/ph)*Math.max(1,fr?.zoom??1);
  const targetX=(frame.left+frame.right)/2,targetY=(frame.top+frame.bottom)/2;
  return {pw,ph,scale,focus,targetX,targetY,fx:focus[0]-(targetX-width/2)/scale,fy:focus[1]-(targetY-height/2)/scale};
}
function coverClamp(fx,fy,scale,frame,width,height,pw,ph){
  const fxLo=(width/2-frame.left)/scale,fxHi=pw-(frame.right-width/2)/scale;
  const fyLo=(height/2-frame.top)/scale,fyHi=ph-(frame.bottom-height/2)/scale;
  return {
    fx:fxLo<=fxHi?clamp(fx,fxLo,fxHi):(fxLo+fxHi)/2,
    fy:fyLo<=fyHi?clamp(fy,fyLo,fyHi):(fyLo+fyHi)/2,
  };
}
export function fitPaintedCamera(art,frame,width,height,options){
  const bounds=paintedContentBounds(art,options);
  const shot=coverFocus(art,frame,width,height,!!options?.wide);
  const clamped=coverClamp(shot.fx,shot.fy,shot.scale,frame,width,height,shot.pw,shot.ph);
  return {
    focus:{x:shot.focus[0],y:shot.focus[1]},
    target:{x:shot.targetX,y:shot.targetY},
    scale:shot.scale,bounds,fx:clamped.fx,fy:clamped.fy,plateW:shot.pw,plateH:shot.ph,
  };
}
export function clampPaintedCamera(cam,fit,frame,width,height){
  const scale=fit.scale*cam.zoom;
  const next=coverClamp(cam.fx,cam.fy,scale,frame,width,height,fit.plateW||1672,fit.plateH||941);
  cam.fx=next.fx;cam.fy=next.fy;
}
