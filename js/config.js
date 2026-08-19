// Every scoring constant lives here. Nothing else in the app hard-codes a
// threshold. Retuning the app against real results is a change to this file
// alone.

export const CONFIG = {
  forecastDays: 7,

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
