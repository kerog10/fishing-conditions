import { compass, scoreBand, hhmm, dayLabel } from './format.js';
import { buildBand, extremaMarkers } from './bands.js';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const n0 = (v) => (Number.isFinite(v) ? String(Math.round(v)) : '–');
const n1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '–');

// A row of hourly bars. Screen readers get the range as text -- 24 unlabelled
// bars are noise to anyone not looking at them.
function band(label, values, summary, marks = []) {
  const built = buildBand(values);
  const row = el('div', 'band');
  row.appendChild(el('span', 'band-label', label));

  const bars = el('div', 'bars');
  bars.setAttribute('role', 'img');
  bars.setAttribute('aria-label', `${label}: ${summary}`);

  const byIndex = new Map(marks.map((m) => [m.index, m]));
  built.bars.forEach((bar, i) => {
    const mark = byIndex.get(i);
    const b = el('span', `bar${mark ? ` bar-${mark.type}` : ''}`);
    b.style.height = `${bar.pct}%`;
    bars.appendChild(b);
  });

  row.appendChild(bars);
  row.appendChild(el('span', 'band-range', summary));
  return row;
}

// The bands are drawn hourly so the tide peaks land on the printed high-water
// times, but 24 bars across a phone is a 14px tap target. The 3-hour slots
// are the things you actually press.
function axis(day, openSlot, onSlot) {
  const row = el('div', 'slots');
  day.slots.forEach((slot, i) => {
    const b = el('button', `slot${i === openSlot ? ' slot-open' : ''}`, hhmm(slot.start).slice(0, 2));
    b.type = 'button';
    b.setAttribute('aria-expanded', String(i === openSlot));
    b.setAttribute('aria-label', `${hhmm(slot.start)}, score ${Math.round(slot.score)}`);
    b.addEventListener('click', () => onSlot(day.key, i === openSlot ? null : i));
    row.appendChild(b);
  });
  return row;
}

const DETAIL_ROWS = [
  { label: 'Tide', marine: true, get: (s) => (Number.isFinite(s.tide) ? `${s.tide.toFixed(1)} m` : null) },
  { label: 'Wind', get: (s) => (Number.isFinite(s.wind) ? `${n0(s.wind)} km/h ${compass(s.windDirection)}`.trim() : null) },
  { label: 'Gusts', get: (s) => (Number.isFinite(s.gust) ? `${n0(s.gust)} km/h` : null) },
  { label: 'Swell', marine: true, get: (s) => (Number.isFinite(s.swellHeight) ? `${n1(s.swellHeight)} m` : null) },
  { label: 'Period', marine: true, get: (s) => (Number.isFinite(s.swellPeriod) ? `${n0(s.swellPeriod)} s` : null) },
  { label: 'Temp', get: (s) => (Number.isFinite(s.temperature) ? `${n0(s.temperature)} °C` : null) },
  { label: 'Rain', get: (s) => (s.rain > 0.05 ? `${s.rain.toFixed(1)} mm` : '—') },
  { label: 'Cloud', get: (s) => (Number.isFinite(s.cloud) ? `${n0(s.cloud)} %` : null) },
  { label: 'Pressure', get: (s) => (Number.isFinite(s.pressure) ? `${n0(s.pressure)} hPa` : null) },
];

function slotDetail(day, index) {
  const slot = day.slots[index];
  const panel = el('div', `slot-detail band-${scoreBand(slot.score)}`);

  const head = el('div', 'slot-head');
  head.appendChild(el('span', null, `${hhmm(slot.start)}–${hhmm(new Date(slot.start.getTime() + slot.hours.length * 3600000))}`));
  head.appendChild(el('span', 'score', String(Math.round(slot.score))));
  panel.appendChild(head);

  const list = el('dl', 'slot-rows');
  for (const row of DETAIL_ROWS) {
    const value = row.get(slot);
    // Inland spots have no tide, swell or period at all. Three rows of dashes
    // is worse than not printing them.
    if (value === null) continue;
    list.appendChild(el('dt', null, row.label));
    list.appendChild(el('dd', null, value));
  }
  panel.appendChild(list);

  const why = [...new Set(slot.hours.flatMap((h) => h.reasons ?? []))];
  if (why.length) panel.appendChild(el('p', 'slot-why', `Why: ${why.join(' · ')}`));

  return panel;
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

export function renderDays(target, days, now = new Date(), { openKey = null, openSlot = null, onSlot = () => {} } = {}) {
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

    if (day.tides.length) {
      card.appendChild(band(
        'Tide',
        day.series.tide,
        `${n1(Math.min(...day.series.tide.filter(Number.isFinite)))}–${n1(Math.max(...day.series.tide.filter(Number.isFinite)))} m`,
        extremaMarkers(day.tides, day.key),
      ));
    }
    card.appendChild(band(
      'Wind',
      day.series.wind,
      `${n0(day.wind.min)}–${n0(day.wind.max)} km/h ${compass(day.wind.direction)}`.trim(),
    ));
    card.appendChild(band('Score', day.series.score, `best ${day.best.score}`));

    card.appendChild(axis(day, day.key === openKey ? openSlot : null, onSlot));
    if (day.key === openKey && openSlot !== null && day.slots[openSlot]) {
      card.appendChild(slotDetail(day, openSlot));
    }

    target.appendChild(card);
  }
}
