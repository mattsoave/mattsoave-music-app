// Weighted practice: items you miss or answer slowly come up more often. Pure functions.

const SLOW_START = 2500; // ms; answers faster than this count as quick
const SLOW_RANGE = 5000;

/** A stat looks like { n, right, ms, last }. */
export function weightFor(stat) {
  if (!stat || !stat.n) return 3; // never seen: fairly likely
  const miss = 1 - stat.right / stat.n;
  const slow = Math.min(1, Math.max(0, ((stat.ms || 0) - SLOW_START) / SLOW_RANGE));
  const lastMiss = stat.last === false ? 1.5 : 0;
  return 0.35 + 4 * miss + 1.5 * slow + lastMiss;
}

export function record(stat, correct, ms) {
  const s = stat ? { ...stat } : { n: 0, right: 0, ms: 0, last: null };
  s.n += 1;
  if (correct) {
    s.right += 1;
    const capped = Math.min(ms, 12000);
    s.ms = s.right === 1 ? capped : Math.round(0.7 * s.ms + 0.3 * capped);
  }
  s.last = correct;
  return s;
}

/** Pick one item by weight, avoiding `avoidId` when there is another choice. */
export function pick(items, getStat, avoidId = null, rand = Math.random) {
  const pool = items.length > 1 ? items.filter((i) => i.id !== avoidId) : items;
  const weights = pool.map((i) => weightFor(getStat(i)));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

export const accuracy = (stat) => (stat && stat.n ? stat.right / stat.n : null);
