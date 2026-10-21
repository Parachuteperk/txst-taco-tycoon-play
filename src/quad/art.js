// Key and trim painted source cells once at boot. All people use the same visible height.
async function sheet(file, cols, rows, root = 'assets/art/iso', region = null) {
  const img = new Image(); img.src = `${root}/${file}.png`; await img.decode();
  const [sx,sy,sw,sh]=region||[0,0,img.width,img.height];
  const result = [], w = sw / cols, h = sh / rows;
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, sx+col*w, sy+row*h, w, h, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h); let x0=w, y0=h, x1=0, y1=0;
    for (let y=0;y<h;y++) for (let x=0;x<w;x++) {
      const i=(y*w+x)*4, p=data.data;
      if (Math.min(p[i],p[i+2])-p[i+1]>45 && Math.abs(p[i]-p[i+2])<85) p[i+3]=0;
      if (p[i+3]>40) { x0=Math.min(x0,x); y0=Math.min(y0,y); x1=Math.max(x1,x); y1=Math.max(y1,y); }
    }
    ctx.putImageData(data,0,0);
    const cut=document.createElement('canvas'); cut.width=Math.max(1,x1-x0+1); cut.height=Math.max(1,y1-y0+1);
    cut.getContext('2d').drawImage(canvas,x0,y0,cut.width,cut.height,0,0,cut.width,cut.height); result.push(cut);
  }
  return result;
}
// iso-goods columns: box, tortillas, meat, cooler, condiments, taco, coins, card.
export async function loadQuadArt() {
  const specs={idle:['iso-crew-idle',7,1],custToward:['iso-cust-walk-toward',4,4],custAway:['iso-cust-walk-away',4,4],carry:['iso-crew-carry',7,3],workContact:['iso-crew-work',7,1],rope:['plaza-props-chatgpt',1,1,'assets/art/iso',[0,0,500,724]],stand:['iso-stand-counter',1,1],grill:['iso-prop-grill',1,1],goods:['iso-goods',8,1],walk:['iso-crew-walk',28,4],work:['crew-anim-chatgpt',4,7,'assets/art'],rig:['iso-rig',1,1],picnic:['iso-prop-picnic',1,1],lamp:['iso-lamp',2,1]};
  const art = Object.fromEntries(await Promise.all(Object.entries(specs).map(async ([key,args])=>[key,await sheet(...args)])));
  art.ground = new Image(); art.ground.src='assets/art/iso/iso-ground.png'; await art.ground.decode();
  // Cache the subdued backdrop once; filtering a full plate every frame costs FPS.
  art.groundMuted=document.createElement('canvas');art.groundMuted.width=art.ground.width;art.groundMuted.height=art.ground.height;
  const groundCtx=art.groundMuted.getContext('2d');groundCtx.filter='saturate(.82) brightness(.90)';groundCtx.drawImage(art.ground,0,0);
  return art;
}
