// The Learn tab. DOM only -- js/learn-content.js decides what is shown.

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function diagram(entry) {
  const node = el('div', 'guide-diagram');
  node.setAttribute('role', 'img');
  node.setAttribute('aria-label', entry.svgAlt);
  // Author-written constant from learn-content.js, never interpolated and
  // never fetched. test/learn-content.test.mjs holds that invariant.
  node.innerHTML = entry.svg;
  node.firstElementChild?.setAttribute('aria-hidden', 'true');
  return node;
}

function card(entry) {
  const article = el('article', 'guide-card');
  article.appendChild(el('h3', 'guide-title', entry.title));
  article.appendChild(el('p', 'guide-blurb', entry.blurb));
  article.appendChild(diagram(entry));

  // Knots are a sequence you follow in order; water cues are a set of things
  // to look for, in no particular order. The markup should say which.
  const list = el(entry.section === 'knots' ? 'ol' : 'ul', 'guide-steps');
  for (const step of entry.steps) list.appendChild(el('li', 'guide-step', step));
  article.appendChild(list);

  if (entry.note) {
    article.appendChild(el('p', `guide-note guide-note-${entry.note.kind}`, entry.note.text));
  }
  return article;
}

export function renderLearn(target, entries, sections) {
  target.replaceChildren();

  for (const section of sections) {
    const inSection = entries.filter((e) => e.section === section.key);
    if (!inSection.length) continue;

    target.appendChild(el('h2', 'guide-section', section.title));
    for (const entry of inSection) target.appendChild(card(entry));
  }
}
