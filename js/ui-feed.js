// The Kingfisher report card. DOM only -- js/feed.js decides whether there is
// anything to show.
import { dayLabel } from './format.js';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export function renderFeedCard(target, entry, now = new Date()) {
  target.replaceChildren();
  // No feed, a stale one, or a broken one: the section simply is not there.
  target.hidden = !entry;
  if (!entry) return;

  const card = el('article', 'feed-card');

  const head = el('div', 'feed-head');
  head.appendChild(el('span', 'feed-source', 'Kingfisher report'));
  head.appendChild(el('span', 'feed-date', dayLabel(new Date(entry.date), now)));
  card.appendChild(head);

  card.appendChild(el('h3', 'feed-title', entry.title));
  card.appendChild(el('p', 'feed-excerpt', entry.excerpt));

  // The excerpt is capped at 50 words; the link is how the report is actually
  // read, and it is Kingfisher's to serve.
  const link = el('a', 'feed-link', 'Read the full report on kingfisher.co.za');
  link.href = entry.link;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  card.appendChild(link);

  target.appendChild(card);
}
