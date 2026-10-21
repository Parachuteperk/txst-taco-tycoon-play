import { motionPose, walkCell, customerCell } from './motion.js';
import { HOMES, STATION_IDS } from '../game/quadFlow.js';
import { PLATE, STAGE_Y, ORDER, PICKUP, ambientPoint, personHeight } from '../game/quadGround.js';
export const CREW = ['jared','phillip','ali','matt','aaron','antonio','west'];
export function createQuadScene(canvas, art, inspect) {
  const ctx=canvas.getContext('2d'), camera={zoom:1,x:innerWidth<600?-25:0,y:innerWidth<600?140:110}, pointers=new Map();
  const poses=new Map();
  let sales=[],hypeUntil=0,sceneTime=-1,workSamples=[],walkSamples=[];
  let width=0,height=0,dpr=1,scale=1,drag=null,hits=[];
  function fit(){width=innerWidth;height=innerHeight;dpr=Math.min(devicePixelRatio||1,2);canvas.width=width*dpr;canvas.height=height*dpr;canvas.style.width=`${width}px`;canvas.style.height=`${height}px`;clamp();}
  function base(){return width<600?width/650:Math.min(width/650,(height-190)/650,1.18);}
  function clamp(){
    const cover=Math.max(width/PLATE.w,height/PLATE.h);
    camera.zoom=Math.max(.8,width<600?0:cover/base(),Math.min(2.5,camera.zoom));scale=base()*camera.zoom;
    const halfW=width/(2*scale),halfH=height/(2*scale),offset=30/scale;
    camera.x=Math.max(PLATE.x+halfW,Math.min(PLATE.x+PLATE.w-halfW,camera.x));
    if(width>=600)camera.y=Math.max(PLATE.y+halfH+offset,Math.min(PLATE.y+PLATE.h-halfH+offset,camera.y));
    else camera.y=Math.max(100+(PLATE.y-100)*1.8+halfH+offset,Math.min(100+(PLATE.y+PLATE.h-100)*1.8-halfH+offset,camera.y));
  }
  function project(x,y){return [width/2+(x-camera.x)*scale,height/2+30+(y-camera.y)*scale];}
  function unproject(x,y){return [(x-width/2)/scale+camera.x,(y-height/2-30)/scale+camera.y];}
  function zoom(factor,x,y){const p=unproject(x,y);camera.zoom*=factor;clamp();const q=unproject(x,y);camera.x+=p[0]-q[0];camera.y+=p[1]-q[1];clamp();}
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoom(Math.exp(-e.deltaY*.0015),e.clientX,e.clientY);},{passive:false});
  canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,[e.clientX,e.clientY]);drag={x:e.clientX,y:e.clientY,cx:camera.x,cy:camera.y,moved:false};if(pointers.size===2){const [a,b]=[...pointers.values()];drag.pinch=Math.hypot(a[0]-b[0],a[1]-b[1]);drag.moved=true;}});
  canvas.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,[e.clientX,e.clientY]);if(!drag)return;if(pointers.size===2){const [a,b]=[...pointers.values()],d=Math.hypot(a[0]-b[0],a[1]-b[1]);if(drag.pinch)zoom(d/drag.pinch,(a[0]+b[0])/2,(a[1]+b[1])/2);drag.pinch=d;drag.moved=true;}else{if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>5)drag.moved=true;camera.x=drag.cx-(e.clientX-drag.x)/scale;camera.y=drag.cy-(e.clientY-drag.y)/scale;clamp();}});
  function up(e){if(drag&&!drag.moved){const hit=hits.find(h=>e.clientX>=h.x-12&&e.clientX<=h.x+12&&e.clientY>=h.y-h.height&&e.clientY<=h.y+6);if(hit)inspect(hit.id);}pointers.delete(e.pointerId);drag=null;}
  canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',e=>{pointers.delete(e.pointerId);drag=null;});
  addEventListener('resize',fit);fit();
  function polygon(points,fill,stroke){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}}
  function label(text,x,y,color='#5e4d37',size=11){ctx.font=`600 ${Math.max(size,9/scale)}px system-ui`;ctx.textAlign='center';ctx.fillStyle=color;ctx.fillText(text,x,y);}
  function sprite(img,x,y,h){if(!img)return;const w=img.width/img.height*h;ctx.drawImage(img,x-w/2,y-h,w,h);}
  // The supplied directional sheet repeats its leg silhouettes. Articulate its
  // painted legs around the hips instead of merely cycling near-identical cells.
  function walkingSprite(img,pose,h){
    if(!pose.moving){sprite(img,0,0,h);return;}
    const w=img.width/img.height*h,hip=img.height*.68,legH=img.height-hip;
    const phase=pose.frame*Math.PI/2, stride=Math.sin(phase), lift=Math.cos(phase);
    ctx.drawImage(img,0,0,img.width,hip,-w/2,-h-Math.abs(stride)*.8,w,h*.68+.5);
    for(let leg=0;leg<2;leg++){
      const sign=leg?1:-1,sw=img.width/2;
      ctx.save();ctx.translate(sign*w*.19,-h*.32-Math.max(0,sign*lift)*1.4);
      ctx.rotate(sign*stride*.38);
      ctx.drawImage(img,leg*sw,hip,sw,legH,-w*.25,0,w/2,h*.32);
      ctx.restore();
    }
  }
  function person(p,s){
    ctx.fillStyle='#26362226';ctx.beginPath();ctx.ellipse(p.x,p.y,10,3,0,0,Math.PI*2);ctx.fill();
    const key=p.id||p.key, prior=poses.get(key), old=prior?.t<=s.t?prior:null;
    const receiving=p.c?.map.receiveUntil>s.t;
    const facing=receiving||p.c?.state==='waiting'?Math.atan2(PICKUP[1]-p.y,PICKUP[0]-p.x):p.c?.state==='ordering'?Math.atan2(ORDER[1]-37-p.y,ORDER[0]-p.x):null;
    const pose=motionPose(old,p.x,p.y,s.t,facing);poses.set(key,pose);p.pose=pose;
    const index=p.id?(p.index===3?4:p.index===4?3:p.index):p.index;
    const station=p.id?Object.keys(STATION_IDS).find(k=>STATION_IDS[k]===p.id):null;
    const job=s.stations[station]?.active;
    const busy=!!job && !['carry','collect'].includes(p.b?.task);
    // Short assembly jobs still complete A/B/C once; longer work runs ~3.5 beats/s.
    const beat=job?Math.floor(job.progress/job.workNeed*3*Math.max(1,Math.round(job.workNeed*3.5/3)))%3:null;
    let img,flip=false,h=personHeight(p.y),paintedWalk=false;
    if(p.c||p.key){const cell=customerCell(index,pose);img=(cell.back?art.custAway:art.custToward)[cell.index];flip=cell.flip;paintedWalk=true;}
    else if(p.id==='antonio'){img=art.work[5*4+Math.floor(s.t*5)%4];}
    else if(p.b?.task==='carry'||p.b?.task==='collect'||p.b?.task==='restock'){
      img=art.carry[index];flip=pose.flip;
    }else if(busy){img=art.workContact[index];}
    else if(pose.moving){const cell=walkCell(index,pose);img=art.walk[cell.index];flip=cell.flip;}
    else{img=art.idle[index];}
    if(pose.moving&&(p.c||p.key))walkSamples.push({id:key,painted:paintedWalk&&!!img,frame:pose.frame,angle:pose.angle});
    ctx.save();ctx.translate(p.x,p.y);if(flip)ctx.scale(-1,1);
    // Painted customer cells remain intact. Only legacy crew travel needs articulation.
    if(pose.moving&&!paintedWalk&&!busy)walkingSprite(img,pose,h);
    else if(busy&&p.id!=='antonio'){
      // Three tool-contact beats use the current job's progress, including pauses.
      ctx.translate(beat===1?4:0,beat===2?-2:0);
      ctx.rotate(beat===1?.065:beat===2?-.035:0);sprite(img,0,0,h);
    }else {if(receiving)ctx.translate(0,-Math.sin(Math.max(0,(s.t-p.c.map.receiveAt-.55)/.4)*Math.PI)*2);sprite(img,0,0,h);}
    ctx.restore();
    if(p.c?.state==='ordering'&&!pose.moving){ctx.fillStyle='#78974f';ctx.fillRect(p.x+9,p.y-22+Math.sin(s.t*8)*2,9,5);}
    if(p.c?.map.holdingTaco&&s.t-(p.c.map.receiveAt??-10)>=.55){sprite(art.goods[5],p.x+11,p.y-16,16);}
    if(p.id==='matt'&&job){sprite(art.goods[5],p.x+11,p.y-19,18);}
    if(job&&['prep','grill','assemble'].includes(station)){
      const good={prep:1,grill:2,assemble:5}[station],x=p.x+14,y=p.y-4;
      sprite(art.goods[good],x+(beat===1?3:0),y-(beat===2?7:0),station==='grill'?17:20);
      workSamples.push({station,crew:p.id,job:job.id,beat,workPose:busy&&img===art.workContact[index],itemDrawn:!!art.goods[good],x,y});
    }else if(job){
      const good=station==='register'?7:5;
      if(station==='register')sprite(art.goods[good],p.x+10,p.y-20,12);
      workSamples.push({station,crew:p.id,job:job.id,beat,workPose:busy&&img===art.workContact[index],carrying:station==='serve'&&['collect','carry'].includes(p.b.task),itemDrawn:!!art.goods[good],x:p.x+10,y:p.y-20});
    }

  }
  function bubble(text,x,y){ctx.font='bold 11px system-ui';const w=ctx.measureText(text).width+16;ctx.fillStyle='#fff5da';ctx.beginPath();ctx.roundRect(x-w/2,y-14,w,21,6);ctx.fill();label(text,x,y,'#6b2834',11);}
  function draw(s,payments,overlay=false){
    if(s.t<sceneTime){sales=[];hypeUntil=0;poses.clear();}sceneTime=s.t;
    sales=sales.filter(p=>s.t-p.t<10);
    for(const p of payments)if(!sales.some(old=>old.customerId===p.customerId&&old.day===p.day&&old.t===p.t)){
      sales.push(p);if(sales.length>=2)hypeUntil=s.t+3;
    }
    workSamples=[];walkSamples=[];
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#71815e';ctx.fillRect(0,0,width,height);
    ctx.translate(width/2-camera.x*scale,height/2+30-camera.y*scale);ctx.scale(scale,scale);
    // The existing painted quad supplies masonry, trees, flowers, lamps and Old Main.
    ctx.save();const ground=art.groundMuted||art.ground;
    if(width<600){
      // Scale the complete painted plate vertically around the plaza's rear edge.
      // This fills the tall phone without seams while retaining the stage's width.
      ctx.drawImage(ground,PLATE.x,100+(PLATE.y-100)*1.8,PLATE.w,PLATE.h*1.8);
    }else ctx.drawImage(ground,PLATE.x,PLATE.y,PLATE.w,PLATE.h);
    ctx.restore();
    ctx.save();ctx.translate(0,STAGE_Y);
    // Queue and pickup have persistent ground markings, not animated overlays.
    // Reuse the painted rope posts along the line; no decorative motion.
    for(let row=0;row<Math.min(4,Math.ceil(Math.max(1,s.line.length)/6));row++)
      for(let i=0;i<3;i++)sprite(art.rope[0],-167-i*76,120+row*48,30);
    // Physical pickup table, separate from the waiting pavement.
    polygon([[88,51],[192,51],[210,65],[106,65]],'#f3deb1','#765039');
    polygon([[106,65],[210,65],[210,81],[106,81]],'#774936','#543526');
    ctx.fillStyle='#50402d';ctx.fillRect(111,81,4,13);ctx.fillRect(201,81,4,13);
    ctx.fillStyle='#c6bda5';ctx.fillRect(129,53,37,9);
    const ready=!!s.stations.serve.active;
    if(ready){sprite(art.goods[5],148,61,14);bubble('READY',148,31);}

    sprite(art.stand[0],0,40,148);
    sprite(art.grill[0],-185,-21,34);
    sprite(art.rig[0],160,-35,58);
    if(width>=600){label('PREP',-175,-45);label('GRILL',-185,-100);label('ASSEMBLE',40,28);}

    label('QUEUE',width<600?-240:-350,188,'#756047',11);
    ctx.restore();
    const people=[];
    for(let i=0;i<12;i++){const [x,y]=ambientPoint(i,s.t);people.push({x,y,index:i%4,key:`student${i}`});}
    for(const c of s.customers||[]){const p=c.map;if(!p||p.exited)continue;people.push({x:p.x,y:p.y,index:c.id%4,key:`customer${c.id}`,c});}
    for(const [i,id] of CREW.entries()){const b=s.quadCrew?.[id]||{x:HOMES[id][0],y:HOMES[id][1],task:'ready'};people.push({x:b.x,y:b.y,index:i,id,b});}
    const visible=new Set(people.map(p=>p.id||p.key));for(const key of poses.keys())if(!visible.has(key))poses.delete(key);
    people.sort((a,b)=>a.y-b.y);hits=[];
    for(const p of people){person(p,s);if(p.id){const [x,y]=project(p.x,p.y);hits.push({id:p.id,x,y,height:personHeight(p.y)*scale});if(p.b.task==='work'){const station=Object.entries(s.stations).find(([,slot])=>slot.active?.heldBy===p.id);const job=station?.[1].active;if(job){ctx.fillStyle='#e9dfc3';ctx.fillRect(p.x-12,p.y+5,24,3);ctx.fillStyle='#72532b';ctx.fillRect(p.x-12,p.y+5,24*Math.min(1,job.progress/job.workNeed),3);if(overlay)label(`#${job.customerId||job.id}`,p.x,p.y-39);}}}
      if(p.c?.state==='waiting'){ctx.fillStyle='#e9dfc3';ctx.fillRect(p.x-10,p.y+5,20,3);ctx.fillStyle=p.c.patience/p.c.patienceMax<.25?'#af4937':'#54784c';ctx.fillRect(p.x-10,p.y+5,20*Math.max(0,p.c.patience/p.c.patienceMax),3);}
      if(p.c?.map.bubbleUntil>s.t){ctx.fillStyle=p.c.map.holdingTaco?'#fff9ed':'#aa4938';ctx.beginPath();ctx.roundRect(p.x-12,p.y-53,24,15,5);ctx.fill();label(p.c.map.holdingTaco?'♥':'!',p.x,p.y-42,p.c.map.holdingTaco?'#456e46':'white',11);}
    }
    for(const c of s.customers||[]){
      const p=c.map,age=p?.receiveAt!=null?s.t-p.receiveAt:2;
      if(p?.holdingTaco&&age>=0&&age<.55){
        const u=age/.55; sprite(art.goods[5],148+(p.x+11-148)*u,STAGE_Y+54+(p.y-16-STAGE_Y-54)*u-Math.sin(u*Math.PI)*30,17);
      }
    }
    ctx.save();ctx.translate(0,STAGE_Y);
    // Steam rises only from an active grill; work progress remains engine-owned.
    if(s.stations.grill.active)for(let i=0;i<3;i++){const u=(s.t*1.5+i/3)%1;ctx.globalAlpha=(1-u)*.5;ctx.strokeStyle='#fff8dc';ctx.lineWidth=2;ctx.beginPath();ctx.arc(-185+i*7+Math.sin(s.t*3+i)*3,-57-u*22,3+u*3,0,Math.PI);ctx.stroke();}ctx.globalAlpha=1;
    bubble('ORDER',-45,24);bubble('PICKUP',232,76);
    const recent=payments.filter(p=>s.t-p.t<1.8);
    if(recent.length)bubble('CHA-CHING!',-96,-52);
    if(hypeUntil>s.t)bubble('LIVE • taco hype!',180,-116);
    for(const payment of payments){const age=s.t-payment.t;if(age<1.8){ctx.globalAlpha=1-age/1.8;label(`+$${payment.cash.toFixed(2)}`,-96,12-age*16,'#23613a',16);ctx.globalAlpha=1;}}
    ctx.restore();
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  return {draw,camera,project,art,get poses(){return [...poses.entries()].map(([id,p])=>({id,...p}));},get workSamples(){return workSamples;},get walkSamples(){return walkSamples;},get hits(){return hits;},get scale(){return scale;},reset(){camera.x=width<600?-25:0;camera.y=width<600?140:110;camera.zoom=1;clamp();}};
}
