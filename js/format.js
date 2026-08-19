// Every formatter reads with UTC getters. Task 7 stores Open-Meteo's local
// wall-clock values as if they were UTC, so local getters would apply the
// browser's offset a second time.

const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function compass(degrees) {
  if (!Number.isFinite(degrees)) return '';
  const idx = Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16;
  return POINTS[idx];
}

export function scoreBand(final) {
  if (final >= 80) return 'excellent';
  if (final >= 60) return 'good';
  if (final >= 40) return 'fair';
  return 'poor';
}

export function hhmm(d) {
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

export function timeRange(start, end) {
  return `${hhmm(start)}–${hhmm(end)}`;
}

export function relativeAge(ms) {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 2) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function dayLabel(date, today = new Date()) {
  const dayNumber = (d) => Math.floor(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86400000,
  );
  const diff = dayNumber(date) - dayNumber(today);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}
