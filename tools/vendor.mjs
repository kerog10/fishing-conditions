// Downloads third-party libraries into vendor/. Run once: npm run vendor
import { mkdir, writeFile } from 'node:fs/promises';

const SUNCALC = 'https://unpkg.com/suncalc@1.9.0/suncalc.js';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_IMAGES = ['marker-icon.png', 'marker-icon-2x.png', 'marker-shadow.png'];

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res;
}

async function main() {
  await mkdir('vendor/images', { recursive: true });

  const suncalc = await (await get(SUNCALC)).text();
  const shimmed = [
    '// Vendored from suncalc@1.9.0 (BSD-2-Clause). ESM shim added.',
    'const exports = {};',
    'const module = { exports };',
    suncalc,
    'export default module.exports;',
    '',
  ].join('\n');
  await writeFile('vendor/suncalc.mjs', shimmed, 'utf8');

  await writeFile('vendor/leaflet.js', await (await get(LEAFLET_JS)).text(), 'utf8');

  // Leaflet's CSS references images at ./images/*, which matches our layout.
  await writeFile('vendor/leaflet.css', await (await get(LEAFLET_CSS)).text(), 'utf8');

  for (const name of LEAFLET_IMAGES) {
    const res = await get(`https://unpkg.com/leaflet@1.9.4/dist/images/${name}`);
    await writeFile(`vendor/images/${name}`, Buffer.from(await res.arrayBuffer()));
  }

  console.log('vendored: suncalc.mjs, leaflet.js, leaflet.css, images/');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
