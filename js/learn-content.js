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

const UNI_SVG = `<svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid meet">
  <line x1="106.67" y1="8" x2="106.67" y2="192" stroke="var(--diagram-line)" stroke-width="1" opacity="0.25"/>
  <line x1="213.33" y1="8" x2="213.33" y2="192" stroke="var(--diagram-line)" stroke-width="1" opacity="0.25"/>
  <text x="14" y="22" font-size="11" fill="var(--diagram-label)">1</text>
  <text x="121" y="22" font-size="11" fill="var(--diagram-label)">2</text>
  <text x="228" y="22" font-size="11" fill="var(--diagram-label)">3</text>
  <circle cx="26" cy="100" r="7" stroke="var(--diagram-line)" stroke-width="2" fill="none"/>
  <path d="M4 100 L26 100" stroke="var(--diagram-line)" stroke-width="3" fill="none"/>
  <path d="M26 100 L96 88" stroke="var(--diagram-line)" stroke-width="3" fill="none"/>
  <path d="M26 100 L96 112" stroke="var(--diagram-accent)" stroke-width="3" fill="none"/>
  <path d="M116 88 L204 88" stroke="var(--diagram-line)" stroke-width="3" fill="none"/>
  <path d="M116 112 L204 112" stroke="var(--diagram-line)" stroke-width="3" fill="none"/>
  <path d="M204 112 Q204 74 188 74 Q172 74 172 100 Q172 126 156 126 Q140 126 140 100 Q140 74 124 74" stroke="var(--diagram-accent)" stroke-width="3" fill="none"/>
  <circle cx="234" cy="100" r="7" stroke="var(--diagram-line)" stroke-width="2" fill="none"/>
  <path d="M234 100 L254 100" stroke="var(--diagram-line)" stroke-width="3" fill="none"/>
  <ellipse cx="268" cy="100" rx="12" ry="9" stroke="var(--diagram-accent)" stroke-width="3" fill="none"/>
  <path d="M280 100 L312 100" stroke="var(--diagram-line)" stroke-width="3" fill="none"/>
</svg>`;

const DOUBLE_UNI_SVG = `<svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid meet">
  <line x1="106.67" y1="8" x2="106.67" y2="192" stroke="var(--diagram-line)" stroke-width="1" opacity="0.25"/>
  <line x1="213.33" y1="8" x2="213.33" y2="192" stroke="var(--diagram-line)" stroke-width="1" opacity="0.25"/>
  <text x="14" y="22" font-size="11" fill="var(--diagram-label)">1</text>
  <text x="121" y="22" font-size="11" fill="var(--diagram-label)">2</text>
  <text x="228" y="22" font-size="11" fill="var(--diagram-label)">3</text>
  <path d="M4 84 L98 84" stroke="var(--diagram-line)" stroke-width="3" fill="none"/>
  <path d="M4 116 L98 116" stroke="var(--diagram-line)" stroke-width="3" fill="none"/>
  <path d="M116 84 L204 84" stroke="var(--diagram-line)" stroke-width="3" fill="none"/>
  <path d="M116 116 L204 116" stroke="var(--diagram-line)" stroke-width="3" fill="none"/>
  <path d="M136 84 Q136 68 148 68 Q160 68 160 84 Q160 100 172 100 Q184 100 184 84" stroke="var(--diagram-accent)" stroke-width="3" fill="none"/>
  <path d="M148 116 Q148 132 160 132 Q172 132 172 116 Q172 100 184 100 Q196 100 196 116" stroke="var(--diagram-accent)" stroke-width="3" fill="none"/>
  <path d="M222 100 L246 100" stroke="var(--diagram-line)" stroke-width="3" fill="none"/>
  <path d="M296 100 L316 100" stroke="var(--diagram-line)" stroke-width="3" fill="none"/>
  <ellipse cx="271" cy="100" rx="18" ry="10" stroke="var(--diagram-accent)" stroke-width="3" fill="none"/>
</svg>`;

const BLOOD_SVG = `<svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid meet">
  <line x1="106.67" y1="8" x2="106.67" y2="192" stroke="var(--diagram-line)" stroke-width="1" opacity="0.25"/>
  <line x1="213.33" y1="8" x2="213.33" y2="192" stroke="var(--diagram-line)" stroke-width="1" opacity="0.25"/>
  <text x="14" y="22" font-size="11" fill="var(--diagram-label)">1</text>
  <text x="121" y="22" font-size="11" fill="var(--diagram-label)">2</text>
  <text x="228" y="22" font-size="11" fill="var(--diagram-label)">3</text>
  <path d="M8 76 L98 124" stroke="var(--diagram-line)" stroke-width="3" fill="none"/>
  <path d="M8 124 L98 76" stroke="var(--diagram-line)" stroke-width="3" fill="none"/>
  <path d="M116 88 L160 88" stroke="var(--diagram-line)" stroke-width="3" fill="none"/>
  <path d="M116 112 L160 112" stroke="var(--diagram-line)" stroke-width="3" fill="none"/>
  <path d="M160 88 Q182 78 182 100 Q182 122 160 112" stroke="var(--diagram-accent)" stroke-width="3" fill="none"/>
  <path d="M160 112 Q138 122 138 100 Q138 78 160 88" stroke="var(--diagram-accent)" stroke-width="3" fill="none"/>
  <path d="M224 100 L256 88" stroke="var(--diagram-line)" stroke-width="3" fill="none"/>
  <path d="M224 100 L256 112" stroke="var(--diagram-line)" stroke-width="3" fill="none"/>
  <circle cx="268" cy="100" r="5" stroke="var(--diagram-line)" stroke-width="2" fill="none"/>
  <path d="M268 100 L296 84" stroke="var(--diagram-accent)" stroke-width="3" fill="none"/>
  <path d="M268 100 L296 116" stroke="var(--diagram-accent)" stroke-width="3" fill="none"/>
</svg>`;

const DROPPER_SVG = `<svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid meet">
  <line x1="106.67" y1="8" x2="106.67" y2="192" stroke="var(--diagram-line)" stroke-width="1" opacity="0.25"/>
  <line x1="213.33" y1="8" x2="213.33" y2="192" stroke="var(--diagram-line)" stroke-width="1" opacity="0.25"/>
  <text x="14" y="22" font-size="11" fill="var(--diagram-label)">1</text>
  <text x="121" y="22" font-size="11" fill="var(--diagram-label)">2</text>
  <text x="228" y="22" font-size="11" fill="var(--diagram-label)">3</text>
  <path d="M4 100 L36 100" stroke="var(--diagram-line)" stroke-width="3" fill="none"/>
  <path d="M36 100 Q36 130 60 130 Q84 130 84 100" stroke="var(--diagram-line)" stroke-width="3" fill="none"/>
  <path d="M84 100 L98 100" stroke="var(--diagram-line)" stroke-width="3" fill="none"/>
  <path d="M116 100 L148 100" stroke="var(--diagram-line)" stroke-width="3" fill="none"/>
  <path d="M180 100 L204 100" stroke="var(--diagram-line)" stroke-width="3" fill="none"/>
  <path d="M148 100 Q148 84 160 84 Q172 84 172 100 Q172 116 160 116 Q148 116 148 100" stroke="var(--diagram-accent)" stroke-width="3" fill="none"/>
  <path d="M160 116 Q160 132 168 132" stroke="var(--diagram-accent)" stroke-width="3" fill="none"/>
  <path d="M222 100 L306 100" stroke="var(--diagram-line)" stroke-width="3" fill="none"/>
  <circle cx="264" cy="100" r="6" stroke="var(--diagram-line)" stroke-width="2" fill="none"/>
  <path d="M264 106 L264 150" stroke="var(--diagram-accent)" stroke-width="3" fill="none"/>
</svg>`;

const SNELL_SVG = `<svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid meet">
  <line x1="106.67" y1="8" x2="106.67" y2="192" stroke="var(--diagram-line)" stroke-width="1" opacity="0.25"/>
  <line x1="213.33" y1="8" x2="213.33" y2="192" stroke="var(--diagram-line)" stroke-width="1" opacity="0.25"/>
  <text x="14" y="22" font-size="11" fill="var(--diagram-label)">1</text>
  <text x="121" y="22" font-size="11" fill="var(--diagram-label)">2</text>
  <text x="228" y="22" font-size="11" fill="var(--diagram-label)">3</text>
  <circle cx="20" cy="100" r="6" stroke="var(--diagram-line)" stroke-width="2" fill="none"/>
  <path d="M20 106 Q10 130 30 150 Q46 164 62 150" stroke="var(--diagram-line)" stroke-width="2" fill="none"/>
  <path d="M4 88 L20 100" stroke="var(--diagram-line)" stroke-width="3" fill="none"/>
  <path d="M20 100 L92 100" stroke="var(--diagram-line)" stroke-width="3" fill="none"/>
  <circle cx="128" cy="100" r="6" stroke="var(--diagram-line)" stroke-width="2" fill="none"/>
  <path d="M128 106 Q118 130 138 150 Q154 164 170 150" stroke="var(--diagram-line)" stroke-width="2" fill="none"/>
  <path d="M128 100 L200 100" stroke="var(--diagram-line)" stroke-width="3" fill="none"/>
  <path d="M134 94 Q150 84 150 100 Q150 116 166 106 Q182 96 182 100" stroke="var(--diagram-accent)" stroke-width="3" fill="none"/>
  <circle cx="236" cy="100" r="6" stroke="var(--diagram-line)" stroke-width="2" fill="none"/>
  <path d="M236 106 Q226 130 246 150 Q262 164 278 150" stroke="var(--diagram-line)" stroke-width="2" fill="none"/>
  <path d="M236 100 L246 100" stroke="var(--diagram-line)" stroke-width="3" fill="none"/>
  <ellipse cx="262" cy="100" rx="16" ry="7" stroke="var(--diagram-accent)" stroke-width="3" fill="none"/>
  <path d="M278 100 L312 100" stroke="var(--diagram-line)" stroke-width="3" fill="none"/>
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
  {
    id: 'uni-knot',
    section: 'knots',
    title: 'Uni knot',
    blurb: 'One knot for hooks, swivels and sinkers, in mono or braid. If you only learn one terminal knot, learn this one.',
    svg: UNI_SVG,
    svgAlt: 'Three panels showing a line threaded through a hook eye, doubled back into a loop, wrapped through the loop, and drawn tight against the eye.',
    steps: [
      'Pass the line through the eye and double it back alongside itself, leaving a hand-span of tag.',
      'Lay the tag back over the doubled line to form a loop.',
      'Wrap the tag through that loop and around both strands five times, six in braid.',
      'Wet it, then pull the tag to close the coils into a barrel.',
      'Pull the main line to slide the barrel down onto the eye, and trim the tag close.',
    ],
    note: null,
  },
  {
    id: 'double-uni',
    section: 'knots',
    title: 'Double uni - braid to leader',
    blurb: 'Joins braid to a fluorocarbon or mono leader. Two uni knots facing each other, pulled together into one join.',
    svg: DOUBLE_UNI_SVG,
    svgAlt: 'Two lines overlapping in parallel, each tied in a uni knot around the other, then drawn together into a single join.',
    steps: [
      'Overlap the braid and the leader by about twenty centimetres, running in opposite directions.',
      'Tie a uni knot in the braid around the leader, using six or seven wraps - braid is slippery.',
      'Tie a uni knot in the leader around the braid, using four or five wraps.',
      'Wet both knots, then pull the two main lines apart so the knots slide together and lock.',
      'Trim both tags flush so the join does not catch in the guides.',
    ],
    note: {
      kind: 'tip',
      text: 'The FG knot is thinner and casts through the guides better, at the cost of being far fiddlier to tie in wind. Worth learning once this one is second nature.',
    },
  },
  {
    id: 'blood-knot',
    section: 'knots',
    title: 'Blood knot',
    blurb: 'Joins two lengths of mono of similar diameter. This is the join inside a trace, not the join to your main line.',
    svg: BLOOD_SVG,
    svgAlt: 'Two lines crossed, each wrapped several times around the other, with both tag ends passed back through the gap at the centre in opposite directions.',
    steps: [
      'Cross the two lines, leaving long tags on both.',
      'Wrap one tag around the other line five times, then bring it back to the crossing point.',
      'Wrap the second tag around the first line five times, back to the same point.',
      'Pass the two tags through the central gap in opposite directions.',
      'Wet it and pull both main lines steadily until the wraps roll up neat and tight.',
    ],
    note: null,
  },
  {
    id: 'dropper-loop',
    section: 'knots',
    title: 'Dropper loop',
    blurb: 'A loop standing out from the middle of a trace, with no cut in the line. This is what a paternoster hangs its hooks on.',
    svg: DROPPER_SVG,
    svgAlt: 'A loop formed in the middle of a line, wrapped several times, with the centre of the loop pushed back through the middle of the wraps to stand out at right angles.',
    steps: [
      'Form a loop in the line where you want the hook to sit.',
      'Wrap one side of the loop around the standing line six times, working away from the loop.',
      'Open the gap at the middle of the wraps and push the bottom of the loop through it.',
      'Hold that loop with a finger so it cannot pull back out.',
      'Wet it, then pull both standing ends apart until the wraps close and the loop stands out square to the trace.',
    ],
    note: null,
  },
  {
    id: 'snell',
    section: 'knots',
    title: 'Snell',
    blurb: 'Ties the line to the shank of the hook rather than the eye, so the hook sits in line with the trace and turns into a fish rather than away from it.',
    svg: SNELL_SVG,
    svgAlt: 'A line passed through a hook eye and laid along the shank, wrapped around both shank and line several times, then the tag drawn back out through the eye.',
    steps: [
      'Pass the line through the eye from the point side and lay it along the shank.',
      'Bring the tag back through the eye the same way, forming a loop alongside the shank.',
      'Wrap that loop around the shank and both strands six or seven times, working towards the point.',
      'Hold the wraps against the shank and pull the standing line to draw them tight.',
      'Check the line leaves the eye on the point side, and trim.',
    ],
    note: null,
  },
]);
