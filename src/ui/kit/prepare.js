import { alphaBounds, keyMagenta, despillEdges, removeBorderFragments } from '../iconAtlas.js';
export const KIT_SOURCE_SIZE={width:1774,height:887};
// Windows isolate each authored item; the final slice is its alpha bounding box.
export const KIT_WINDOWS={
  dashboard:[32,24,984,516],card:[1020,180,330,355],ticker:[1020,32,730,148],
  buttonNormal:[1375,200,365,114],buttonHover:[1375,315,365,110],buttonDisabled:[1375,425,365,110],
  tabStaff:[32,550,278,142],tabStrategy:[310,550,280,142],tabMenu:[590,550,285,142],tabUpgrades:[875,550,285,142],tabMarketing:[1160,550,284,142],tabFinances:[1444,550,300,142],
  speedPause:[45,700,161,153],speedPlay:[210,700,168,153],speed2x:[380,700,163,153],speed4x:[544,700,163,153],speedSkip:[709,700,168,153],
  statCash:[900,700,145,153],statRate:[1045,700,151,153],statLine:[1196,700,139,153],statClock:[1335,700,130,153],statWarning:[1465,700,134,153],statStar:[1599,700,145,153],
  crest:[400,30,255,100],
};
export function prepareKit(pixels,width,height){
  const keyed=pixels.slice();keyMagenta(keyed,12,[248,2,251]);despillEdges(keyed,width,height,[248,2,251]);
  // Strong residual violet is matte, not this kit's maroon/gold paint.
  // Remove it after the narrow key; do not widen the key into warm highlights.
  for(let at=0;at<keyed.length;at+=4)if(keyed[at]>150&&keyed[at+2]>130&&keyed[at+1]<100&&Math.min(keyed[at],keyed[at+2])-keyed[at+1]>80)keyed.fill(0,at,at+4);
  const slices={};
  for(const[name,[x,y,w,h]]of Object.entries(KIT_WINDOWS)){
    const cell={x:Math.floor(x*width/1774),y:Math.floor(y*height/887),width:Math.floor(w*width/1774),height:Math.floor(h*height/887)};
    removeBorderFragments(keyed,width,cell);
    const bounds=alphaBounds(keyed,width,cell);if(!bounds)throw Error(`Empty UI kit sprite: ${name}`);
    const data=new Uint8ClampedArray(bounds.width*bounds.height*4);
    for(let row=0;row<bounds.height;row++)data.set(keyed.subarray(((bounds.y+row)*width+bounds.x)*4,((bounds.y+row)*width+bounds.x+bounds.width)*4),row*bounds.width*4);
    slices[name]={...bounds,pixels:data};
  }
  return slices;
}
export function packKit(slices,width=2048,padding=4){
  let x=padding,y=padding,rowHeight=0;const sprites={};
  for(const[name,slice]of Object.entries(slices)){
    if(slice.width+padding*2>width)throw Error('UI atlas is too narrow');
    if(x+slice.width+padding>width){x=padding;y+=rowHeight+padding;rowHeight=0;}
    sprites[name]={x,y,width:slice.width,height:slice.height};x+=slice.width+padding;rowHeight=Math.max(rowHeight,slice.height);
  }
  const height=y+rowHeight+padding,pixels=new Uint8ClampedArray(width*height*4);
  for(const[name,rect]of Object.entries(sprites))for(let row=0;row<rect.height;row++)pixels.set(slices[name].pixels.subarray(row*rect.width*4,(row+1)*rect.width*4),((rect.y+row)*width+rect.x)*4);
  return {width,height,pixels,sprites};
}
// Separate crest from the top edge so nine-slicing never squashes the paw badge.
// Continue the unornamented painted horizontal border through that section.
export function dashboardFrame(slice){
  const drop=Math.round(slice.height*.055),height=slice.height-drop,width=slice.width;
  const pixels=slice.pixels.slice(drop*width*4);
  const start=Math.round(width*.34),end=Math.round(width*.68),rows=Math.round(height*.15),sample=Math.round(width*.27);
  for(let y=0;y<rows;y++)for(let x=start;x<end;x++)pixels.set(pixels.subarray((y*width+sample)*4,(y*width+sample)*4+4),(y*width+x)*4);
  return {width,height,pixels};
}
