// Distance drives gait: pausing freezes feet, changing speed changes cadence.
export function motionPose(previous, x, y, t, facing = null) {
  const dx=previous ? x-previous.x : 0, dy=previous ? y-previous.y : 0;
  const distance=Math.hypot(dx,dy), dt=previous ? t-previous.t : 0;
  const moving=dt>0 && distance>.001;
  const angle=moving ? Math.atan2(dy,dx) : facing ?? previous?.angle ?? Math.PI/2;
  const stride=(previous?.stride||0)+(moving?distance:0);
  return {x,y,t,angle,stride,moving,speed:moving?distance/dt:0,frame:moving?Math.floor((stride+1e-7)/12)%4:0,
    back:Math.sin(angle)<-.05,flip:Math.cos(angle)<0};
}
export function walkCell(person, pose) {
  // Source faces right in front rows and left in back rows.
  const vertical=Math.abs(Math.sin(pose.angle))>Math.abs(Math.cos(pose.angle));
  const row=(pose.back?2:0)+(vertical?1:0);
  return {index:row*28+person*4+pose.frame,flip:pose.back?!pose.flip:pose.flip};
}

export function customerCell(look,pose){
  return {index:(look%4)*4+pose.frame,back:pose.back,flip:pose.back?Math.cos(pose.angle)<0:Math.cos(pose.angle)>0};
}
