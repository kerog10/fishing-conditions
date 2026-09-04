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
]);
