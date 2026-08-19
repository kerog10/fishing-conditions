// Type-ahead for the place search. Every keystroke could be a request, which
// on a phone at the beach is both slow and rude to a free public API, so this
// sits between the input box and the geocoder: it waits for a pause, drops
// stale answers, and remembers terms it has already looked up.
//
// Timers are injected so the debounce can be tested without waiting on a real
// clock.
export function createSuggester({
  search,
  onResults,
  onError = () => {},
  delayMs = 250,
  minChars = 3,
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
}) {
  const memo = new Map();
  let timer = null;
  // Bumped on every query. A response whose token is no longer current belongs
  // to a term the user has already typed past, so it is discarded rather than
  // painted over what they are looking at now.
  let token = 0;

  function cancel() {
    if (timer !== null) clearTimer(timer);
    timer = null;
    token += 1;
  }

  async function run(term, mine) {
    try {
      const results = await search(term);
      if (mine !== token) return;
      memo.set(term, results);
      onResults(results, term);
    } catch (err) {
      if (mine !== token) return;
      // Deliberately not clearing the list: losing signal mid-type should not
      // snatch away suggestions that are still perfectly usable.
      onError(err);
    }
  }

  function query(raw) {
    const term = String(raw ?? '').trim();
    cancel();
    const mine = token;

    if (term.length < minChars) {
      onResults([], term);
      return;
    }

    if (memo.has(term)) {
      onResults(memo.get(term), term);
      return;
    }

    timer = setTimer(() => {
      timer = null;
      run(term, mine);
    }, delayMs);
  }

  return { query, cancel };
}
