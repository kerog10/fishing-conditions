import { scoreBand, dayLabel } from './format.js';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export function renderSpotChips(target, spots, activeId, { onSelect, onRemove }) {
  target.replaceChildren();

  for (const spot of spots) {
    const chip = el('span', `chip${spot.id === activeId ? ' chip-active' : ''}`);

    const pick = el('button', 'chip-name', spot.name);
    pick.type = 'button';
    pick.addEventListener('click', () => onSelect(spot.id));
    chip.appendChild(pick);

    const drop = el('button', 'chip-remove', '×');
    drop.type = 'button';
    drop.title = `Remove ${spot.name}`;
    drop.setAttribute('aria-label', `Remove ${spot.name}`);
    drop.addEventListener('click', () => onRemove(spot.id));
    chip.appendChild(drop);

    target.appendChild(chip);
  }
}

// The bar that appears when you tap the map. Tapping is cheap and easy to do by
// accident, so a tap only previews the spot; it joins the comparison when you
// say so.
export function renderPreview(target, preview, { onAdd } = {}) {
  target.replaceChildren();
  target.hidden = !preview;
  if (!preview) return;

  const row = el('div', 'preview-row');
  row.appendChild(el('span', 'preview-name', preview.name));
  if (Number.isFinite(preview.score)) {
    row.appendChild(el('span', `preview-score band-${scoreBand(preview.score)}`, String(preview.score)));
  }

  if (preview.canAdd) {
    const add = el('button', 'add-spot', '+ Add to compare');
    add.type = 'button';
    add.addEventListener('click', onAdd);
    row.appendChild(add);
  } else if (preview.reason) {
    row.appendChild(el('span', 'preview-reason', preview.reason));
  }

  target.appendChild(row);
}

export function renderCompare(target, comparison, now = new Date(), { onCell }) {
  target.replaceChildren();
  if (!comparison.rows.length) return;

  const table = el('table', 'grid compare');

  const headRow = el('tr');
  headRow.appendChild(el('th', 'row-label', ''));
  for (const date of comparison.dates) {
    headRow.appendChild(el('th', null, date ? dayLabel(date, now).slice(0, 3) : '?'));
  }
  const head = el('thead');
  head.appendChild(headRow);
  table.appendChild(head);

  const body = el('tbody');
  for (const row of comparison.rows) {
    const tr = el('tr');
    tr.appendChild(el('th', 'row-label', row.spot.name));
    for (const cell of row.cells) {
      const td = el('td');
      if (cell.score === null) {
        td.textContent = '–';
      } else {
        const button = el('button', `cell bg-${scoreBand(cell.score)}`, String(cell.score));
        button.type = 'button';
        button.addEventListener('click', () => onCell(row.spot.id, cell.dayKey));
        td.appendChild(button);
      }
      tr.appendChild(td);
    }
    body.appendChild(tr);
  }
  table.appendChild(body);

  const scroller = el('div', 'grid-scroll');
  scroller.appendChild(table);
  target.appendChild(scroller);

  if (comparison.best) {
    const when = comparison.best.date ? dayLabel(comparison.best.date, now) : '';
    target.appendChild(el('p', 'best-line',
      `Best this week: ${comparison.best.spotName}, ${when} — ${comparison.best.score}`));
  }
}
