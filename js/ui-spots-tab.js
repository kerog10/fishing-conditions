import { scoreBand, compass, hhmm, timeRange } from './format.js';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const n0 = (v) => (Number.isFinite(v) ? String(Math.round(v)) : '–');

function tideLine(tide) {
  if (!tide.state) return 'No tide data here';
  const bits = [tide.state];
  if (Number.isFinite(tide.height)) bits.push(`${tide.height.toFixed(1)} m`);
  if (tide.nextTurn) bits.push(`${tide.nextTurn.type} ${hhmm(tide.nextTurn.time)}`);
  return bits.join(' · ');
}

export function renderSpotsTab(target, cards, { onOpen, onRemove, onClearAll }) {
  target.replaceChildren();

  if (!cards.length) {
    target.appendChild(el('p', 'empty', 'No spots saved yet. Tap the map or search for a place, then add it to compare.'));
    return;
  }

  for (const { spot, summary } of cards) {
    const card = el('article', `spot-card band-${scoreBand(summary.score ?? 0)}`);

    // The whole card opens the spot, so the remove control sits outside the
    // button rather than nested inside it.
    const open = el('button', 'spot-open');
    open.type = 'button';

    const head = el('div', 'spot-head');
    head.appendChild(el('span', 'spot-title', spot.name));
    head.appendChild(el('span', 'score',
      Number.isFinite(summary.score) ? String(summary.score) : '–'));
    open.appendChild(head);

    open.appendChild(el('div', 'spot-line', tideLine(summary.tide)));
    open.appendChild(el('div', 'spot-line',
      `${n0(summary.wind.speed)} km/h ${compass(summary.wind.direction)}`.trim()));
    open.appendChild(el('div', 'spot-line', summary.nextWindow
      ? `next ${timeRange(summary.nextWindow.start, summary.nextWindow.end)} · ${summary.nextWindow.score}`
      : 'no good window in the next 7 days'));

    open.addEventListener('click', () => onOpen(spot.id));
    card.appendChild(open);

    const drop = el('button', 'spot-remove', '×');
    drop.type = 'button';
    drop.title = `Remove ${spot.name}`;
    drop.setAttribute('aria-label', `Remove ${spot.name}`);
    drop.addEventListener('click', () => onRemove(spot.id));
    card.appendChild(drop);

    target.appendChild(card);
  }

  const clear = el('button', 'clear-all', 'Clear all');
  clear.type = 'button';
  clear.title = 'Remove every saved spot and cached forecast';
  clear.addEventListener('click', onClearAll);
  target.appendChild(clear);
}
