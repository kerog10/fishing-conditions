import { CONFIG } from './config.js';

// 1 at or below `ideal`, 0 at or above `worst`, linear in between.
export function linearScore(value, ideal, worst) {
  if (value === null || value === undefined || Number.isNaN(value)) return 1;
  if (value <= ideal) return 1;
  if (value >= worst) return 0;
  return (worst - value) / (worst - ideal);
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

// Can I actually fish this hour? Returns the worst of the individual bands,
// floored so that a strong bite window in bad weather stays visible in the
// list rather than disappearing without explanation.
export function comfortScore(hour) {
  const c = CONFIG.comfort;
  const bands = [
    { value: hour.windSpeed, band: c.wind, label: 'wind', unit: 'km/h' },
    { value: hour.windGusts, band: c.gusts, label: 'gusts', unit: 'km/h' },
    { value: hour.swellHeight, band: c.swell, label: 'swell', unit: 'm' },
    { value: hour.precipitation, band: c.rain, label: 'rain', unit: 'mm/h' },
  ];

  const reasons = [];
  let worst = 1;

  for (const b of bands) {
    if (b.value === null || b.value === undefined || Number.isNaN(b.value)) continue;
    const s = linearScore(b.value, b.band.ideal, b.band.worst);
    if (s < worst) worst = s;
    if (s < 0.5) reasons.push(`Uncomfortable ${b.label} (${round1(b.value)} ${b.unit})`);
  }

  // worst === 1 maps to 1; worst === 0 maps exactly to the floor.
  return { value: c.floor + (1 - c.floor) * worst, reasons };
}
