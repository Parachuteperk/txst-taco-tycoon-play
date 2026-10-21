export function el(tag, cls = '', text = '') { const n = document.createElement(tag); n.className = cls; n.textContent = text; return n; }
export function button(text, fn, cls = '') { const b = el('button', cls, text); b.type = 'button'; b.addEventListener('click', fn); return b; }
export const money = n => Number.isFinite(n)?new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n):'—';
export function select(label, entries, value) {
  const wrap = el('label', 'field', label), input = el('select');
  for (const [id, title] of entries) { const option = el('option', '', title); option.value = id; input.append(option); }
  input.value = value; wrap.append(input); return { wrap, input };
}
