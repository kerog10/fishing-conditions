// Whether the map disclosure starts open. No DOM here, matching js/tabs.js:
// this owns the answer, the view owns the element.

const KEY = 'fc:map-open';

export function initialMapOpen(stored, spotCount) {
  // Nothing saved means nothing to show in the hero, so the map has to be
  // the thing on screen regardless of what was remembered last time.
  if (!spotCount) return true;
  return stored === 'open';
}

export function readMapOpen(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(KEY) ?? null;
  } catch {
    return null;
  }
}

export function rememberMapOpen(open, storage = globalThis.localStorage) {
  try {
    storage?.setItem(KEY, open ? 'open' : 'closed');
  } catch {
    // Storage full or blocked. Costs the memory of a preference, nothing more.
  }
}
