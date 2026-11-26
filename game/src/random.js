// Seeded randomness: one deterministic world per seed, so a screenshot
// taken today is the same world a player flies tomorrow.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth 2D value noise with fBm octaves, built from a hashed lattice.
export function makeNoise2D(seed) {
  const rand = mulberry32(seed);
  const perm = new Uint8Array(512);
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) base[i] = i;
  for (let i = 255; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = base[i];
    base[i] = base[j];
    base[j] = tmp;
  }
  for (let i = 0; i < 512; i += 1) perm[i] = base[i & 255];

  function lattice(ix, iz) {
    return perm[(perm[ix & 255] + iz) & 255] / 255;
  }

  function smooth(t) {
    return t * t * (3 - 2 * t);
  }

  function noise(x, z) {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fz = z - iz;
    const a = lattice(ix, iz);
    const b = lattice(ix + 1, iz);
    const c = lattice(ix, iz + 1);
    const d = lattice(ix + 1, iz + 1);
    const u = smooth(fx);
    const v = smooth(fz);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }

  // Fractal sum: 4 octaves, amplitude 1 / 0.5 / 0.25 / 0.125.
  return function fbm(x, z) {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    for (let octave = 0; octave < 4; octave += 1) {
      sum += amp * noise(x * freq, z * freq);
      amp *= 0.5;
      freq *= 2.03;
    }
    return sum; // roughly 0..1
  };
}

// Deterministic scatter: the same seed always plants the same trees.
export function scatterPoints(seed, count, span, minDist) {
  const rand = mulberry32(seed);
  const points = [];
  let guard = 0;
  while (points.length < count && guard < count * 40) {
    guard += 1;
    const x = (rand() * 2 - 1) * span;
    const z = (rand() * 2 - 1) * span;
    let ok = true;
    for (let i = 0; i < points.length; i += 1) {
      const dx = points[i].x - x;
      const dz = points[i].z - z;
      if (dx * dx + dz * dz < minDist * minDist) {
        ok = false;
        break;
      }
    }
    if (ok) points.push({ x, z, s: 0.7 + rand() * 0.7 });
  }
  return points;
}
