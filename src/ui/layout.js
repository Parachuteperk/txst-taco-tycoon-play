// UI-only rectangle packing. Scene geometry is always CSS pixels from a bridge.
export function overlaps(a, b, gap = 8) {
  return a.left < b.right + gap && a.right > b.left - gap && a.top < b.bottom + gap && a.bottom > b.top - gap;
}
const contains = (a,b) => a.left <= b.left && a.top <= b.top && a.right >= b.right && a.bottom >= b.bottom;
const positive = r => r.right > r.left && r.bottom > r.top;

function freeRooms(obstacles, viewport, gap = 8) {
  const inset = viewport.inset ?? 12;
  let rooms = [{ left: viewport.leftInset ?? inset, top: viewport.topInset ?? inset, right: viewport.width - (viewport.rightInset ?? inset), bottom: viewport.height - (viewport.bottomInset ?? inset) }];
  for (const obstacle of obstacles) {
    const block = { left: obstacle.left-gap, top: obstacle.top-gap, right: obstacle.right+gap, bottom: obstacle.bottom+gap };
    const split = [];
    for (const room of rooms) {
      if (!overlaps(room,block,0)) { split.push(room); continue; }
      split.push(
        { ...room, right: Math.min(room.right,block.left) },
        { ...room, left: Math.max(room.left,block.right) },
        { ...room, bottom: Math.min(room.bottom,block.top) },
        { ...room, top: Math.max(room.top,block.bottom) },
      );
    }
    const valid = split.filter(positive);
    rooms = valid.filter((room,index) => !valid.some((other,j) => j !== index && contains(other,room) && (!contains(room,other) || j < index)));
  }
  return rooms;
}

export function layoutUiPanels(panels, protectedRects, viewport) {
  const positions = {}, occupied = [...protectedRects];
  for (const panel of [...panels].sort((a,b) => (a.priority || 0) - (b.priority || 0))) {
    positions[panel.id] = null;
    if (!panel.width || !panel.height) continue;
    const prefer = panel.prefer || 'bottom-center';
    const desiredX = panel.anchor ? panel.anchor.x-panel.width/2 : prefer.includes('left') ? 12 : prefer.includes('right') ? viewport.width-panel.width-12 : (viewport.width-panel.width)/2;
    const desiredY = panel.anchor ? panel.anchor.y-panel.height-8 : prefer.includes('top') ? 12 : viewport.height-panel.height-12;
    let best = null, bestScore = Infinity;
    for (const room of freeRooms(occupied,viewport)) {
      const availableW = room.right-room.left, availableH = room.bottom-room.top;
      const width = panel.resizeWidth ? Math.min(panel.width,availableW) : panel.width;
      const height = panel.scroll ? Math.min(panel.height,availableH) : panel.height;
      if (width > availableW || height > availableH || width < (panel.minWidth || width) || height < (panel.minHeight || height)) continue;
      const left = Math.max(room.left,Math.min(desiredX,room.right-width));
      const top = Math.max(room.top,Math.min(desiredY,room.bottom-height));
      // Preserve readable sizes before chasing the requested corner.
      const score = Math.abs(left-desiredX)+Math.abs(top-desiredY)+4*(panel.width-width)+4*(panel.height-height);
      if (score < bestScore) { bestScore=score; best={left,top,right:left+width,bottom:top+height,width,height}; }
    }
    if (best) { positions[panel.id]=best; occupied.push(best); }
  }
  return positions;
}

// Back-compatible pure dock helper; all live UI uses the shared planner below.
export function safeDockPosition(size, protectedRects, viewport) {
  const result=layoutUiPanels([{id:'dock',...size,prefer:'bottom-center'}],protectedRects,{...viewport,topInset:viewport.topInset??240}).dock;
  return result ? {left:result.left,top:result.top} : null;
}

export function createSafeUiLayout(root) {
  const entries = new Map();
  let insets = {top:0,right:0,bottom:0,left:0};
  const measureInsets = () => {
    const style=getComputedStyle(root);
    insets=Object.fromEntries(['top','right','bottom','left'].map(edge=>[edge,parseFloat(style.getPropertyValue(`--ui-safe-${edge}`))||0]));
  };
  const measure = node => {
    const entry=[...entries.values()].find(value=>value.node===node); if(!entry)return;
    // scrollHeight retains natural content height when a card is constrained.
    entry.size={width:node.offsetWidth,height:Math.max(node.offsetHeight,node.scrollHeight+2)};
  };
  const observer=new ResizeObserver(changes=>{ for(const change of changes)measure(change.target); });
  const viewportObserver=new ResizeObserver(measureInsets); viewportObserver.observe(root);
  addEventListener('resize',measureInsets);
  return {
    register(id,node,options={}) {
      const old=entries.get(id); if(old)observer.unobserve(old.node);
      entries.set(id,{node,options,size:{width:0,height:0}});
      node.classList.add('ui-positioned'); node.dataset.uiPanel=id;
      node.style.visibility='hidden'; observer.observe(node);
    },
    remove(id) { const entry=entries.get(id); if(entry)observer.unobserve(entry.node);entries.delete(id); },
    update(geometry) {
      const panels=[];
      for(const [id,entry] of entries) {
        const {node,options,size}=entry;
        if(!node.isConnected || node.hidden || node.closest('[hidden]') || options.active?.()===false) { node.style.visibility='hidden'; continue; }
        const width=typeof options.preferredWidth==='function'?options.preferredWidth():options.preferredWidth||size.width;
        const anchor=typeof options.anchor==='function'?options.anchor(geometry):null;
        panels.push({...options,id,width:Math.min(width,innerWidth-24),height:size.height,anchor});
      }
      const viewport={width:innerWidth,height:innerHeight,topInset:Math.max(12,insets.top+8),bottomInset:Math.max(12,insets.bottom+8),leftInset:Math.max(12,insets.left+8),rightInset:Math.max(12,insets.right+8)};
      const positions=layoutUiPanels(panels,geometry.protectedRects,viewport);
      for(const [id,entry] of entries) {
        const rect=positions[id],node=entry.node;
        node.style.visibility=rect?'visible':'hidden';
        if(rect) {
          node.style.left=`${rect.left}px`;node.style.top=`${rect.top}px`;
          node.style.width=`${rect.width}px`;node.style.maxHeight=`${rect.height}px`;
          node.style.overflow=entry.options.scroll?'auto':'hidden';
        }
      }
      return positions;
    },
  };
}
