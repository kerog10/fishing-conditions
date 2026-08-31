// Builds data/feeds/*.json. Run by .github/workflows/feeds.yml on a daily
// cron, and by `npm run feeds` locally.
//
// This never exits non-zero on a fetch failure. A cron that goes red every
// time a website hiccups is a cron you stop reading.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseEntry, mergeEntries, newPosts } from './feeds/kingfisher.mjs';

const OUT = 'data/feeds/kingfisher.json';
const SITE = 'https://www.kingfisher.co.za/';

// Category 644 is KZN Fishing Reports. per_page=5 is enough to recover if the
// job has been down for a month of weekly reports, and is still one request.
const LIST = 'https://www.kingfisher.co.za/wp-json/wp/v2/posts'
  + '?categories=644&per_page=5&_fields=id,date_gmt,link,title';

// The post pages are served differently without one.
const UA = 'Mozilla/5.0 (compatible; fishing-conditions feed builder)';

async function get(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res;
}

async function readExisting() {
  try {
    const parsed = JSON.parse(await readFile(OUT, 'utf8'));
    return Array.isArray(parsed.entries) ? parsed.entries : [];
  } catch {
    // Absent on the first run, and a corrupt file should not stop a rebuild.
    return [];
  }
}

async function main() {
  const existing = await readExisting();

  let posts;
  try {
    posts = await get(LIST).then((r) => r.json());
  } catch (err) {
    console.error(`kingfisher: list fetch failed, leaving ${OUT} untouched: ${err.message}`);
    return;
  }

  const wanted = newPosts(posts, existing);
  console.log(`kingfisher: ${posts.length} listed, ${wanted.length} not yet stored`);

  const fresh = [];
  for (const post of wanted) {
    try {
      const html = await get(post.link).then((r) => r.text());
      const entry = parseEntry(post, html);
      if (entry) fresh.push(entry);
      else console.error(`kingfisher: no usable text in ${post.link}, skipping`);
    } catch (err) {
      console.error(`kingfisher: ${post.link} failed: ${err.message}`);
    }
  }

  if (!fresh.length && existing.length) {
    console.log('kingfisher: nothing new, leaving the file as it is');
    return;
  }

  const entries = mergeEntries(existing, fresh);
  if (!entries.length) {
    console.error('kingfisher: nothing to write');
    return;
  }

  await mkdir('data/feeds', { recursive: true });
  // builtAt is when the job ran; each entry's date is when the report was
  // published. Debugging wants the first, the card wants the second.
  const payload = {
    source: 'kingfisher',
    url: SITE,
    builtAt: new Date().toISOString(),
    entries,
  };
  await writeFile(OUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`kingfisher: wrote ${entries.length} entries to ${OUT}`);
}

main().catch((err) => {
  // Even an unexpected throw stays green. The file is left as it was.
  console.error(`kingfisher: unexpected failure: ${err.message}`);
});
