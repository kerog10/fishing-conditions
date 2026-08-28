import { hhmm, timeRange } from './format.js';
import { renderSlotDetail } from './ui-slot.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

// One arrow, rotated. It points where the wind is going, not where it comes
// from -- the same convention Windguru uses, and the one that reads correctly
// when you are standing on the beach looking at it.
function arrow(degrees) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 10 10');
  svg.setAttribute('class', 'wind-arrow');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M5 0 L8.5 9 L5 6.8 L1.5 9 Z');
  svg.appendChild(path);
  // Continuous, so it is a transform rather than a class.
  svg.style.transform = `rotate(${degrees + 180}deg)`;
  return svg;
}

// At 34px wide a dash is noise. An empty cell reads as "no data" on sight, and
// a dry hour reads better blank than as a row of 0.0.
function cellText(row, value) {
  if (value === null) return '';
  if (row.key === 'rain' && value < 0.05) return '';
  if (row.kind === 'score') return String(Math.round(value));
  const text = value.toFixed(row.digits ?? 0);
  // comfort prints as .90: the leading zero is a wasted character in a 34px
  // column, and every comfort value is below 1 anyway.
  return row.digits === 2 && text.startsWith('0.') ? text.slice(1) : text;
}

function buildCell(row, cell, tideExtreme) {
  const td = document.createElement('td');
  td.className = 'cell';
  if (row.ramp) td.classList.add(`ramp-${row.ramp}`);
  if (row.kind === 'score') td.classList.add('ramp-score');
  if (cell.band !== null) td.dataset.band = String(cell.band);

  if (row.kind === 'arrow' && cell.value !== null) {
    td.appendChild(arrow(cell.value));
    td.title = `${row.label} ${Math.round(cell.value)}°`;
  } else {
    const text = cellText(row, cell.value);
    td.textContent = text;
    if (text) td.title = `${row.label} ${text}`;
  }

  // The turning point belongs on the tide row, beside the height it turns at.
  if (row.key === 'tide' && tideExtreme) {
    td.appendChild(el('span', 'tide-mark', tideExtreme));
    td.classList.add('has-extreme');
  }

  // Colour alone cannot carry this: the hatch means "the models disagree", and
  // a screen reader has to be told so in words.
  if (cell.agree === false) {
    td.classList.add('disputed');
    td.appendChild(el('span', 'sr-only', ' (models disagree)'));
  }

  return td;
}

// Mirrors the two header rows of every day table so the label column and the
// grids stay aligned. Heights come from CSS, not from measurement.
function labelColumn(rows) {
  const column = el('div', 'ftable-labels');
  column.appendChild(el('div', 'ftable-corner'));
  column.appendChild(el('div', 'ftable-corner is-hours'));
  for (const row of rows) {
    column.appendChild(el('div', `ftable-rowlabel${row.kind === 'score' ? ' is-score' : ''}`, row.label));
  }
  return column;
}

function dayTable(day, rows, { open, openSlot, onSlot }) {
  const table = el('table', 'ftable-day');
  table.dataset.dayKey = day.key;
  table.tabIndex = 0;
  table.setAttribute('aria-label', `Forecast for ${day.label}`);

  const head = el('thead');

  const dayRow = el('tr', 'ftable-dayrow');
  const th = el('th', 'ftable-dayhead', day.label);
  th.colSpan = day.columns.length;
  th.scope = 'colgroup';
  dayRow.appendChild(th);
  head.appendChild(dayRow);

  // Without this row the grid is unreadable: you can see that the wind drops
  // but not when.
  const hourRow = el('tr', 'ftable-hourrow');
  for (const column of day.columns) {
    const cell = el('th', 'ftable-hour', hhmm(column.time).slice(0, 2));
    cell.scope = 'col';
    hourRow.appendChild(cell);
  }
  head.appendChild(hourRow);
  table.appendChild(head);

  const body = el('tbody');
  for (const row of rows) {
    const tr = el('tr');
    tr.dataset.row = row.key;
    for (const column of day.columns) {
      const td = buildCell(row, column.cells[row.key], column.tideExtreme);
      if (open && column.slotIndex === openSlot) td.classList.add('col-open');
      tr.appendChild(td);
    }
    body.appendChild(tr);
  }
  table.appendChild(body);

  // One delegated listener. 13 rows x 8 columns x 7 days is 728 cells, and
  // binding each of them would be waste for a single piece of state.
  const toggle = (index) => onSlot(day.key, open && index === openSlot ? null : index);

  table.addEventListener('click', (event) => {
    const td = event.target.closest('td');
    if (td && table.contains(td)) toggle(td.cellIndex);
  });

  // The table is one tab stop; the arrows walk the columns inside it. Without
  // this the whole view is mouse-only.
  let focused = open && openSlot !== null ? openSlot : 0;
  table.addEventListener('keydown', (event) => {
    const last = day.columns.length - 1;
    if (event.key === 'ArrowRight') focused = Math.min(last, focused + 1);
    else if (event.key === 'ArrowLeft') focused = Math.max(0, focused - 1);
    else if (event.key === 'Enter' || event.key === ' ') toggle(focused);
    else return;
    event.preventDefault();
    for (const td of table.querySelectorAll('td.col-focus')) td.classList.remove('col-focus');
    for (const tr of body.rows) tr.cells[focused]?.classList.add('col-focus');
  });

  return table;
}

export function renderTable(target, model, now = new Date(), {
  openKey = null, openSlot = null, onSlot = () => {},
} = {}) {
  // This runs again on every tap. Without carrying the scroll position across,
  // opening a column on Thursday would throw you back to Monday.
  const previous = target.querySelector('.ftable-scroll');
  const scrollLeft = previous ? previous.scrollLeft : null;

  target.replaceChildren();

  const strip = el('div', 'ftable-scroll');
  strip.appendChild(labelColumn(model.rows));

  let todayTable = null;
  for (const day of model.days) {
    const open = day.key === openKey;
    const table = dayTable(day, model.rows, { open, openSlot, onSlot });
    if (!todayTable && day.label === 'Today') todayTable = table;
    strip.appendChild(table);
  }
  target.appendChild(strip);

  // Full width, below the strip rather than inside it: a panel inside a
  // snapping 340px column would be both cramped and horizontally scrollable.
  const day = model.days.find((d) => d.key === openKey);
  const column = day && openSlot !== null ? day.columns[openSlot] : null;
  if (column) {
    const wrap = el('div', 'ftable-detail');
    const end = new Date(column.time.getTime() + column.slot.hours.length * 3600000);
    wrap.setAttribute('aria-label', `${day.label} ${timeRange(column.time, end)}`);
    wrap.appendChild(renderSlotDetail(column.slot));
    target.appendChild(wrap);
  }

  if (scrollLeft !== null) {
    strip.scrollLeft = scrollLeft;
  } else if (todayTable) {
    // Instant, not smooth: an animated scroll on first paint reads as a glitch.
    todayTable.scrollIntoView({ inline: 'start', block: 'nearest', behavior: 'auto' });
  }
}
