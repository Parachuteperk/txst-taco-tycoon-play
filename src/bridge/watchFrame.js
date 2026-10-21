// Shared scene/chrome contract: essential Watch controls occupy reserved rails.
// CSS pixels throughout; draw clipping converts to backing pixels at the host.
// Compact glance bar on top, thumb build bar on the bottom. Phone Manager
// scroll body is half the viewport; PHONE_MANAGER_CHROME is the sheet
// header, tabs, padding, and border that sit outside that scroll body.
export const WATCH_DOCK=Object.freeze({desktopTop:96,phoneTop:72,bottom:188});
export const PHONE_MANAGER_BODY=0.5;
export const PHONE_MANAGER_CHROME=92;
export function phoneManagerPanel(height){return Math.round(height*PHONE_MANAGER_BODY)+PHONE_MANAGER_CHROME;}
let safeInsets={top:0,bottom:0};
export function setWatchSafeInsets(next){safeInsets={top:Math.max(0,next.top||0),bottom:Math.max(0,next.bottom||0)};}
export function watchFrame(width,height,watch=true,manager=false) {
  const phone=width<=600;
  const top=watch?(phone?WATCH_DOCK.phoneTop:WATCH_DOCK.desktopTop)+safeInsets.top:0;
  const panel=manager?(phone?phoneManagerPanel(height):Math.min(430,width*.4)):0;
  const right=width-(!phone?panel:0);
  const bottom=(watch?WATCH_DOCK.bottom+safeInsets.bottom:0)+(phone?panel:0);
  return {left:0,top,right,bottom:Math.max(top+1,height-bottom),width:right,height:Math.max(1,height-top-bottom)};
}
export function clipProtectedRects(rects,frame){
  return rects.map(rect=>({...rect,left:Math.max(frame.left,rect.left),top:Math.max(frame.top,rect.top),right:Math.min(frame.right,rect.right),bottom:Math.min(frame.bottom,rect.bottom)})).filter(rect=>rect.right>rect.left&&rect.bottom>rect.top);
}
// The business bounds include empty queue approach at the left. Frame the crew,
// main stand and the near edge of Old Main instead of that empty approach.
export function phoneCamera(biz,width,height,dpr,frame){
  const left=biz.x0+36,right=biz.x1+68,scale=width/(right-left);
  const x=(left+right)/2,focusY=frame.top+frame.height*.60;
  const y=(biz.y0+biz.y1)/2-(focusY-height/2)/scale;
  return {x,y,k:scale*dpr};
}
export function drawInWatchFrame(context,width,height,dpr,frame,draw){
  context.save();context.fillStyle='#152029';context.fillRect(0,0,width*dpr,height*dpr);
  context.beginPath();context.rect(frame.left*dpr,frame.top*dpr,(frame.right-frame.left)*dpr,(frame.bottom-frame.top)*dpr);context.clip();
  draw();context.restore();
}
