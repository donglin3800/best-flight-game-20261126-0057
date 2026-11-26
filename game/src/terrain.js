// Aurora Ridge terrain: a river valley between two mountain walls, a
// lake in the east basin, a village on the west bench and one flat
// strip — Aurora Field — where the aircraft lives.
import { RUNWAY, WATER_LEVEL, WORLD_SEED } from './config.js';
import { makeNoise2D, mulberry32, scatterPoints } from './random.js';

const noise = makeNoise2D(WORLD_SEED);
const ridgeNoise = makeNoise2D(WORLD_SEED + 77);

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// Raw mountain height before the valley and runway are carved in.
export function rawHeight(x, z) {
  // The valley floor runs along the z axis; walls rise with |x|.
  const wall = smoothstep(240, 950, Math.abs(x));
  const hills = noise(x * 0.0016, z * 0.0016); // broad rolling hills
  const crags = ridgeNoise(x * 0.0042, z * 0.0042); // sharp local relief
  const ridge = Math.pow(crags, 2.2) * 340;
  return 118 + hills * 46 * (0.25 + wall) + ridge * wall;
}

export function groundHeight(x, z) {
  let h = rawHeight(x, z);
  // Carve the river valley flat-ish along the strip's axis.
  const valley = 1 - smoothstep(60, 420, Math.abs(x));
  h = h * (1 - valley * 0.55) + 121 * valley * 0.55;
  // The lake basin, east of the strip.
  const dx = x - 470;
  const dz = z - 760;
  const lakeD = Math.sqrt(dx * dx + dz * dz);
  if (lakeD < 260) {
    const k = smoothstep(120, 260, lakeD);
    h = 112 + (h - 112) * k;
  }
  // Flatten Aurora Field so the strip is truly level.
  const rx = Math.abs(x - RUNWAY.centreX);
  const rz = Math.abs(z - RUNWAY.centreZ);
  if (rx < 90 && rz < 330) {
    const kx = smoothstep(34, 90, rx);
    const kz = smoothstep(272, 330, rz);
    const k = Math.max(kx, kz);
    h = RUNWAY.elevation + (h - RUNWAY.elevation) * k;
  }
  // Flatten the far strip used by the courier mission.
  const fx = x - 60;
  const fz = z - 1480;
  if (Math.abs(fx) < 80 && Math.abs(fz) < 300) {
    const k = Math.max(smoothstep(30, 80, Math.abs(fx)), smoothstep(250, 300, Math.abs(fz)));
    h = RUNWAY.elevation + (h - RUNWAY.elevation) * k;
  }
  return h;
}

export function isWater(x, z) {
  const dx = x - 470;
  const dz = z - 760;
  return dx * dx + dz * dz < 210 * 210 && groundHeight(x, z) < WATER_LEVEL;
}

// Colour of the ground by height and slope: meadow, forest floor,
// rock, then snow on the high crags. Returns [r, g, b].
export function groundColour(x, z, h) {
  const slope = Math.abs(groundHeight(x + 24, z) - h) + Math.abs(groundHeight(x, z + 24) - h);
  const n = noise(x * 0.02 + 31, z * 0.02 + 17);
  if (h > 330) return [226, 232, 238]; // snow
  if (h > 265 || slope > 26) return [122, 116, 108]; // rock
  if (h > 205) {
    // high forest: dark green with patchy variation
    const v = 0.85 + n * 0.3;
    return [52 * v, 96 * v, 58 * v];
  }
  if (isWater(x, z)) return [64, 132, 178];
  // Valley meadow, sun-warmed, varying only with smooth noise so the
  // ground reads as fields and grass, never as a checkerboard.
  const v = 0.88 + n * 0.24;
  return [104 * v, 148 * v, 74 * v];
}

// Trees where the ground is low enough to grow them and not on the strip.
export const TREES = scatterPoints(WORLD_SEED + 5, 520, 1350, 26).filter((p) => {
  const h = groundHeight(p.x, p.z);
  if (h < 126 || h > 250) return false;
  if (Math.abs(p.x) < 46 && Math.abs(p.z) < 300) return false;
  if (isWater(p.x, p.z)) return false;
  return true;
});

// The village of Alderwick on the west bench: houses with warm roofs.
const villageRand = mulberry32(WORLD_SEED + 9);
export const HOUSES = [];
for (let i = 0; i < 26; i += 1) {
  const x = -260 + villageRand() * 190;
  const z = 300 + villageRand() * 260;
  HOUSES.push({
    x,
    z,
    y: groundHeight(x, z),
    w: 9 + villageRand() * 7,
    d: 8 + villageRand() * 6,
    h: 5 + villageRand() * 3,
    rot: villageRand() * Math.PI,
    roof: ['#a34d2d', '#7d5a34', '#5d6b7a'][i % 3],
  });
}

// Ring courses: a valley circuit for the Ring Run, a short circuit for
// the landing mission, and the long valley run for the courier.
export function ringCourse(missionId) {
  if (missionId === 'landing') {
    return [
      { x: 0, z: -420, y: 210 },
      { x: -190, z: -640, y: 235 },
      { x: -230, z: -180, y: 205 },
    ];
  }
  if (missionId === 'courier') {
    return [
      { x: 90, z: 420, y: 205 },
      { x: 240, z: 760, y: 230 },
      { x: 60, z: 1080, y: 215 },
      { x: -40, z: 1330, y: 200 },
      { x: 60, z: 1480, y: 175 },
    ];
  }
  return [
    { x: 0, z: -380, y: 205 },
    { x: -160, z: -700, y: 240 },
    { x: -260, z: -420, y: 225 },
    { x: -120, z: -60, y: 200 },
    { x: 140, z: 240, y: 215 },
    { x: 260, z: 560, y: 245 },
    { x: 120, z: 820, y: 220 },
    { x: 0, z: 420, y: 195 },
  ];
}

// Clouds drift slowly above the valley; positions are seeded, heights fixed.
const cloudRand = mulberry32(WORLD_SEED + 21);
export const CLOUDS = [];
for (let i = 0; i < 26; i += 1) {
  CLOUDS.push({
    x: (cloudRand() * 2 - 1) * 1600,
    z: (cloudRand() * 2 - 1) * 1600,
    y: 520 + cloudRand() * 260,
    s: 60 + cloudRand() * 130,
    drift: 1.5 + cloudRand() * 2.5,
  });
}
