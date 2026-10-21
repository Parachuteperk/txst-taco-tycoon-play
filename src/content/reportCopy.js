// Report copy follows recorded outcomes; never lets a generic engine slogan hide losses.
export function reportCopy(view){
 const t=view.today,issues=[];
 if(t.walkoffs>0)issues.push(`${t.walkoffs} customers left before pickup. ${['Service capacity did not keep up with demand.','The queue cost us sales today.','Protect waiting customers before buying more traffic.'][view.day%3]}`);
 if(t.fines>0)issues.push('Dale’s fines cut into the drawer. Reduce Antonio’s hack aggression.');
 if(t.profit<0)issues.push('Lunch lost money. Review ingredient costs, overhead and pricing before expanding.');
 if(view.inventory.tortillas<12)issues.push('Tortillas finished low. Plan a full restock for the next lunch.');
 if(!issues.length)issues.push(['No walkouts or fines recorded. Keep capacity ahead of the next forecast.','Service held together today. Review tomorrow’s demand before repeating the plan.','A clean lunch. Check tired crew before increasing marketing.'][view.day%3]);
 return issues;
}
