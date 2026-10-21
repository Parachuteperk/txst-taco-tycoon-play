// Sole compatibility layer for the incoming manager engine. Never writes game.state.
import { read, write } from '../shell/storage.js';
export const ROSTER = [
  ['jared','Jared','Register'],['phillip','Phillip','Prep'],['ali','Ali','Grill'],['matt','Matt','Pickup'],
  ['aaron','Aaron','Floor manager'],['antonio','Antonio','Hack terminal'],['west','Mrs. West','Business advisor'],
];
const DEFAULTS={price:'fair',line:'balanced',hack:'off'};
export function createManagerAdapter({load=()=>read('txst-manager-v1'),save=value=>write('txst-manager-v1',value)}={}) {
  let policies={...DEFAULTS,...load()}, speed=1, preparedDay=null, history=[], lastDay=null, previousSample=null, samples=[], tacosPerMinute=0;
  const has=(game,method)=>typeof game[method]==='function';
  const call=(game,method,...args)=>has(game,method)?game[method](...args):{ok:false,reason:'unavailable'};
  function model(game,view) {
    const manager=view.manager||{},live=view.live||{};
    const staff=manager.staff||manager.crew||{};
    const roster=Array.isArray(staff)?staff:Object.values(staff);
    const liveCrew=Array.isArray(live.crew)?live.crew:[];
    const members=ROSTER.map(([id,name,role])=>{
      const staffRow=roster.find(row=>row.id===id),liveRow=liveCrew.find(row=>row.id===id);
      const stats=view.crewStats||(Array.isArray(view.crew)?{}:view.crew)||{};const source={...stats[id],...staffRow,...liveRow};
      const slot=Object.entries(view.stations||{}).find(([,station])=>station.crew===id);
      return {...source,id,name:source.name||name,role:source.role||source.station||role,task:source.task||slot?.[1].active?.station||(slot?.[1].active?'Working':slot?'Ready':role),morale:liveRow?.morale??staffRow?.morale??stats[id]?.morale??null,fatigue:liveRow?.fatigue??staffRow?.fatigue??stats[id]?.fatigue??null};
    });
    const patience=(view.line||[]).map(person=>person.patience/Math.max(1,person.patienceMax));
    const minimum=patience.length?Math.min(...patience):1;
    return {raw:manager,crew:members,policies:{...policies,...manager.policies,...manager.strategy},speed:live.speed??manager.speed??speed,
      cash:view.cash,tacosPerMinute:live.tacosPerMinute??live.tacosPerMin??tacosPerMinute,line:live.visualCrowd??live.lineLength??live.queue??view.queue??view.lineCount??0,atStand:view.queue??live.queue??0,registerLine:live.line??view.lineCount??0,
      avgWait:live.avgWait??live.averageWait??null,walkoutRisk:live.walkoutRisk??(minimum<.2?'High':minimum<.5?'Rising':'Low'),
      history:manager.finances?.history||manager.cashHistory||history,challenge:view.challenges,upgrades:manager.upgrades||[],menu:manager.menu||null,
      capabilities:{policies:has(game,'setPolicy'),assign:has(game,'assignCrew'),upgrade:has(game,'buyUpgrade'),menu:has(game,'setMenu')},
    };
  }
  return {
    model, get speed(){return speed;}, reset(){speed=1;preparedDay=null;lastDay=null;previousSample=null;samples=[];history=[];tacosPerMinute=0;},
    sample(view) {
      if(!previousSample||previousSample.day!==view.day||view.t<previousSample.t){samples=[];tacosPerMinute=0;}
      if(!previousSample||view.t!==previousSample.t||view.day!==previousSample.day) {
        samples.push({t:view.t,tacos:view.today.tacos});
        while(samples.length>2&&samples[1].t<view.t-30)samples.shift();
        const first=samples[0],seconds=view.t-first.t;
        if(seconds>0)tacosPerMinute=Math.max(0,view.today.tacos-first.tacos)*60/seconds;
      }
      previousSample={day:view.day,t:view.t,tacos:view.today.tacos};
      if(lastDay!==view.day){history.push({day:view.day,cash:view.today.cashStart??view.cash});lastDay=view.day;}
      if(view.phase==='summary') {
        const last=history.at(-1);if(last)last.cash=view.cash;
      }
      history=history.slice(-30);
    },
    action(game,method,...args) {
      if(method==='setSpeed') {
        const value=args[0];if(![1,2,4,'skip'].includes(value))return{ok:false,reason:'unknown-speed'};
        const result=has(game,method)?call(game,method,value):{ok:true};
        if(result?.ok){speed=game.getView?.().live?.speed??value;}
        return result;
      }
      if(method==='setPolicy') {
        const [key,value]=args;
        if(has(game,method)){
          if(typeof key==='object')return call(game,method,key);
          const strategyKey=key==='pace'?'focus':key;
          const aliases={line:{balanced:'cap',fast:'serpentine'},hack:{off:'low',careful:'med',bold:'high'},pace:{balanced:'balance'}};
          return call(game,method,{strategy:{[strategyKey]:aliases[key]?.[value]??value}});
        }
        if(!['price','line','hack'].includes(key))return{ok:false,reason:'unavailable'};
        if(key==='price') {
          if(!game.config.economy.prices[value])return{ok:false,reason:'unknown-choice'};
          if(game.getView().phase==='preopen'){const result=call(game,'setPrice',value);if(!result?.ok)return result;}
        }
        policies={...policies,[key]:value};save(policies);return{ok:true};
      }
      if(method==='startDay') {
        if(has(game,method))return call(game,method);
        return game.getView().phase==='summary'?call(game,'acknowledgeDay'):{ok:true};
      }
      if(method==='assignCrew'&&has(game,method)){
        const [id,patch]=args;
        return call(game,method,id,typeof patch==='string'?{station:['register','prep','grill','serve'].includes(patch)?patch:null}:patch);
      }
      if(method==='setMenu'&&has(game,method)){
        if(typeof args[0]==='object')return call(game,method,args[0]);
        const current=game.getView().manager.menu;
        const enabled=current.items.filter(item=>item.enabled).map(item=>item.id).filter(id=>id!==args[0]);
        if(args[1])enabled.push(args[0]);
        return call(game,method,{enabled,featured:enabled.includes(current.featured)?current.featured:enabled[0]});
      }
      if(method==='chooseEvent'&&has(game,'intervene'))return call(game,'intervene',...args);
      return call(game,method,...args);
    },
    rate(game){return has(game,'setSpeed')?1:speed==='skip'?16:speed;},
    automate(game) {
      const view=game.getView();
      // Native manager engines own all automation and policy timing.
      if(view.manager)return;
      if(view.phase==='preopen'&&preparedDay!==view.day){
        preparedDay=view.day;game.setPrice(policies.price);
        const target=view.bigRush?.armed?112:view.outpost?96:74;
        const unit=game.config.economy.tortilla??.28;
        const quantity=Math.max(0,Math.min(target-view.inventory.tortillas,Math.floor(Math.max(0,view.cash-10)/Math.max(.28,unit))));
        if(quantity)game.restock(quantity);
      }
      if(view.prompts?.beat)game.chooseBeat?.('watchTheHill');
      for(const card of Object.values(view.deck||{}))if(card?.open&&!card.choice){
        // Leave time for optional intervention; no answer is required to run a day.
        if(view.phase==='closing') {
          const safe=card.choices.find(choice=>choice.safe);if(safe)game.chooseEvent(card.deck,safe.id);
        }
      }
      if(view.phase==='rush'){
        const effective={...policies};
        const station=view.stations?.[view.bottleneck];
        game.holdStand((station?.queue||0)>1||!!view.bigRush?.active);
        if(view.prompts.call)game.callTheLine(effective.line==='fast'||view.bottleneck==='grill'?'protectGrill':'clearLine');
        if(view.prompts.hack&&effective.hack!=='off'&&(effective.hack==='bold'||view.suspicion<25))game.startHack('classAgenda');
        if(view.prompts.golden)game.tapGolden();
        if(view.prompts.west&&!view.deck?.west?.open)game.chooseWest('redirect');
      }else if(view.holding)game.holdStand(false);
    },
  };
}
