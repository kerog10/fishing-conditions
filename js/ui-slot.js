import { CONFIG } from './config.js';
import { compass, scoreBand, timeRange } from './format.js';

// The slot detail panel, lifted out of ui-days.js and extended. The table shows
// the thirteen readings you scan; everything else Open-Meteo gives us lives
// here, which is how "more parameters" and "a scannable table" are satisfied at
// the same time.

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const n0 = (v) => (Number.isFinite(v) ? String(Math.round(v)) : '–');
const n1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '–');

// Every row returns a string or null, and null means omit the row. Inland spots
// must not grow a block of dashes where the sea used to be.
const unit = (value, suffix, digits = 0) => (Number.isFinite(value)
  ? `${digits ? value.toFixed(digits) : Math.round(value)} ${suffix}`
  : null);

const GROUPS = [
  {
    title: null,
    rows: [
      { label: 'Tide', get: (s) => unit(s.tide, 'm', 1) },
      { label: 'Wind', get: (s) => (Number.isFinite(s.wind) ? `${n0(s.wind)} km/h ${compass(s.windDirection)}`.trim() : null) },
      { label: 'Gusts', get: (s) => unit(s.gust, 'km/h') },
      { label: 'Pressure', get: (s) => unit(s.pressure, 'hPa') },
      { label: 'Rain', get: (s) => (s.rain > 0.05 ? `${s.rain.toFixed(1)} mm` : '—') },
    ],
  },
  {
    title: 'Air',
    rows: [
      { label: 'Temp', get: (s) => unit(s.temperature, '°C') },
      { label: 'Feels like', get: (s) => unit(s.apparentTemperature, '°C') },
      { label: 'Dew point', get: (s) => unit(s.dewPoint, '°C') },
      { label: 'Humidity', get: (s) => unit(s.humidity, '%') },
      { label: 'Visibility', get: (s) => (Number.isFinite(s.visibility) ? `${n1(s.visibility / 1000)} km` : null) },
      // Peaks, not means: a UV index of 9 for one hour is what burns you, and
      // the CAPE peak is what builds the thunderstorm.
      { label: 'UV (peak)', get: (s) => unit(s.uvIndex, '') },
      { label: 'CAPE (peak)', get: (s) => unit(s.cape, 'J/kg') },
      { label: 'Freezing level', get: (s) => unit(s.freezingLevel, 'm') },
    ],
  },
  {
    title: 'Cloud',
    rows: [
      { label: 'Total', get: (s) => unit(s.cloud, '%') },
      { label: 'Low', get: (s) => unit(s.cloudLow, '%') },
      { label: 'Mid', get: (s) => unit(s.cloudMid, '%') },
      { label: 'High', get: (s) => unit(s.cloudHigh, '%') },
    ],
  },
  {
    title: 'Sea',
    rows: [
      { label: 'Sea temp', get: (s) => unit(s.seaTemperature, '°C') },
      { label: 'Swell', get: (s) => (Number.isFinite(s.swellHeight) ? `${n1(s.swellHeight)} m ${compass(s.swellDirection)}`.trim() : null) },
      { label: 'Swell period', get: (s) => unit(s.swellPeriod, 's') },
      { label: 'Secondary swell', get: (s) => unit(s.secondarySwellHeight, 'm', 1) },
      // A different sea arriving at the same beach: the table's swell row shows
      // only one of them, and the short steep one is what makes it unfishable.
      { label: 'Wind wave', get: (s) => (Number.isFinite(s.windWaveHeight) ? `${n1(s.windWaveHeight)} m ${compass(s.windWaveDirection)}`.trim() : null) },
      { label: 'Wind wave period', get: (s) => unit(s.windWavePeriod, 's') },
      { label: 'Combined sea', get: (s) => (Number.isFinite(s.waveHeight) ? `${n1(s.waveHeight)} m ${compass(s.waveDirection)}`.trim() : null) },
      { label: 'Sea period', get: (s) => unit(s.wavePeriod, 's') },
      { label: 'Current', get: (s) => (Number.isFinite(s.currentVelocity) ? `${n1(s.currentVelocity)} km/h ${compass(s.currentDirection)}`.trim() : null) },
    ],
  },
];

// gfs_seamless -> GFS, ecmwf_ifs025 -> ECMWF, ecmwf_wam025 -> ECMWF-WAM.
// The resolution suffix is noise once you are looking at three numbers.
const modelName = (id) => id
  .replace(/_seamless$/, '')
  .replace(/_ifs\d+$/, '')
  .replace(/_wam\d+$/, '-wam')
  .replace(/_/g, '-')
  .toUpperCase();

const MODEL_ORDER = [...CONFIG.models.forecast, ...CONFIG.models.marine];
const orderOf = (id) => {
  const i = MODEL_ORDER.indexOf(id);
  return i === -1 ? MODEL_ORDER.length : i;
};

const SPREAD_UNITS = {
  wind: { suffix: 'km/h', digits: 0 },
  gusts: { suffix: 'km/h', digits: 0 },
  pressure: { suffix: 'hPa', digits: 0 },
  rain: { suffix: 'mm/h', digits: 1 },
  swell: { suffix: 'm', digits: 1 },
};

function spreadLine(key, readings) {
  const { suffix, digits } = SPREAD_UNITS[key] ?? { suffix: '', digits: 1 };
  const parts = Object.entries(readings)
    .sort((a, b) => orderOf(a[0]) - orderOf(b[0]))
    // Same order every time, so the same model is always in the same position
    // and you can compare two slots without re-reading the names.
    .map(([id, value]) => `${modelName(id)} ${Number(value).toFixed(digits)}`);
  return `${parts.join(' · ')} ${suffix}`.trim();
}

const rowLabel = (key) => CONFIG.tableRows.find((r) => r.key === key)?.label ?? key;

// The hatch on a cell only says the column is worth tapping. This is what it is
// worth tapping for.
function agreementSection(agreement) {
  const section = el('div', 'slot-models');

  if (!agreement) {
    // A missing section would be indistinguishable from full agreement.
    section.appendChild(el('p', 'slot-note', 'Model comparison unavailable.'));
    return section;
  }

  const disputed = Object.entries(agreement).filter(([, v]) => v.agree === false);
  const single = Object.entries(agreement).filter(([, v]) => v.agree === null);

  if (disputed.length) {
    section.appendChild(el('h4', null, 'Models disagree'));
    const list = el('dl', 'slot-rows');
    for (const [key, value] of disputed) {
      list.appendChild(el('dt', null, rowLabel(key)));
      list.appendChild(el('dd', null, spreadLine(key, value.readings)));
    }
    section.appendChild(list);
  }

  // Silence must not read as agreement: one model answering is not a consensus,
  // and the panel is the only place that can be said in words.
  if (single.length) {
    const names = [...new Set(single.flatMap(([, v]) => Object.keys(v.readings)))]
      .sort((a, b) => orderOf(a) - orderOf(b))
      .map(modelName);
    const which = single.map(([key]) => rowLabel(key)).join(', ');
    section.appendChild(el('p', 'slot-note',
      `Only one model available for ${which} (${names.join(', ')}).`));
  }

  if (!disputed.length && !single.length) {
    section.appendChild(el('p', 'slot-note', 'All models agree on these values.'));
  }

  return section;
}

export function renderSlotDetail(slot) {
  const panel = el('div', `slot-detail band-${scoreBand(slot.score)}`);

  const end = new Date(slot.start.getTime() + slot.hours.length * 3600000);
  const head = el('div', 'slot-head');
  head.appendChild(el('span', null, timeRange(slot.start, end)));
  head.appendChild(el('span', 'score', String(Math.round(slot.score))));
  panel.appendChild(head);

  for (const group of GROUPS) {
    const list = el('dl', 'slot-rows');
    for (const row of group.rows) {
      const value = row.get(slot);
      if (value === null) continue;
      list.appendChild(el('dt', null, row.label));
      list.appendChild(el('dd', null, value));
    }
    // A heading over nothing is worse than no heading: inland spots drop the
    // whole Sea group rather than showing an empty one.
    if (!list.childElementCount) continue;
    if (group.title) panel.appendChild(el('h4', null, group.title));
    panel.appendChild(list);
  }

  const why = [...new Set(slot.hours.flatMap((h) => h.reasons ?? []))];
  if (why.length) panel.appendChild(el('p', 'slot-why', `Why: ${why.join(' · ')}`));

  panel.appendChild(agreementSection(slot.agreement));

  return panel;
}
