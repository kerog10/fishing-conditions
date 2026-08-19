import { compass, scoreBand, timeRange, dayLabel, relativeAge, hhmm } from './format.js';

const VERDICTS = {
  excellent: 'Go now.',
  good: 'Worth a cast.',
  fair: 'Marginal.',
  poor: 'Not today.',
};

const BANDS = ['band-excellent', 'band-good', 'band-fair', 'band-poor'];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function metricsLine(hour) {
  const bits = [];
  if (Number.isFinite(hour.windSpeed)) {
    bits.push(`${Math.round(hour.windSpeed)} km/h ${compass(hour.windDirection)}`.trim());
  }
  if (Number.isFinite(hour.swellHeight)) {
    const period = Number.isFinite(hour.swellPeriod) ? ` @ ${Math.round(hour.swellPeriod)}s` : '';
    bits.push(`${hour.swellHeight.toFixed(1)} m swell${period}`);
  }
  if (Number.isFinite(hour.pressure)) bits.push(`${Math.round(hour.pressure)} hPa`);
  return bits.join(' · ');
}

export function setStatus(target, message, isError = false) {
  target.textContent = message ?? '';
  target.classList.toggle('error', Boolean(isError));
}

function currentIndex(hours, now) {
  let best = 0;
  let bestGap = Infinity;
  hours.forEach((h, i) => {
    const gap = Math.abs(h.time - now);
    if (gap < bestGap) { bestGap = gap; best = i; }
  });
  return best;
}

export function renderNow(target, hours, now = new Date()) {
  target.replaceChildren();
  target.classList.remove(...BANDS);
  if (!hours.length) return;

  const i = currentIndex(hours, now);
  const hour = hours[i];
  const band = scoreBand(hour.final);
  target.classList.add(`band-${band}`);

  const verdict = el('div', 'now-verdict');
  verdict.appendChild(el('span', 'now-score', String(hour.final)));

  const detail = el('div');
  detail.appendChild(el('div', null, VERDICTS[band]));
  detail.appendChild(el('div', 'metrics', metricsLine(hour)));
  verdict.appendChild(detail);
  target.appendChild(verdict);

  const strip = el('div', 'strip');
  for (const h of hours.slice(i, i + 12)) {
    const cell = el('span', `bg-${scoreBand(h.final)}`);
    cell.title = `${hhmm(h.time)} — ${h.final}`;
    strip.appendChild(cell);
  }
  target.appendChild(strip);
}

export function renderWindows(target, windows, now = new Date()) {
  target.replaceChildren();

  if (!windows.length) {
    target.appendChild(el('p', 'status', 'No windows above the threshold in the next 7 days.'));
    return;
  }

  for (const w of windows) {
    const band = scoreBand(w.meanFinal);
    const card = el('article', `window band-${band}`);

    const head = el('header');
    head.appendChild(el('span', 'when', `${dayLabel(w.start, now)} ${timeRange(w.start, w.end)}`));
    head.appendChild(el('span', 'score', String(w.meanFinal)));
    card.appendChild(head);

    if (w.minComfort < 0.6) {
      card.appendChild(el('p', 'capped',
        `Bite ${w.meanBite}, capped to ${w.meanFinal} by conditions.`));
    }

    const reasons = el('ul', 'reasons');
    for (const r of w.reasons.slice(0, 5)) reasons.appendChild(el('li', null, r));
    card.appendChild(reasons);

    card.appendChild(el('p', 'metrics', metricsLine(w.hours[0])));
    target.appendChild(card);
  }
}

export function renderSpotResults(target, results, onPick) {
  target.replaceChildren();
  target.hidden = results.length === 0;

  for (const r of results) {
    const item = el('li');
    const label = [r.name, r.admin, r.country].filter(Boolean).join(', ');
    const button = el('button', null, label);
    button.type = 'button';
    button.addEventListener('click', () => {
      target.hidden = true;
      onPick(r);
    });
    item.appendChild(button);
    target.appendChild(item);
  }
}

export function ageNotice(ageMs) {
  return `Offline — showing cached forecast from ${relativeAge(ageMs)}.`;
}
