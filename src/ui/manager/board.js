import {el,button,money} from '../dom.js';
import {copy} from '../../bridge/copy.js';

const projectName=project=>copy(project.textKey).split('. ')[0];

export function chemistryLines(crew, pairs, id) {
  return (pairs||[]).filter(pair=>!id||pair.ids.includes(id)).map(pair=>({
    ...pair,
    names:pair.ids.map(key=>crew.find(person=>person.id===key)?.name||key).join(' + '),
    benefit:`+${Number((pair.speed*100).toFixed(1))}% speed · +${pair.morale} morale`,
  }));
}
export function appendChemistry(parent,model,card){
  const pairs=chemistryLines(model.crew,model.raw.chemistry);if(!pairs.length)return;
  const node=card('Crew chemistry','trust');node.dataset.board='chemistry';
  for(const pair of pairs){const row=el('div','board-row');row.append(el('strong','',pair.names),el('div','',copy(pair.textKey)),el('small','',`${pair.active?'Active':'Resting · both shifts needed'} · ${pair.benefit}`));node.append(row);}
  parent.append(node);
}
export function appendForecast(parent,model,view,card){
  for(const [forecast,label]of[[model.raw.forecast,'Week forecast'],[model.raw.upcoming,'Next week']]){
    if(!forecast?.days?.length)continue;
    const node=card(`${label} · ${forecast.week}`,'weather');node.dataset.board='forecast';
    node.append(el('small','','Campus forecasts can miss. Set capacity before marketing.'));
    for(const day of forecast.days){const row=el('div','board-row');row.dataset.today=String(day.day===view.day);const risk={low:'low',med:'medium',high:'high'}[day.dale]||String(day.dale||'').replace(/^dale\s*/i,'');row.append(el('strong','',`${day.dayName}${day.day===view.day?' · today':''}`),el('div','',`${copy(day.weatherKey)} · ${copy(day.crowdKey)}`),el('small','',`${copy(day.eventKey)} · Inspection risk ${risk}`));node.append(row);}parent.append(node);
  }
  const rival=view.live?.rival;if(!rival)return;
  const node=card('Rival truck','gameDay');node.dataset.board='rival';node.append(el('strong','',copy(rival.nameKey)),el('p','',rival.present?`On campus · ${money(rival.price)} tacos · ${rival.speed.toFixed(2)}× service speed`:'Away today · the Quad is ours.'));
  if(rival.present)node.append(el('p','',`${Math.round((rival.steal||0)*100)}% demand diverted`),el('small','','Speed and a fair price help defend our share.'));
  for(const row of model.raw.standings?.rows||[])node.append(el('div','board-row',`${row.rank}. ${copy(row.nameKey)} · ${row.sold} sold · ${Math.round(row.share*100)}% share · ${row.rating.toFixed(1)}★`));parent.append(node);
}
export function appendResearch(parent,model,view,card,onStart){
  const projects=model.raw.projects||[];if(!projects.length)return;
  const active=model.raw.project,planning=view.manager?.planning||view.phase==='preopen'||view.phase==='summary';
  const node=card('Overnight research & development','upgrade');node.dataset.board='research';
  node.append(el('p','','Fund one project at a time. Progress advances at day close; completed research improves the next lunch.'));
  if(active){node.append(el('strong','',`${projectName(active)} · ${active.daysDone}/${active.days} nights`));const bar=el('progress');bar.max=1;bar.value=active.progress;bar.setAttribute('aria-label','Research progress');node.append(bar);}
  for(const project of projects){const row=el('div','board-row');row.append(el('strong','',`${projectName(project)} · ${project.level}/${project.max}`),el('p','',`${money(project.cost)} · ${project.days} nights`));
    const pick=button(project.active?'In progress':project.level>=project.max?'Complete':`Fund ${projectName(project)}`,()=>onStart(project.id));pick.disabled=!planning||!!active||project.level>=project.max||view.cash<project.cost;row.append(pick);node.append(row);}
  parent.append(node);
}

export function appendTelemetry(parent,view,card){
  const samples=view.live?.history;if(!Array.isArray(samples))return;
  const node=card('Lunch telemetry','speed');node.dataset.board='telemetry';
  node.append(el('small','','Engine samples · last six observations, every ten campus minutes.'));
  const table=el('table','telemetry-table');table.setAttribute('aria-label','Lunch service telemetry');
  const head=el('tr');for(const label of ['Time','Tacos/min','Line','Cash'])head.append(el('th','',label));table.append(head);
  for(const sample of samples.slice(-6)){const row=el('tr');for(const value of [sample.clock,sample.tacosPerMin.toFixed(1),String(sample.line),money(sample.cash)])row.append(el('td','',value));table.append(row);}
  node.append(table);if(!samples.length)node.append(el('p','','Samples appear once lunch starts.'));parent.append(node);
}
