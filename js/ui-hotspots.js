// The Hotspots list. DOM only -- js/hotspots.js decides what is shown.
import { dayLabel } from './format.js';

const REGION_LABELS = {
  north: 'North Coast',
  central: 'Central Coast',
  south: 'South Coast',
};

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function isHttpUrl(value) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function link(className, text, href) {
  const node = el('a', className, text);
  node.href = href;
  node.target = '_blank';
  node.rel = 'noopener noreferrer';
  return node;
}

// A pin tap scrolls to the row rather than opening a popup: the row already
// carries the videos, the species and the regional line, and duplicating that
// in a Leaflet popup would mean two places to maintain and two to get wrong.
export const hotspotRowId = (name) => `hotspot-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

export function renderHotspots(target, hotspots, now = new Date()) {
  target.replaceChildren();

  const rows = Array.isArray(hotspots) ? hotspots.filter((h) => h && h.name) : [];
  target.hidden = rows.length === 0;
  if (!rows.length) return;

  target.appendChild(el('h2', 'hotspots-heading', 'Hotspots'));

  const list = el('ul', 'hotspot-list');
  for (const spot of rows) {
    const item = el('li', 'hotspot-row');
    item.id = hotspotRowId(spot.name);

    const head = el('div', 'hotspot-head');
    head.appendChild(el('span', 'hotspot-name', spot.name));
    // "1 video", not "1 videos".
    head.appendChild(el('span', 'hotspot-count', `${spot.count} video${spot.count === 1 ? '' : 's'}`));
    item.appendChild(head);

    if (spot.species.length) {
      item.appendChild(el('p', 'hotspot-species', spot.species.join(', ')));
    }

    const videos = spot.videos.filter((v) => v && isHttpUrl(v.link));
    if (videos.length) {
      const sub = el('ul', 'hotspot-videos');
      for (const video of videos) {
        const row = el('li', 'hotspot-video');
        row.appendChild(link('hotspot-video-link', video.title, video.link));
        row.appendChild(el('span', 'hotspot-video-date', dayLabel(new Date(video.date), now)));
        sub.appendChild(row);
      }
      item.appendChild(sub);
    }

    // Region-level context, always attributed and always linked. Kingfisher
    // writes about stretches of coast, never about this specific mark, and
    // the wording must not blur that.
    if (spot.report && spot.report.species.length && isHttpUrl(spot.report.link)) {
      const label = REGION_LABELS[spot.region] ?? 'this coast';
      const note = el('p', 'hotspot-report');
      note.appendChild(el('span', null, `${label}, per Kingfisher: ${spot.report.species.join(', ')} `));
      note.appendChild(link('hotspot-report-link', 'report', spot.report.link));
      item.appendChild(note);
    }

    list.appendChild(item);
  }
  target.appendChild(list);
}
