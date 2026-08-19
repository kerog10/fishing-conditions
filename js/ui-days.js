import { compass, scoreBand, hhmm, dayLabel } from './format.js';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const n0 = (v) => (Number.isFinite(v) ? String(Math.round(v)) : '–');
const n1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '–');

// Wind shading mirrors the comfort thresholds: comfortable, workable, ugly.
function windClass(kmh) {
  if (!Number.isFinite(kmh)) return '';
  if (kmh >= 45) return 'wind-hard';
  if (kmh >= 25) return 'wind-fresh';
  return 'wind-easy';
}

const ROWS = [
  { label: 'Score', get: (s) => n0(s.score), cls: (s) => `bg-${scoreBand(s.score)} score-cell` },
  { label: 'Wind km/h', get: (s) => n0(s.wind), cls: (s) => windClass(s.wind) },
  { label: 'Gust km/h', get: (s) => n0(s.gust), cls: (s) => windClass(s.gust) },
  { label: 'Direction', get: (s) => compass(s.windDirection) || '–' },
  { label: 'Tide m', get: (s) => n1(s.tide) },
  { label: 'Swell m', get: (s) => n1(s.swellHeight) },
  { label: 'Period s', get: (s) => n0(s.swellPeriod) },
  { label: 'Temp °C', get: (s) => n0(s.temperature) },
  { label: 'Rain mm', get: (s) => (s.rain > 0.05 ? s.rain.toFixed(1) : '–') },
  { label: 'Cloud %', get: (s) => n0(s.cloud) },
  { label: 'Pressure', get: (s) => n0(s.pressure) },
];

function grid(day) {
  const table = el('table', 'grid');

  const headRow = el('tr');
  headRow.appendChild(el('th', 'row-label', ''));
  for (const slot of day.slots) headRow.appendChild(el('th', null, hhmm(slot.start)));
  const head = el('thead');
  head.appendChild(headRow);
  table.appendChild(head);

  const body = el('tbody');
  for (const row of ROWS) {
    const tr = el('tr');
    tr.appendChild(el('th', 'row-label', row.label));
    for (const slot of day.slots) {
      tr.appendChild(el('td', row.cls ? row.cls(slot) : null, row.get(slot)));
    }
    body.appendChild(tr);
  }
  table.appendChild(body);

  const scroller = el('div', 'grid-scroll');
  scroller.appendChild(table);
  return scroller;
}

function tideLine(day) {
  if (!day.tides.length) return 'No tide data for this spot';
  const parts = day.tides.map((t) => `${t.type === 'high' ? 'High' : 'Low'} ${hhmm(t.time)} (${t.height.toFixed(1)} m)`);
  return `Tides (modelled): ${parts.join(' · ')}`;
}

function skyLine(day) {
  const bits = [];
  if (day.sun.sunrise) bits.push(`Sunrise ${hhmm(day.sun.sunrise)}`);
  if (day.sun.sunset) bits.push(`Sunset ${hhmm(day.sun.sunset)}`);
  bits.push(`${day.moon.name} ${Math.round(day.moon.illumination * 100)}%`);
  if (day.moon.majors.length) bits.push(`Major ${day.moon.majors.map(hhmm).join(', ')}`);
  if (day.moon.minors.length) bits.push(`Minor ${day.moon.minors.map(hhmm).join(', ')}`);
  return bits.join(' · ');
}

function digest(day) {
  const bits = [`${n0(day.wind.min)}–${n0(day.wind.max)} km/h ${compass(day.wind.direction)}`.trim()];
  if (day.swell) bits.push(`${n1(day.swell.min)}–${n1(day.swell.max)} m swell`);
  bits.push(`${n0(day.temperature.min)}–${n0(day.temperature.max)} °C`);
  if (day.rain > 0.05) bits.push(`${day.rain.toFixed(1)} mm rain`);
  return bits.join(' · ');
}

export function renderDays(target, days, now = new Date(), { openKey = null } = {}) {
  target.replaceChildren();

  for (const day of days) {
    const card = el('details', `day band-${scoreBand(day.best.score)}`);
    // With no day nominated, today is the one you want open on arrival.
    card.open = openKey ? day.key === openKey : dayLabel(day.date, now) === 'Today';
    card.dataset.dayKey = day.key;

    const summary = el('summary');
    const line = el('div', 'day-head');
    line.appendChild(el('span', 'label', dayLabel(day.date, now)));
    line.appendChild(el('span', 'score', String(day.best.score)));
    summary.appendChild(line);
    summary.appendChild(el('div', 'digest', digest(day)));
    card.appendChild(summary);

    card.appendChild(el('p', 'tide-line', tideLine(day)));
    card.appendChild(el('p', 'sky-line', skyLine(day)));
    card.appendChild(grid(day));
    target.appendChild(card);
  }
}
