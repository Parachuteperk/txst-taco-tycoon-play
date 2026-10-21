import {reportCopy} from '../../content/reportCopy.js';
const CAUSE_CREW={'manager.cause.stockout':'phillip','manager.cause.dale':'antonio','manager.cause.grillDark':'jared','manager.cause.flood':'matt'};
function strategyNow(view,model){return {...(model?.policies||{}),...(view.manager?.strategy||{})};}
function offer(calls,strategy,label,patch){const diff={};for(const [key,value] of Object.entries(patch.strategy||{}))if(strategy[key]!==value)diff[key]=value;if(Object.keys(diff).length)calls.push({label,patch:{strategy:diff}});}
function shiftStar(view,model,data){
 const name=id=>model.crew.find(p=>p.id===id)?.name||id;
 const on=new Set(model.crew.filter(p=>p.shift!==false).map(p=>p.id));
 const scores={};const add=(id,n)=>{if(!id||!n||(on.size&&!on.has(id)))return;scores[id]=(scores[id]||0)+n;};
 const cause=view.report?.cause||view.manager?.report?.cause||'';
 add(CAUSE_CREW[cause],100);
 const causes=data.causes||{};
 add('jared',(causes['Wait before prep']||0)*2);
 add('ali',(causes['Wait after prep']||0)*2);
 add('matt',(causes['Big Rush departure']||0)*3);
 const pointed=(causes['Wait before prep']||0)+(causes['Wait after prep']||0)+(causes['Big Rush departure']||0);
 if(pointed>0||CAUSE_CREW[cause]){
  const ranked=Object.entries(scores).sort((a,b)=>b[1]-a[1]);
  if(!ranked.length)return {star:null,basis:'No on-duty crew matched the day’s measured losses.'};
  const top=ranked[0][1],leaders=ranked.filter(([,n])=>Math.abs(n-top)<=Math.max(1,top*0.08));
  return {star:leaders.map(([id])=>name(id)).join(' + '),basis:'Honours follow the day’s measured losses and the engine cause, not how long the grill stayed occupied.'};
 }
 const work=Object.entries(data.work||{}).sort((a,b)=>b[1]-a[1]);
 const leaders=work.length?work.filter(([,value])=>Math.abs(value-work[0][1])<.1):[];
 return {star:leaders.length?leaders.map(([id])=>name(id)).join(' + '):null,basis:'Observed active station time; equal workloads share honours.'};
}
export function dailyReport(view,model,evidence={}){
 const native=view.report||view.manager?.report||{},data=evidence.day===view.day?evidence:{};
 const {star,basis:starBasis}=shiftStar(view,model,data);
 const causes={...data.causes};const observed=Object.values(causes).reduce((a,b)=>a+b,0);
 if(view.today.walkoffs>observed)causes['Earlier / unclassified']=view.today.walkoffs-observed;
 const strategy=strategyNow(view,model),calls=[];
 if(view.today.walkoffs>0)offer(calls,strategy,'Protect the line · speed + serpentine',{strategy:{focus:'speed',line:'serpentine'}});
 if((view.today.fines>0||view.suspicion>25)&&strategy.hack!=='low')offer(calls,strategy,'Lower hack aggression',{strategy:{hack:'low'}});
 if(view.inventory.tortillas<12&&strategy.restock!=='planned')offer(calls,strategy,'Plan full morning supplies',{strategy:{restock:'planned'}});
 if(view.inventory.tortillas<12&&strategy.restock==='planned'&&strategy.portion!=='skimpy')offer(calls,strategy,'Stretch the tortillas · light portions',{strategy:{portion:'skimpy'}});
 if(calls.length<3&&model.crew.some(p=>p.fatigue>=50)&&strategy.focus!=='balance')offer(calls,strategy,'Ease the next shift · balanced service',{strategy:{focus:'balance'}});
 if(calls.length<2)offer(calls,strategy,'Prepare for demand · automatic bottleneck support',{strategy:{hold:'auto',call:'auto'}});
 if(view.today.walkoffs>20&&strategy.line==='serpentine')offer(calls,strategy,'Hold the rope · turn away overflow',{strategy:{line:'turnAway'}});
 if(calls.length<2&&strategy.restock!=='planned')offer(calls,strategy,'Plan full morning supplies',{strategy:{restock:'planned'}});
 return {star,starBasis,problems:reportCopy(view),hours:data.hours||{},causes,calls:calls.slice(0,3),rivalShare:Number.isFinite(native.share)?1-native.share:null,planFit:native.planFit??null};
}
export function rateLabel(value){return Number.isFinite(value)?value.toFixed(1):'—';}

// Payback copy uses the engine's published grill contract: an $80 burner at
// +16% cook speed clears in about 3–5 days. Other speed buys with the same
// cost-per-speed land on that same window. Demand and tip buys say so.
export function upgradePayback(upgrade,catalog={}){
 const row=catalog[upgrade?.id]||{};
 const speed=Number(row.speed)||0;
 const cost=Number(row.cost??upgrade?.cost)||0;
 const bits=[];
 if(speed)bits.push(`+${Math.round(speed*100)}% speed`);
 if(row.demand)bits.push(`+${Math.round(row.demand*100)}% demand`);
 if(row.tip)bits.push(`+${Math.round(row.tip*100)}% tips`);
 const grill=catalog.grill;
 const sameShape=speed>0&&cost>0&&grill?.speed>0&&grill?.cost>0&&Math.abs((cost/speed)-(grill.cost/grill.speed))<(grill.cost/grill.speed)*0.25;
 const effect=bits.join(', ')||'Opens another corner of campus';
 const pay=sameShape
  ?'Pays back in about 3–5 days, the same cook-time math as an $80 grill.'
  :speed?'Pays back as the extra lunches this station can finish.'
  :row.demand?'Pays back when the rope is already full.'
  :row.tip?'Pays back in the tip jar, not in line speed.'
  :'Pays back once the cooler is staffed and selling.';
 return {effect,pay,text:`${effect}. ${pay}`};
}
