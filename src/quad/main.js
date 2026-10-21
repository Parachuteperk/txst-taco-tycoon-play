import { createGame } from '../game/createGame.js';
import { clockOf } from '../game/day.js';
import { UPGRADES } from '../data/upgrades.js';
import { loadQuadArt } from './art.js';
import { createQuadScene, CREW } from './scene.js';

const SAVE='txst-quad-gameplay-v1', money=n=>`$${Number(n||0).toFixed(2)}`;
// Tune arrivals below the kitchen's sustainable rate. No fake visual queue.
const config={quadFlow:true,phases:{preopen:{seconds:2},calm:{seconds:30}},arrivals:{calmRate:.22,telegraphRate:.23,rush:[{until:120,rate:.23}]},bigRush:{enabled:false},manager:{crowd:{light:{demand:1,early:1,cap:9},steady:{demand:1,early:1,cap:9},heavy:{demand:1.2,early:1,cap:10}}}};
let game=createGame(7,null,{autostart:false,config}),running=false,planning=true,paused=false,speed=1,tab='',selected='',overlay=false,muted=false,audio=null,payments=[],lastPhase='',lastSave=0;
const root=document.createElement('div');document.body.append(root);
root.innerHTML=`<div id="loading">Loading the quad…</div>
<div class="hud" hidden><strong class="cash"></strong><span class="clock"></span><span class="rating"></span><div class="speeds" aria-label="Game speed">${[0,1,2,3].map(n=>`<button data-speed="${n}" aria-label="${n?n+'x speed':'Pause'}">${n?n+'×':'Ⅱ'}</button>`).join('')}</div></div>
<nav class="watch-buttons" aria-label="Management" hidden>${[['menu','Menu and Prices'],['crew','Crew'],['upgrades','Upgrades and Build'],['summary','Day Summary']].map(([id,label])=>`<button data-tab="${id}">${label}</button>`).join('')}</nav>
<div class="veil title"><section class="card"><div class="eyebrow">Texas State University</div><h1>Quad Taco Tycoon</h1><p>Run a small stand on a big campus.<br>Queue. Pay. Cook. Pickup.</p><button class="primary" data-action="open">Open the stand</button><button data-action="continue" hidden>Continue</button><p><small>Drag to explore · Scroll or pinch to zoom<br>Tap a crew member to inspect their station.</small></p></section></div>
<div class="veil manager-shell" hidden><section class="card"><div class="eyebrow">Before the lunch crowd</div><h1>Open for day <span class="planning-day">1</span></h1><p>Jared takes payment at ORDER. Each taco goes through prep, grill and assembly, then Matt hands it over at PICKUP.</p><button class="primary" data-action="start">Start Day</button><button data-tab="menu">Menu and Prices</button></section></div>
<div class="panel-wrap" hidden><section class="panel" data-panel="menu" hidden></section><section class="panel" data-panel="crew" hidden><header><h2>Crew</h2><button data-action="close" aria-label="Close panel">×</button></header><div class="roster">${CREW.map(id=>`<button class="watch-crew crew-card" data-crew="${id}">${id[0].toUpperCase()+id.slice(1)}</button>`).join('')}</div><div class="crew-detail"></div></section><section class="panel" data-panel="upgrades" hidden></section><section class="panel" data-panel="summary" hidden></section></div>
<div role="status" class="notice" hidden></div>`;
const $=s=>root.querySelector(s),$$=s=>[...root.querySelectorAll(s)];
try{if(localStorage.getItem(SAVE))$('[data-action="continue"]').hidden=false;}catch{}
const roles={jared:'Order / cashier',phillip:'Prep / restock',ali:'Grill',aaron:'Assembly',matt:'Pickup / handoff',antonio:'Technology',west:'Advisor'};
function toast(text){$('.notice').textContent=text;$('.notice').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('.notice').hidden=true,3500);}
function save(){try{localStorage.setItem(SAVE,JSON.stringify(game.save()));}catch{toast('Save unavailable. Keep this tab open to retain progress.');}}
function unlock(){if(!audio){const Audio=window.AudioContext||window.webkitAudioContext;if(Audio)audio=new Audio();}audio?.resume().catch(()=>{});}
function ching(){if(muted||!audio)return;const t=audio.currentTime;[1046,1568,2093].forEach((hz,i)=>{const o=audio.createOscillator(),g=audio.createGain();o.type='sine';o.frequency.value=hz;g.gain.setValueAtTime(0,t+i*.065);g.gain.linearRampToValueAtTime(.11,t+i*.065+.004);g.gain.exponentialRampToValueAtTime(.001,t+i*.065+.22);o.connect(g);g.connect(audio.destination);o.start(t+i*.065);o.stop(t+i*.065+.23);});}
function call(method,...args){const result=game[method](...args);if(!result?.ok)toast(result?.missing?.length?`Requires: ${result.missing.join(', ')}`:({'wrong-phase':'Available before opening or after closing.','cant-afford':'There is not enough cash yet.','already-used':'Already purchased or at maximum level.'}[result?.reason]||`Unavailable: ${result?.reason||'try again'}`));else save();return result;}
function header(title){return `<header><h2>${title}</h2><button data-action="close" aria-label="Close panel">×</button></header>`;}
function openPanel(id){tab=id;$('.panel-wrap').hidden=!id;$$('[data-panel]').forEach(p=>p.hidden=p.dataset.panel!==id);$$('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===id));if(id)renderPanel();}
function renderPanel(){
  const s=game.state,m=s.manager,tree=m.tree;
  if(tab==='menu'){
    $('[data-panel="menu"]').innerHTML=header('Menu and Prices')+`<p>One taco, cooked to order. Prices apply to new orders.</p><h3>Taco price</h3><select aria-label="Taco price" data-select="price">${Object.entries(game.config.economy.prices).map(([id,b])=>`<option value="${id}" ${m.strategy.price===id?'selected':''}>${id[0].toUpperCase()+id.slice(1)} · ${money(b.price)}</option>`).join('')}</select><h3>Featured taco</h3><select aria-label="Featured taco" data-select="menu">${m.menu.enabled.map(id=>`<option value="${id}" ${m.menu.featured===id?'selected':''}>${id[0].toUpperCase()+id.slice(1)}</option>`).join('')}</select><div class="row"><span>Tortillas available <b>${s.inventory.tortillas}</b></span><button data-action="restock">Restock 25</button></div><p>Refunds apply if a paid customer loses patience.</p>`;
  }else if(tab==='crew'){
    $$('.watch-crew').forEach(b=>{const id=b.dataset.crew; b.innerHTML=`${id[0].toUpperCase()+id.slice(1)} <span>${roles[id]}</span>`;});
    const id=selected||'jared',nodes=UPGRADES.crewUpgrades[id]||[],node=nodes.find(n=>!tree?.owned.includes(n.id));
    $('.crew-detail').innerHTML=`<h3>${id[0].toUpperCase()+id.slice(1)}</h3><p>${roles[id]} · Level ${s.crew[id]?.level||1}</p>${node?`<button data-node="${node.id}" data-owner="${id}">${node.name} · ${money(node.cost)}</button>`:'<p>All skills purchased.</p>'}<small>Requirements and affordability are checked on purchase.</small>`;
  }else if(tab==='upgrades'){
    const row=(name,button)=>`<div class="row"><span>${name}</span>${button}</div>`;
    const upgrades=['grill','register','tipJar'];
    $('[data-panel="upgrades"]').innerHTML=header('Upgrades and Build')+'<p>Stand improvements are purchased between days. Crew skills can be purchased during service.</p>'+upgrades.map(id=>{const d=game.config.manager.upgrades[id];return row(`${{grill:'Faster grill',register:'Faster ordering',tipJar:'Tip jar'}[id]} · Lv ${m.upgrades[id]||0}`,`<button data-upgrade="${id}" ${m.upgrades[id]>=d.max?'disabled':''}>${m.upgrades[id]>=d.max?'Max':money(d.cost)}</button>`);}).join('')+`<details><summary>Skill trees and signatures</summary><p>Permanent crew skills and optional signature abilities.</p><select aria-label="Skill tree crew" data-select="tree">${CREW.map(id=>`<option ${id===(selected||'jared')?'selected':''}>${id}</option>`).join('')}</select>${(UPGRADES.crewUpgrades[selected||'jared']||[]).map(n=>`<div class="row"><span>${n.name}${n.signature?' · Signature':''}<small>Tier ${n.tier} · ${n.requires.join(', ')}</small></span><button data-node="${n.id}" data-owner="${selected||'jared'}" ${tree?.owned.includes(n.id)?'disabled':''}>${tree?.owned.includes(n.id)?'Owned':money(n.cost)}</button></div>`).join('')}</details><details><summary>Build and expand</summary><p>Current stand era: ${tree?.era||1}</p><button data-action="era">Advance stand era</button>${Object.entries(UPGRADES.standUpgrades).map(([id,nodes])=>`<details><summary>${id}</summary>${nodes.map(n=>`<div class="row"><span>${n.name}<small>${(n.requires||[]).join(', ')}</small></span><button data-stand="${id}" data-node="${n.id}" ${tree?.owned.includes(n.id)?'disabled':''}>${tree?.owned.includes(n.id)?'Owned':money(n.cost)}</button></div>`).join('')}</details>`).join('')}<button data-prop="igloo_cooler">Cooler · $30</button><button data-prop="salsa_bar">Salsa bar · $150</button></details><details><summary>Jared's vault and coin flip</summary><p>Gold: ${tree?.vault.gold.holdings||0} oz · Silver: ${tree?.vault.silver.holdings||0} oz</p><button data-action="gold">Buy 1 oz gold</button><button data-action="sell-gold">Sell 1 oz gold</button><label>Coin flip policy<select data-select="coin"><option value="decline" ${tree?.coin.policy==='decline'?'selected':''}>Decline</option><option value="small" ${tree?.coin.policy==='small'?'selected':''}>Accept · 10% wager</option><option value="yolo" ${tree?.coin.policy==='yolo'?'selected':''}>Accept · 50% wager</option></select></label></details><details><summary>Stats and settings</summary><p>Tacos sold: ${s.dayLedger.tacos}<br>Revenue: ${money(s.dayLedger.revenue)}<br>Tips: ${money(s.dayLedger.tips)}<br>Unhappy customers: ${s.dayLedger.walkoffs}<br>Queue: ${s.line.length} · Pickup: ${s.customers.filter(c=>c.state==='waiting').length}</p><button data-action="overlay">${overlay?'Hide':'Show'} order IDs</button><button data-action="sound">${muted?'Unmute':'Mute'} coin sound</button><button data-action="reset-camera">Reset camera</button></details>`;
  }else if(tab==='summary'){
    const d=s.dayLedger,done=s.phase==='summary';
    $('[data-panel="summary"]').innerHTML=header(done?'Day complete':'Day so far')+`<div class="metrics">${[[d.tacos,'Tacos sold'],[money(d.revenue),'Revenue'],[money(d.tips),'Tips'],[d.walkoffs,'Unhappy customers']].map(([n,label])=>`<div><strong>${n}</strong><small>${label}</small></div>`).join('')}</div><p>${d.stockout?'Next day: restock tortillas before opening.':d.walkoffs>2?'Next day: upgrade the grill to shorten the wait.':'Next day: keep a fair price while building a faster kitchen.'}</p>${done?'<button class="primary" data-action="next">Plan next day</button>':''}`;
  }
}
function start(){unlock();const result=['preopen','summary'].includes(game.state.phase)?call('startDay'):{ok:true};if(!result.ok)return;planning=false;paused=false;running=true;speed=1;lastPhase='';document.body.dataset.quadMode='watch';$('.manager-shell').hidden=true;$('.title').hidden=true;$('.hud').hidden=false;$('.watch-buttons').hidden=false;openPanel('');save();}
function plan(){planning=true;running=true;paused=false;document.body.dataset.quadMode='manager';$('.title').hidden=true;$('.manager-shell').hidden=false;$('.hud').hidden=false;$('.watch-buttons').hidden=false;$('.planning-day').textContent=game.state.day;openPanel('');}
root.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;unlock();
  if(b.dataset.tab){openPanel(tab===b.dataset.tab?'':b.dataset.tab);return;}
  if(b.dataset.crew){selected=b.dataset.crew;renderPanel();return;}
  if(b.dataset.speed!==undefined){speed=Number(b.dataset.speed)||1;paused=b.dataset.speed==='0';updateHUD();return;}
  if(b.dataset.upgrade){call('buyUpgrade',b.dataset.upgrade);renderPanel();return;}
  if(b.dataset.node){if(b.dataset.stand)call('buyStandUpgrade',b.dataset.stand,b.dataset.node);else call('buyCrewUpgrade',b.dataset.owner,b.dataset.node);renderPanel();return;}
  if(b.dataset.prop){call('buyProp',b.dataset.prop);renderPanel();return;}
  switch(b.dataset.action){
    case 'open':game=createGame(7,null,{autostart:false,config});plan();break;
    case 'continue':try{const data=JSON.parse(localStorage.getItem(SAVE));game=createGame(data.seed,data,{autostart:false,config});plan();}catch{toast('Could not load that save.');}break;
    case 'start':start();break;
    case 'close':openPanel('');break;
    case 'next':if(call('acknowledgeDay').ok)plan();break;
    case 'restock':call('restock',25);renderPanel();break;
    case 'era':call('advanceEra');renderPanel();break;
    case 'gold':call('invest','gold',1);renderPanel();break;
    case 'sell-gold':call('sell','gold',1);renderPanel();break;
    case 'overlay':overlay=!overlay;renderPanel();break;
    case 'sound':muted=!muted;renderPanel();break;
    case 'reset-camera':scene.reset();break;
  }
});
root.addEventListener('change',e=>{const type=e.target.dataset.select,v=e.target.value;if(type==='price'){call('setPolicy',{strategy:{price:v}});}if(type==='menu')call('setMenu',{featured:v});if(type==='tree'){selected=v;renderPanel();}if(type==='coin')call('setCoinPolicy',v);});
addEventListener('keydown',e=>{if(e.key==='Escape')openPanel('');if(e.code==='Space'&&e.target===document.body){e.preventDefault();paused=!paused;}if(e.key==='r')scene.reset();});
addEventListener('pagehide',()=>{if(running)save();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&running){paused=true;save();}});
function updateHUD(){const s=game.state;$('.cash').textContent=money(s.cash);$('.clock').textContent=`Day ${s.day} · ${clockOf(s,game.config).label}`;$('.rating').textContent=`★ ${(s.manager.reputation/20).toFixed(1)}`;$$('[data-speed]').forEach(b=>b.classList.toggle('active',Number(b.dataset.speed)===(paused?0:speed)));}
let scene;
try{const art=await loadQuadArt();scene=createQuadScene(document.getElementById('view'),art,id=>{selected=id;openPanel('crew');});}catch(e){$('#loading').textContent=`Unable to load painted art: ${e.message}`;throw e;}
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
$('#loading').remove();document.body.dataset.quadMode='title';
const runtime={get game(){return game;},get paused(){return !running||planning||paused;},get lastTransition(){return {ok:!planning,phaseAfter:game.state.phase};},contractVersion:'quad-gameplay-v1'};
window.__quad={runtime,scene,art:scene.art,cam:scene.camera,fps:0,frameTimes:[],payments:[],events:[]};
let last=performance.now(),hudAt=0,fpsAt=last,frames=0;
function frame(now){const rawDt=Math.max(0,(now-last)/1000),dt=Math.min(.05,rawDt);last=now;frames++;
  if(running&&!planning&&!paused&&!document.hidden)game.tick(dt*speed);
  for(const event of game.drainEvents()){
    if(event.type==='payment'){payments.push(event);window.__quad.payments.push(event);ching();}
    window.__quad.events.push(event);
  }
  if(window.__quad.events.length>3000)window.__quad.events.splice(0,1000);
  payments=payments.filter(e=>game.state.t-e.t<1.8&&e.day===game.state.day);
  if(game.state.phase==='summary'&&lastPhase!=='summary'&&running&&!planning){openPanel('summary');save();}
  lastPhase=game.state.phase;
  if(now-hudAt>150){updateHUD();hudAt=now;}
  if(running&&now-lastSave>5000){save();lastSave=now;}
  scene.draw(game.state,payments,overlay);
  if(now-fpsAt>=1000){window.__quad.fps=Math.round(frames*1000/(now-fpsAt));frames=0;fpsAt=now;}
  window.__quad.frameTimes.push(rawDt*1000);if(window.__quad.frameTimes.length>1200)window.__quad.frameTimes.shift();
  window.__quadReady=true;requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
