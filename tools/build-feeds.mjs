// Builds data/feeds/*.json. Run by .github/workflows/feeds.yml on a daily
// cron, and by `npm run feeds` locally.
//
// This is the only place in the feed pipeline that touches the network or the
// filesystem. Source modules under tools/feeds/ are pure: they describe the
// requests they want and interpret the results they are handed.
//
// This never exits non-zero on a fetch failure. A cron that goes red every
// time a website hiccups is a cron you stop reading.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import * as kingfisher from './feeds/kingfisher.mjs';
import * as youtube from './feeds/youtube.mjs';

const SOURCES = [kingfisher, youtube];

// Some sites serve differently, or not at all, without one.
const UA = 'Mozilla/5.0 (compatible; fishing-conditions feed builder)';

// A source that keeps asking for more rounds is broken, not thorough.
const MAX_ROUNDS = 3;

async function fetchAll(requests) {
  const results = [];
  // Sequential on purpose: these are other people's servers, and a daily job
  // has no reason to burst.
  for (const request of requests) {
    try {
      const res = await fetch(request.url, { headers: { 'user-agent': UA } });
      const body = res.ok
        ? await (request.type === 'json' ? res.json() : res.text())
        : null;
      results.push({ ...request, ok: res.ok, status: res.status, body });
    } catch (err) {
      // A DNS failure, a reset, or a malformed JSON body all reach the source
      // as an unsuccessful result rather than as a thrown error.
      console.error(`fetch failed for ${request.url}: ${err.message}`);
      results.push({ ...request, ok: false, status: 0, body: null });
    }
  }
  return results;
}

async function readExisting(out) {
  try {
    const parsed = JSON.parse(await readFile(out, 'utf8'));
    return Array.isArray(parsed.entries) ? parsed.entries : [];
  } catch {
    // Absent on the first run, and a corrupt file should not stop a rebuild.
    return [];
  }
}

async function runSource(source) {
  const { name, url, out } = source.meta;
  const existing = await readExisting(out);

  const collected = [];
  let requests = source.firstRound(existing);
  for (let round = 0; round < MAX_ROUNDS && requests.length; round += 1) {
    console.log(`${name}: round ${round + 1}, ${requests.length} request(s)`);
    const results = await fetchAll(requests);
    const { entries, next } = source.consume(results, existing);
    collected.push(...entries);
    requests = next ?? [];
  }

  // Nothing new, or nothing that parsed: leave the file exactly as it was, so
  // the workflow's commit guard sees no change.
  if (!collected.length) {
    console.log(`${name}: nothing new, leaving ${out} as it is`);
    return;
  }

  const entries = source.merge(existing, collected);
  if (!entries.length) {
    console.error(`${name}: nothing to write`);
    return;
  }

  await mkdir('data/feeds', { recursive: true });
  // builtAt is when the job ran; each entry's date is when the item was
  // published. Debugging wants the first, the UI wants the second.
  const payload = {
    source: name,
    url,
    builtAt: new Date().toISOString(),
    entries,
  };
  await writeFile(out, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`${name}: wrote ${entries.length} entries to ${out}`);
}

async function main() {
  for (const source of SOURCES) {
    try {
      await runSource(source);
    } catch (err) {
      // One broken source must not stop the others.
      console.error(`${source.meta.name}: failed: ${err.message}`);
    }
  }
}

main().catch((err) => {
  // Even an unexpected throw stays green. Files are left as they were.
  console.error(`build-feeds: unexpected failure: ${err.message}`);
});
