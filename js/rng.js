// Deterministic hashing + value noise. Every client computes identical prices
// from (assetId, tick), so no server is needed for the market simulation.

export function hash32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rngFrom(seedStr) { return mulberry32(hash32(String(seedStr))); }

// integer seed + integer index -> float in [0,1)
export function hashF(seed, i) {
  let h = (seed ^ Math.imul(i | 0, 0x9E3779B1)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B);
  h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Smooth 1D value noise in [0,1]
export function vnoise(seed, x) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  const a = hashF(seed, i), b = hashF(seed, i + 1);
  return a + (b - a) * u;
}

// Fractal noise in roughly [-1,1]
export function fbm(seed, x, oct = 4, lac = 2.0, gain = 0.5) {
  let amp = 1, fr = 1, s = 0, norm = 0;
  for (let o = 0; o < oct; o++) {
    s += (vnoise((seed + o * 7919) | 0, x * fr) - 0.5) * 2 * amp;
    norm += amp; amp *= gain; fr *= lac;
  }
  return s / (norm || 1);
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const pick = (rand, arr) => arr[Math.floor(rand() * arr.length) % arr.length];
export const rr = (rand, a, b) => a + rand() * (b - a);
