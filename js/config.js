// Every scoring constant lives here. Nothing else in the app hard-codes a
// threshold. Retuning the app against real results is a change to this file
// alone.

export const CONFIG = {
  forecastDays: 7,

  feed: {
    path: 'data/feeds/kingfisher.json',
    // Past this the card disappears rather than presenting an old report as
    // current. Weekly reports, so three weeks means two have been missed.
    maxAgeDays: 21,
  },

  videos: {
    path: 'data/feeds/youtube.json',
    max: 8,
    // Four of the seven channels posted within four days of each other on the
    // day this was designed. Without a per-channel cap one prolific poster
    // takes the whole list.
    perChannel: 2,
  },

  hotspots: {
    // A hotspot is a claim about now. Older videos stay in the list below but
    // stop contributing here.
    windowDays: 56,
    max: 6,
    // A title says what the video is about; a description says what the
    // channel is about.
    titleWeight: 3,
    bodyWeight: 1,
    // Recency decays across the window but never to zero -- an eight-week-old
    // mark still beats one with no evidence at all.
    minRecencyWeight: 0.2,
    // Roughly the spacing of the named KZN beaches, so a saved spot matches
    // the beach it is on rather than its neighbour.
    maxDistanceKm: 5,
  },

  // Bite score: will fish feed? Weights sum to 100.
  biteWeights: {
    pressure: 30,
    tide: 30,
    solunar: 20,
    dawnDusk: 15,
    moonPhase: 5,
  },

  // Change in pressure_msl over the preceding window, in hPa.
  pressure: {
    windowHours: 3,
    bestHpa: 1.0,
    neutralHpa: 0,
    worstHpa: -1.5,
  },

  solunar: {
    majorHalfWidthHours: 1,
    minorHalfWidthHours: 1,
    minorCredit: 0.5, // minor periods score half of a major
  },

  dawnDusk: {
    halfWidthHours: 1,
  },

  moonPhase: {
    fullCreditDays: 3,     // within 3 days of new or full moon
    zeroCreditDays: 7.383, // quarter moon: a quarter of the synodic month
  },

  // Comfort multiplier: can I actually fish it? Each band degrades linearly
  // from ideal (1.0) to worst (floor). The overall multiplier is the minimum.
  comfort: {
    floor: 0.15,
    wind: { ideal: 15, worst: 45 },    // km/h
    gusts: { ideal: 25, worst: 60 },   // km/h
    swell: { ideal: 1.0, worst: 3.5 }, // m
    rain: { ideal: 0.5, worst: 5 },    // mm/h
  },

  windows: {
    threshold: 55,
    splitDrop: 15,
    minHours: 1,
    maxHours: 4,
    topN: 8,
  },

  // Severity ramps for the forecast table: the upper bound of each band. A
  // value above the last bound falls into one final band beyond the array, so
  // a ramp of six bounds paints seven bands.
  //
  // wind and gusts deliberately bracket comfort.wind and comfort.gusts above,
  // so a cell turning red and the comfort multiplier collapsing happen at the
  // same wind speed. Retuning one without the other is the bug this prevents.
  severity: {
    wind: [10, 15, 20, 25, 30, 40],         // km/h
    gusts: [16, 25, 32, 40, 50, 60],        // km/h
    swell: [0.5, 1.0, 1.5, 2.0, 2.5, 3.5],  // m
    rain: [0.1, 0.5, 1.0, 2.0, 5.0],        // mm/h
    // Tide has no absolute ramp: tidal range varies by spot and by spring or
    // neap, so an absolute scale would leave some spots one colour all week
    // and tell you nothing about when the water moves. It is normalised
    // within each day's own range into this many steps instead.
    tideSteps: 4,
    // The good boundary is windows.threshold, not a second definition of
    // "good". Only the poor boundary is new here.
    scorePoor: 35,
  },

  // Multi-model agreement. These are requests, not guarantees: model coverage
  // is regional and Open-Meteo drops an unavailable model silently, so the
  // models actually present are always read back off the response.
  models: {
    forecast: ['gfs_seamless', 'icon_seamless', 'ecmwf_ifs025'],
    marine: ['gwam', 'ecmwf_wam025'],
    // Only the parameters that decide whether you go. Tripling all twenty
    // across three models would be payload for nothing. Keys are table row
    // keys; values are Open-Meteo parameter names.
    forecastParams: {
      wind: 'wind_speed_10m',
      gusts: 'wind_gusts_10m',
      pressure: 'pressure_msl',
      rain: 'precipitation',
    },
    // swell_wave_height, not wave_height: agreement must be computed on the
    // same quantity the swell row displays.
    marineParams: {
      swell: 'swell_wave_height',
    },
    // Spread (max - min) across the available models above which a cell is
    // marked disputed.
    tolerance: {
      wind: 8,      // km/h
      gusts: 12,    // km/h
      pressure: 2,  // hPa
      rain: 1,      // mm/h
      swell: 0.5,   // m
    },
    // A dispute in any of these is a dispute in the score built from them.
    scoreInputs: ['wind', 'gusts', 'pressure', 'rain', 'swell'],
  },

  // The forecast table, top row first. `slot` names the property on a slot
  // from daily.js; `ramp` names a severity ramp above. Changing the table is
  // an edit to this array.
  tableRows: [
    { key: 'score', label: 'SCORE', slot: 'score', kind: 'score' },
    { key: 'bite', label: 'bite', slot: 'bite', kind: 'plain', digits: 0 },
    { key: 'comfort', label: 'comf', slot: 'comfort', kind: 'plain', digits: 2 },
    { key: 'wind', label: 'wind', slot: 'wind', kind: 'tinted', ramp: 'wind', digits: 0 },
    { key: 'gusts', label: 'gust', slot: 'gust', kind: 'tinted', ramp: 'gusts', digits: 0 },
    { key: 'dir', label: 'dir', slot: 'windDirection', kind: 'arrow' },
    { key: 'swell', label: 'swell', slot: 'swellHeight', kind: 'tinted', ramp: 'swell', digits: 1 },
    { key: 'period', label: 'per s', slot: 'swellPeriod', kind: 'plain', digits: 0 },
    { key: 'tide', label: 'tide', slot: 'tide', kind: 'tinted', ramp: 'tide', digits: 1 },
    { key: 'rain', label: 'rain', slot: 'rain', kind: 'tinted', ramp: 'rain', digits: 1 },
    { key: 'cloud', label: 'cloud', slot: 'cloud', kind: 'plain', digits: 0 },
    { key: 'air', label: 'air °C', slot: 'temperature', kind: 'plain', digits: 0 },
    { key: 'sea', label: 'sea °C', slot: 'seaTemperature', kind: 'plain', digits: 0 },
  ],

  spots: {
    max: 6,
    storageKey: 'fc:spots',
  },

  daily: {
    slotHours: 3, // columns per day in the detail grid: 24 / 3 = 8
  },

  cache: {
    freshMs: 60 * 60 * 1000,
    coordPrecision: 2,
    keyPrefix: 'fc:',
  },
};
