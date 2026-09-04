// Fixed reference content for the Learn tab. No fetch, no state, no DOM --
// the content is the model. Every `svg` here is an author-written constant;
// ui-learn.js assigns it with innerHTML, which is safe only while that stays
// true. test/learn-content.test.mjs enforces it.

export const SECTIONS = Object.freeze([
  { key: 'water', title: 'Reading the water' },
  { key: 'knots', title: 'Knots and traces' },
]);

const RIP_SVG = `<svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid meet">
  <defs>
    <marker id="rip-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
      <path d="M0 0 L10 5 L0 10 z" fill="var(--diagram-accent)"/>
    </marker>
  </defs>
  <rect x="0" y="0" width="320" height="150" fill="var(--diagram-sea)"/>
  <rect x="0" y="150" width="320" height="50" fill="var(--diagram-sand)"/>
  <path d="M0 118 q20 -10 40 0 t40 0 t40 0" stroke="var(--diagram-foam)" stroke-width="3" fill="none"/>
  <path d="M200 118 q20 -10 40 0 t40 0 t40 0" stroke="var(--diagram-foam)" stroke-width="3" fill="none"/>
  <path d="M0 96 q20 -10 40 0 t40 0 t40 0" stroke="var(--diagram-foam)" stroke-width="2" fill="none" opacity="0.7"/>
  <path d="M200 96 q20 -10 40 0 t40 0 t40 0" stroke="var(--diagram-foam)" stroke-width="2" fill="none" opacity="0.7"/>
  <path d="M136 150 L128 40 L192 40 L184 150 z" fill="var(--diagram-sea)" opacity="0.85"/>
  <path d="M160 146 L160 56" stroke="var(--diagram-accent)" stroke-width="3" fill="none" marker-end="url(#rip-arrow)"/>
  <text x="160" y="176" text-anchor="middle" font-size="11" fill="var(--diagram-label)">gap in the breakers</text>
  <text x="52" y="86" text-anchor="middle" font-size="11" fill="var(--diagram-label)">waves break</text>
  <text x="268" y="86" text-anchor="middle" font-size="11" fill="var(--diagram-label)">waves break</text>
  <text x="160" y="32" text-anchor="middle" font-size="11" fill="var(--diagram-label)">water running out</text>
</svg>`;

const GULLY_SVG = `<svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid meet">
  <rect x="0" y="0" width="320" height="200" fill="var(--diagram-sea)" opacity="0.35"/>
  <path d="M0 150 L60 150 L96 104 L224 104 L260 150 L320 150 L320 200 L0 200 z" fill="var(--diagram-sand)"/>
  <path d="M0 74 q16 -9 32 0 t32 0" stroke="var(--diagram-foam)" stroke-width="3" fill="none"/>
  <path d="M256 74 q16 -9 32 0 t32 0" stroke="var(--diagram-foam)" stroke-width="3" fill="none"/>
  <path d="M96 74 L224 74" stroke="var(--diagram-foam)" stroke-width="2" fill="none" opacity="0.5"/>
  <rect x="96" y="74" width="128" height="30" fill="var(--diagram-accent)" opacity="0.25"/>
  <text x="160" y="96" text-anchor="middle" font-size="11" fill="var(--diagram-label)">deep, dark, unbroken</text>
  <text x="34" y="132" text-anchor="middle" font-size="11" fill="var(--diagram-label)">bank</text>
  <text x="288" y="132" text-anchor="middle" font-size="11" fill="var(--diagram-label)">bank</text>
</svg>`;

const SANDBANK_SVG = `<svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid meet">
  <rect x="0" y="0" width="320" height="200" fill="var(--diagram-sea)"/>
  <ellipse cx="160" cy="100" rx="130" ry="56" fill="var(--diagram-sand)"/>
  <path d="M40 70 q30 -12 60 0 t60 0 t60 0 t60 0" stroke="var(--diagram-foam)" stroke-width="3" fill="none"/>
  <path d="M40 100 q30 -12 60 0 t60 0 t60 0 t60 0" stroke="var(--diagram-foam)" stroke-width="3" fill="none"/>
  <path d="M40 130 q30 -12 60 0 t60 0 t60 0 t60 0" stroke="var(--diagram-foam)" stroke-width="3" fill="none"/>
  <path d="M95 149 Q160 163 225 149" stroke="var(--diagram-accent)" stroke-width="3" fill="none"/>
  <text x="160" y="176" text-anchor="middle" font-size="11" fill="var(--diagram-label)">fish the edge</text>
</svg>`;

const SPRING_LOW_SVG = `<svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid meet">
  <rect x="0" y="0" width="320" height="94" fill="var(--diagram-sea)" opacity="0.25"/>
  <path d="M0 74 L60 74 L96 44 L224 44 L260 74 L320 74 L320 94 L0 94 z" fill="var(--diagram-sand)"/>
  <text x="160" y="16" text-anchor="middle" font-size="11" fill="var(--diagram-label)">spring low - the shape is visible</text>
  <rect x="0" y="106" width="320" height="94" fill="var(--diagram-sea)" opacity="0.7"/>
  <path d="M0 176 L60 176 L96 146 L224 146 L260 176 L320 176 L320 200 L0 200 z" fill="var(--diagram-sand)" opacity="0.55"/>
  <path d="M96 44 L224 44" stroke="var(--diagram-foam)" stroke-width="2" fill="none" opacity="0.5"/>
  <text x="160" y="192" text-anchor="middle" font-size="11" fill="var(--diagram-label)">high water - same shape, now hidden</text>
  <path d="M160 60 L160 158" stroke="var(--diagram-accent)" stroke-width="3" stroke-dasharray="4 4" fill="none"/>
</svg>`;

export const LEARN = Object.freeze([
  {
    id: 'rip-currents',
    section: 'water',
    title: 'Rip currents',
    blurb: 'A river of water running back out to sea through a gap in the banks. It drags food off the beach, so fish patrol its edges - and it will drag you too.',
    svg: RIP_SVG,
    svgAlt: 'A beach seen from above. Waves break on banks to the left and right, with a clear gap between them where a channel of water runs seaward.',
    steps: [
      'Look for a gap in the line of breaking waves. Where the water is deep enough, the swell passes over without breaking.',
      'The channel looks darker than the water either side of it, because it is deeper.',
      'Its surface is choppy and rippled while the water beside it is calmer.',
      'Foam, sand-stained water and weed stream steadily seaward down the channel.',
      'Fish the edges where the moving water meets the still, not the middle of the run.',
    ],
    note: {
      kind: 'safety',
      text: 'If a rip takes you, do not swim against it - you will not win. Swim parallel to the beach until you are out of the pull, then come in on the breaking water.',
    },
  },
  {
    id: 'gullies',
    section: 'water',
    title: 'Gullies and trenches',
    blurb: 'A trough of deep water lying between the sandbanks, often within casting distance. Fish use it as a highway and hold in it as the tide drops.',
    svg: GULLY_SVG,
    svgAlt: 'A cross-section of a beach. Waves break over shallow banks on either side of a deeper trough where the water stays unbroken.',
    steps: [
      'Look for a dark green or blue band against the paler water over the sand.',
      'Swell rolls across it without breaking, then breaks on the shallow bank inshore of it.',
      'The surface often looks oily and slick compared to the broken water around it.',
      'Put the bait in the gully or on its edge, not on top of the bank behind it.',
    ],
    note: null,
  },
  {
    id: 'sandbanks',
    section: 'water',
    title: 'Sandbanks',
    blurb: 'The shallow humps of sand that the gullies run between. Bait washes over them and fish come up onto them to feed, mostly on a pushing tide.',
    svg: SANDBANK_SVG,
    svgAlt: 'A beach from above showing a pale shallow bank with waves breaking consistently across it and darker deep water on either side.',
    steps: [
      'Waves break in the same place over a bank, every set, rather than passing through.',
      'The broken water is white and foaming and stays that way.',
      'The water over the bank looks pale brown or sandy against the darker gullies.',
      'At low tide the bank shows as an exposed hump or as water only ankle deep.',
      'Fish the edge where the bank drops into the gully, and fish it as the tide pushes.',
    ],
    note: null,
  },
  {
    id: 'spring-low',
    section: 'water',
    title: 'Map the beach at spring low',
    blurb: 'The single most useful hour you can spend on a new beach. At spring low the banks and gullies are laid bare, and the shape holds for weeks.',
    svg: SPRING_LOW_SVG,
    svgAlt: 'The same stretch of beach at low water, where the bank and gully are exposed, and at high water, where the identical shape is hidden beneath the surface.',
    steps: [
      'Go at the lowest spring tide you can, and walk the stretch you intend to fish.',
      'Note where the gullies run, where the banks sit, and where a channel cuts through.',
      'Photograph it, or mark the gully mouths against something fixed on the shore.',
      'Fish that map on the pushing tide, when the same holes are under water and holding fish.',
      'Re-walk it after a big sea. Heavy swell rearranges banks; a quiet month barely moves them.',
    ],
    note: null,
  },
]);
