// Alternate frame for each student on the lunch line.
// customers-chatgpt-react.png is paired by reading order with the line sheet:
// index 0 is the bow girl, then the cowboy, the football player, and so on.
// The couple is two indexes (9 annoyed, 10 cheer). A 17th figure on that
// sheet, the bottom-right yellow cheer, has no sheet-1 twin and is not paired.
//
// Impatient poses: 0 crossed-tap, 1 watch, 2 angry-watch, 3 phone, 4 crossed,
// 5 bored, 6 yawn, 7 sweat, 8 watch, 9 annoyed, 12 glare, 13 watch, 14 yawn, 15 crossed.
// Cheer poses: 10 pointing, 11 chips. One alternate exists per student, so either
// a low-patience moment or a handoff shows that student's frame.

export const CUSTOMER_REACTION_POSES = Object.freeze([
  'crossed-tap', 'watch', 'angry-watch', 'phone', 'crossed', 'bored', 'yawn', 'sweat',
  'watch', 'annoyed', 'cheer', 'snack', 'glare', 'watch', 'yawn', 'crossed',
]);

export const CUSTOMER_REACTION_MOOD = Object.freeze([
  'impatient', 'impatient', 'impatient', 'impatient', 'impatient', 'impatient', 'impatient', 'impatient',
  'impatient', 'impatient', 'happy', 'happy', 'impatient', 'impatient', 'impatient', 'impatient',
]);

export function customerReactionKind(person) {
  if (!person) return null;
  const actor = person.actor;
  const state = person.state || actor?.state || '';
  const mood = person.mood || actor?.mood || '';
  const hold = person.hold || actor?.hold || '';
  if (state === 'walkout' || mood === 'angry') return 'impatient';
  if (state === 'leave' && hold !== 'taco') return 'impatient';
  if (state === 'handoff' || state === 'leaving' || state === 'happy' || state === 'eat') return 'happy';
  if (mood === 'happy' || hold === 'taco') return 'happy';
  if (person.stage === 'serve' || person.station === 'serve' || actor?.stage === 'serve') return 'happy';
  if (mood === 'impatient') return 'impatient';
  const patience = person.patience ?? actor?.patience;
  const max = person.patienceMax ?? actor?.patienceMax;
  // Demo line stores elapsed wait and tags source 'sim'.
  if (person.source === 'sim' && typeof patience === 'number') return patience > 14 ? 'impatient' : null;
  if (typeof max === 'number' && max > 1.5 && typeof patience === 'number') return patience / max < 0.35 ? 'impatient' : null;
  if (typeof patience === 'number' && patience >= 0 && patience <= 1) return patience < 0.35 ? 'impatient' : null;
  if (typeof patience === 'number' && patience > 14 && (person.kind === 'cust' || person.stage)) return 'impatient';
  return null;
}

// iso-customers.png is 8×4. Rows are real painted frames. Do not mirror the
// wait row into approach, and do not tint it for angry.
// pay: iso-customers-pay.png, only while that customer is paying at the window.
// approach: row 2, walking toward the window from behind.
// away: row 3, walking off down-right while eating.
// angry: row 4, empty-handed walk-off down-right.
export function customerSheetPose(person) {
  const state = `${person?.state || ''}`.toLowerCase();
  const mood = `${person?.mood || ''}`.toLowerCase();
  if (state === 'paying' || person?.paying) return 'pay';
  if (state === 'walkout' || state === 'walkoff' || mood === 'angry') return 'angry';
  if (state === 'leaving' || state === 'eat' || state === 'walkaway' || state === 'handoff') return 'away';
  if (state === 'approach' || state === 'joining' || person?.arriving || person?.walking) return 'approach';
  return 'wait';
}

// index is the slot already chosen in art.customers. The reaction list is parallel.
export function customerSpriteAt(art, index, person) {
  const iso = art?.iso?.customers;
  if (iso?.idle?.length || iso?.wait?.length) {
    const id = Math.abs((person && person.id) ?? index ?? 0);
    const pose = customerSheetPose(person);
    const pay = art.iso.customersPay;
    if (pose === 'pay' && pay?.length) return pay[id % pay.length];
    const row = pose === 'angry' ? (iso.angry || iso.idle)
      : pose === 'away' ? (iso.eat || iso.away || iso.idle)
      : pose === 'approach' ? (iso.walk || iso.approach || iso.idle)
      : (iso.idle || iso.wait);
    if (row?.length) return row[id % row.length];
  }
  const customers = art?.customers || [];
  const n = customers.length;
  if (!n || typeof index !== 'number' || index < 0) return null;
  const slot = ((index % n) + n) % n;
  const base = customers[slot];
  const kind = customerReactionKind(person);
  const alt = kind ? art?.customerReactions?.[slot] : null;
  return alt || base || null;
}
