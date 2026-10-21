import { KIT_ATLAS, KIT_URL, KIT_FRAME_URLS } from './atlas.generated.js';
let pending;
export function loadUiKit(){
  if(!pending)pending=new Promise((resolve,reject)=>{const image=new Image();image.decoding='async';image.onload=()=>resolve(image);image.onerror=()=>reject(Error('UI kit atlas unavailable'));image.src=KIT_URL;});
  return pending;
}
export function kitIcon(name,width=22,height=width){
  const sprite=KIT_ATLAS.sprites[name];if(!sprite)throw new RangeError(`Unknown UI kit sprite: ${name}`);
  const canvas=document.createElement('canvas');canvas.className='kit-icon';canvas.dataset.kit=name;canvas.setAttribute('aria-hidden','true');
  const dpr=Math.min(3,globalThis.devicePixelRatio||1);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);canvas.style.width=`${width}px`;canvas.style.height=`${height}px`;
  const context=canvas.getContext?.('2d');if(!context||typeof Image==='undefined')return canvas;
  loadUiKit().then(image=>{if(!canvas.isConnected)return;const scale=Math.min(canvas.width/sprite.width,canvas.height/sprite.height),w=Math.round(sprite.width*scale),h=Math.round(sprite.height*scale);context.imageSmoothingEnabled=false;context.drawImage(image,sprite.x,sprite.y,sprite.width,sprite.height,Math.floor((canvas.width-w)/2),Math.floor((canvas.height-h)/2),w,h);canvas.dataset.ready='true';}).catch(()=>{canvas.hidden=true;});
  return canvas;
}
export function kitIconize(node,name,size=20){node.prepend(kitIcon(name,size));return node;}

export function installKit(root){for(const[name,url]of Object.entries(KIT_FRAME_URLS))root.style.setProperty(`--kit-${name}`,`url("${url}")`);root.dataset.uiKit='painted';}
