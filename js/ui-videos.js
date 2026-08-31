// The recent-videos list. DOM only -- js/videos.js decides what is shown.
import { dayLabel } from './format.js';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

// A row exists to be clicked through to YouTube, so a link that cannot
// safely become an href (a javascript: value, a bare string, anything but
// http/https) drops that row rather than rendering a dead one.
function isHttpUrl(value) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function renderVideoList(target, videos, now = new Date()) {
  target.replaceChildren();

  const rows = Array.isArray(videos) ? videos.filter((v) => v && isHttpUrl(v.link)) : [];
  // No videos, a broken file, or nothing but unsafe links: the section simply
  // is not there.
  target.hidden = rows.length === 0;
  if (!rows.length) return;

  target.appendChild(el('h2', 'videos-heading', 'Recent from local anglers'));

  const list = el('ul', 'video-list');
  for (const video of rows) {
    const item = el('li', 'video-row');

    const head = el('div', 'video-head');
    head.appendChild(el('span', 'video-channel', video.channel));
    head.appendChild(el('span', 'video-date', dayLabel(new Date(video.date), now)));
    item.appendChild(head);

    const link = el('a', 'video-title', video.title);
    link.href = video.link;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    item.appendChild(link);

    list.appendChild(item);
  }
  target.appendChild(list);
}
