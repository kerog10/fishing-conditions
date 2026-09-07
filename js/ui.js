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

// Still used by renderWindows. The hero builds its own metric grid instead,
// but the window cards want this one-line form.
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

export function setStatus(target, message, isError = false, isLoading = false) {
  target.textContent = message ?? '';
  target.classList.toggle('error', Boolean(isError));
  target.classList.toggle('loading', Boolean(isLoading));
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

const DASH = '—';

function metric(label, value) {
  const cell = el('div', 'metric');
  cell.appendChild(el('span', 'metric-key', label));
  cell.appendChild(el('span', 'metric-value', value));
  return cell;
}

function emptyHero(onPickSpot) {
  const empty = el('div', 'hero-empty');
  empty.appendChild(el('p', 'hero-empty-text', 'Pick a spot to see conditions.'));
  const button = el('button', 'hero-empty-action', 'Open the map');
  button.type = 'button';
  if (onPickSpot) button.addEventListener('click', onPickSpot);
  empty.appendChild(button);
  return empty;
}

// The answer the app exists to give, rendered large. Everything here comes
// from summariseSpot; there is deliberately no second computation path.
export function renderHero(target, summary, { onPickSpot, now = new Date() } = {}) {
  target.replaceChildren();
  target.classList.remove(...BANDS);

  if (!summary || summary.score === null || summary.score === undefined) {
    target.appendChild(emptyHero(onPickSpot));
    return;
  }

  const band = scoreBand(summary.score);
  target.classList.add(`band-${band}`);

  const verdict = el('div', 'hero-verdict');
  verdict.appendChild(el('span', 'hero-score', String(summary.score)));
  verdict.appendChild(el('span', 'hero-word', VERDICTS[band]));
  if (summary.nextWindow) {
    verdict.appendChild(el(
      'span',
      'hero-when',
      `${dayLabel(summary.nextWindow.start, now)} ${timeRange(summary.nextWindow.start, summary.nextWindow.end)}`,
    ));
  }
  target.appendChild(verdict);

  const grid = el('div', 'hero-metrics');
  grid.appendChild(metric(
    'Wind',
    Number.isFinite(summary.wind.speed)
      ? `${Math.round(summary.wind.speed)} km/h ${compass(summary.wind.direction)}`.trim()
      : DASH,
  ));
  grid.appendChild(metric('Tide', summary.tide.state ?? DASH));
  grid.appendChild(metric(
    'Swell',
    Number.isFinite(summary.swell.height) ? `${summary.swell.height.toFixed(1)} m` : DASH,
  ));
  grid.appendChild(metric(
    'Next turn',
    summary.tide.nextTurn ? `${summary.tide.nextTurn.type} ${hhmm(summary.tide.nextTurn.time)}` : DASH,
  ));
  target.appendChild(grid);
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

export function renderSpotResults(target, results, onPick, { activeIndex = -1 } = {}) {
  target.replaceChildren();
  target.hidden = results.length === 0;

  results.forEach((r, i) => {
    const item = el('li');
    const label = [r.name, r.admin, r.country].filter(Boolean).join(', ');
    const button = el('button', i === activeIndex ? 'active' : null, label);
    button.type = 'button';
    button.id = `suggest-${i}`;
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', String(i === activeIndex));
    // pointerdown, not click: the input loses focus first, and the focusout
    // handler hides this list before a click would ever land.
    button.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      target.hidden = true;
      onPick(r);
    });
    item.appendChild(button);
    target.appendChild(item);
  });
}

// Moves the highlight without rebuilding the list, so the arrow keys stay
// responsive while a look-up is still in flight.
export function highlightResult(target, index) {
  const buttons = [...target.querySelectorAll('button')];
  buttons.forEach((b, i) => {
    b.classList.toggle('active', i === index);
    b.setAttribute('aria-selected', String(i === index));
  });
  buttons[index]?.scrollIntoView({ block: 'nearest' });
  return buttons[index] ? `suggest-${index}` : '';
}

export function ageNotice(ageMs) {
  return `Offline — showing cached forecast from ${relativeAge(ageMs)}.`;
}
