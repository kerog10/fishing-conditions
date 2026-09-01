// Place and species matching for the feed builder. Pure: no network, no fs.
// tools/build-feeds.mjs reads data/gazetteer.json and passes it in.
//
// Everything here matches against a curated list and never discovers names
// from prose. Measured 2026-08-31, the most frequent capitalised phrases in
// five Kingfisher reports included Foton, Spotify, Apple Pods, a podcast
// host's name and "Foot and Mouth Disease" -- 117 candidates, the large
// majority worthless. Discovery would produce confident wrong pins.

const REGIONS = ['north', 'central', 'south'];

// The KZN coastal strip. Coordinates are hand-supplied, so this is a sanity
// check on typing, not a geocoder: a transposed pair or a dropped minus sign
// lands far outside it and is caught here rather than rendering a pin in the
// wrong hemisphere.
//
// Geocoding was measured and rejected on 2026-09-01: of 56 marks, Nominatim
// resolved 3 to a real shore feature, 37 to inland town centroids, 9 to the
// wrong feature entirely (La Mercy -> King Shaka Airport, The Bluff -> a
// hang-gliding site) and 7 not at all -- the 7 being the named fishing marks
// rather than the towns.
export const KZN_BOX = { minLat: -31.2, maxLat: -28.8, minLon: 30.0, maxLon: 32.9 };

// Both halves or neither: a lone latitude cannot place a pin.
function coordsOf(mark) {
  const lat = Number(mark.lat);
  const lon = Number(mark.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { lat: null, lon: null };
  const inBox = lat >= KZN_BOX.minLat && lat <= KZN_BOX.maxLat
    && lon >= KZN_BOX.minLon && lon <= KZN_BOX.maxLon;
  return inBox ? { lat, lon } : { lat: null, lon: null };
}

export function loadGazetteer(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!Array.isArray(raw.marks) || !raw.marks.length) return null;

  const marks = raw.marks.filter(
    (m) => m && typeof m.name === 'string' && REGIONS.includes(m.region),
  ).map((m) => ({
    name: m.name,
    region: m.region,
    aliases: Array.isArray(m.aliases) ? m.aliases.filter((a) => typeof a === 'string') : [],
    ...coordsOf(m),
  }));
  if (!marks.length) return null;

  const species = Array.isArray(raw.species)
    ? raw.species.filter((s) => s && typeof s.name === 'string').map((s) => ({
      name: s.name,
      aliases: Array.isArray(s.aliases) ? s.aliases.filter((a) => typeof a === 'string') : [],
    }))
    : [];

  return {
    regions: raw.regions ?? {},
    regionTerms: Array.isArray(raw.regionTerms) ? raw.regionTerms : [],
    marks,
    species,
  };
}

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…',
  rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—',
};

function decode(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

// Hashtags are the single biggest source of false positives. Measured: of 19
// "Durban" occurrences across the stored videos, 17 were inside hashtag
// blocks like "#Durban #KZNFishing #Angler". Strip them and the noise goes.
export function cleanText(s) {
  if (typeof s !== 'string') return '';
  return decode(s)
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\S+@\S+\.\S+/g, ' ')
    .replace(/#[\p{L}\p{N}_]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Regex-special characters in a gazetteer entry would otherwise change the
// pattern's meaning -- "Anstey's Beach" and "Vetch's Pier" both carry one.
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Word boundaries only, so "Toti" cannot fire inside "Amanzimtoti".
function mentions(text, term) {
  return new RegExp(String.raw`\b${escapeRe(term)}\b`, 'i').test(text);
}

function matchesAny(text, entry) {
  return [entry.name, ...entry.aliases].some((term) => mentions(text, term));
}

export function findMarks(gz, { title = '', body = '' } = {}) {
  if (!gz) return [];
  const cleanTitle = cleanText(title);
  const cleanBody = cleanText(body);

  const found = [];
  for (const mark of gz.marks) {
    // Title first: a title says what the video is about, a description says
    // what the channel is about. The stronger position wins and the mark is
    // recorded once.
    if (matchesAny(cleanTitle, mark)) {
      found.push({
        name: mark.name, region: mark.region, where: 'title',
        lat: mark.lat, lon: mark.lon,
      });
    } else if (matchesAny(cleanBody, mark)) {
      found.push({
        name: mark.name, region: mark.region, where: 'body',
        lat: mark.lat, lon: mark.lon,
      });
    }
  }
  return found;
}

export function findSpecies(gz, text) {
  if (!gz) return [];
  const clean = cleanText(text);
  const names = gz.species
    .filter((s) => matchesAny(clean, s))
    .map((s) => s.name);
  return [...new Set(names)].sort();
}

// A region is coarser than a mark and is allowed to come from a region term.
// It is never enough to rank a hotspot -- only marks do that.
export function findRegion(gz, text) {
  if (!gz) return null;
  const clean = cleanText(text);

  for (const mark of gz.marks) {
    if (matchesAny(clean, mark)) return mark.region;
  }
  for (const [key, label] of Object.entries(gz.regions)) {
    if (mentions(clean, label)) return key;
  }
  // "Durban" is a region term, not a mark, so it lands here and can colour a
  // region without ever producing a hotspot row.
  if (mentions(clean, 'Durban')) return 'central';
  return null;
}

// Headings and boilerplate openings that end a coast section. The reports
// carry other sections after the coast ones -- Deep Sea and Estuary are about
// different water entirely -- and close with a fixed promotional block.
// Species found past either belong to neither this coast nor any coast.
const SECTION_ENDS = [
  'Deep Sea', 'Estuary', 'Fly Fishing', 'Bass', 'Freshwater', 'Angler News',
  'Go to The Kingfisher', 'Please send any info', 'Previous', 'Podcast',
];

function endOfSection(clean, start, limit) {
  let end = limit;
  for (const term of SECTION_ENDS) {
    const at = clean.slice(start + 1, limit).search(
      new RegExp(String.raw`\b${escapeRe(term)}\b`, 'i'),
    );
    // +1 offsets the slice above, which skips the section's own heading.
    if (at >= 0) end = Math.min(end, start + 1 + at);
  }
  return end;
}

// The Kingfisher reports are written per coast section. Measured across five
// live reports, the headings are present in essentially every one and the
// body splits cleanly on them.
export function splitRegions(gz, body) {
  if (!gz) return {};
  const clean = cleanText(body);

  const marks = Object.entries(gz.regions)
    .map(([key, label]) => ({
      key,
      label,
      at: clean.search(new RegExp(String.raw`\b${escapeRe(label)}\b`, 'i')),
    }))
    .filter((m) => m.at >= 0)
    .sort((a, b) => a.at - b.at);
  if (!marks.length) return {};

  const out = {};
  for (let i = 0; i < marks.length; i += 1) {
    const start = marks[i].at;
    const nextRegion = i + 1 < marks.length ? marks[i + 1].at : clean.length;
    // The last coast section would otherwise run to the end of the document
    // and swallow everything after it. Measured on a real report: North Coast
    // 80 words, Central 73, South 1272 -- the difference was the Deep Sea
    // section plus the podcast and Facebook boilerplate, which handed the
    // South Coast offshore species (Tuna, Snoek, Couta) it never mentioned.
    out[marks[i].key] = {
      species: findSpecies(gz, clean.slice(start, endOfSection(clean, start, nextRegion))),
    };
  }
  return out;
}

// Everything capitalised that the gazetteer did not recognise. Logged by the
// build so the gazetteer grows from evidence rather than guesswork.
const CANDIDATE = /\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){0,2})\b/g;

export function unmatchedPhrases(gz, text) {
  if (!gz) return [];
  const clean = cleanText(text);

  const known = new Set();
  for (const m of gz.marks) for (const t of [m.name, ...m.aliases]) known.add(t.toLowerCase());
  for (const s of gz.species) for (const t of [s.name, ...s.aliases]) known.add(t.toLowerCase());
  for (const t of gz.regionTerms) known.add(t.toLowerCase());

  const counts = new Map();
  for (const match of clean.matchAll(CANDIDATE)) {
    const phrase = match[1];
    const key = phrase.toLowerCase();
    if (known.has(key)) continue;
    // A phrase whose first word is already known is usually a known term with
    // a suffix ("Umkomaas Beach"), not a new place.
    if (known.has(key.split(' ')[0])) continue;
    counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([phrase, count]) => ({ phrase, count }))
    .sort((a, b) => b.count - a.count);
}

// Marks that earned a place in the data but cannot be pinned. The gazetteer
// grows by evidence: a mark gets a coordinate when it first shows up, not
// before, so this is the prompt to add one.
export function marksWithoutCoords(gz, entries) {
  if (!gz) return [];
  const counts = new Map();
  for (const entry of entries) {
    for (const mark of entry.marks ?? []) {
      if (mark.lat !== null && mark.lat !== undefined) continue;
      counts.set(mark.name, (counts.get(mark.name) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
