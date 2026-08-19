import { CONFIG } from './config.js';

const HOUR_MS = 3600000;

function toWindow(hours) {
  const mean = (fn) => hours.reduce((a, h) => a + fn(h), 0) / hours.length;
  return {
    start: hours[0].time,
    end: new Date(hours[hours.length - 1].time.getTime() + HOUR_MS),
    hours,
    meanFinal: Math.round(mean((h) => h.final)),
    peakFinal: Math.max(...hours.map((h) => h.final)),
    meanBite: Math.round(mean((h) => h.bite)),
    minComfort: Math.min(...hours.map((h) => h.comfort)),
    reasons: [...new Set(hours.flatMap((h) => h.reasons || []))],
  };
}

// Groups consecutive above-threshold hours into fishable windows, splitting
// where the score drops sharply and capping length, then ranks them.
export function findWindows(scoredHours) {
  const { threshold, splitDrop, minHours, maxHours, topN } = CONFIG.windows;
  const runs = [];
  let current = [];

  const flush = () => {
    if (current.length >= minHours) runs.push(current);
    current = [];
  };

  for (const hour of scoredHours) {
    if (hour.final < threshold) {
      flush();
      continue;
    }
    if (current.length > 0) {
      const mean = current.reduce((a, h) => a + h.final, 0) / current.length;
      const contiguous = hour.time - current[current.length - 1].time === HOUR_MS;
      if (!contiguous || mean - hour.final > splitDrop || current.length >= maxHours) {
        flush();
      }
    }
    current.push(hour);
  }
  flush();

  return runs
    .map(toWindow)
    .sort((a, b) => b.meanFinal - a.meanFinal)
    .slice(0, topN);
}
