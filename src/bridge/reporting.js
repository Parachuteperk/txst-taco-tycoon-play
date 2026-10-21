// Read-only session evidence. No invented causes or performer tie-breaking.
export function createReportEvidence(){
  let day=null,hours={},causes={},work={},previous=null;
  const clockMinute=(config,t)=>{let elapsed=0;for(const phase of Object.values(config.phases)){if(!phase.seconds)continue;if(t<=elapsed+phase.seconds)return phase.clockStart+(phase.clockEnd-phase.clockStart)*Math.max(0,t-elapsed)/phase.seconds;elapsed+=phase.seconds;}return 840;};
  return {
    reset(){day=null;previous=null;hours={};causes={};work={};},
    sample(view,events,config){
      if(day!==view.day){day=view.day;hours={};causes={};work={};previous=null;}
      for(const event of events){
        if(event.day!==day)continue;
        if(event.type==='sale'||event.type==='outpostSale'){
          const hour=Math.floor(clockMinute(config,event.t)/60);hours[hour]=(hours[hour]||0)+(event.tacos??1);
        }
        if(event.type==='walkoff'){
          const cause=event.farewell?'Big Rush departure':event.prepped?'Wait after prep':'Wait before prep';causes[cause]=(causes[cause]||0)+1;
        }
      }
      // Measure real active work time; equal totals remain shared honours.
      if(previous&&view.t>previous.t&&view.day===previous.day){const dt=Math.min(1,view.t-previous.t);for(const [id,station] of Object.entries(previous.stations||{})){if(station.active&&station.crew){const staff=previous.crew?.find(person=>person.station===id&&person.shift!==false);const crewId=previous.engaged?staff?.id:station.crew;if(crewId)work[crewId]=(work[crewId]||0)+dt;}}}
      previous={day:view.day,t:view.t,stations:view.stations,crew:view.manager?.staff||view.manager?.crew||[],engaged:view.manager?.engaged};
    },
    get data(){return {day,hours:{...hours},causes:{...causes},work:{...work}};},
  };
}
