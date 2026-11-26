// Aurora Ridge — shared constants and mission definitions.
// Units are metres, seconds and degrees unless a name says otherwise.
// Display speeds are knots, altitudes feet, matching the instruments.

export const WORLD_SEED = 20261126;
export const GRAVITY = 9.81;
export const WATER_LEVEL = 120;
export const RUNWAY = {
  // A flat grass-and-asphalt strip in the valley floor, heading north.
  centreX: 0,
  centreZ: 0,
  halfWidth: 22,
  halfLength: 260,
  elevation: 120,
  headingDeg: 0,
};

export const PLANE = {
  maxThrust: 6200, // newtons of equivalent thrust at full throttle
  mass: 1100, // kg
  wingArea: 16.5,
  stallSpeed: 26, // m/s, below this the wing stops flying
  maxSpeed: 92, // m/s, level-flight top speed at full throttle
  cruiseSpeed: 62,
  rollRate: 95, // deg/s at full deflection
  pitchRate: 42, // deg/s at full deflection
  gearHeight: 1.6, // metres from belly to wheels
  fuelCapacity: 100, // litres shown as percent
  burnPerSecond: 0.32, // litres at full throttle: ~5 min wide open, ~10 at cruise
};

export const CAMERA = {
  chaseDistance: 17,
  chaseHeight: 5.2,
  fovDeg: 68,
  rollFollow: 0.38, // how much of the plane's bank the camera takes
};

export const TERRAIN = {
  cell: 48, // metres between heightfield samples
  extent: 768, // metres drawn around the aircraft
  viewDistance: 1500,
};

// The three sorties. Each one is a different job for the same aircraft.
export const MISSIONS = [
  {
    id: 'rings',
    key: '1',
    name: 'Ring Run',
    tagline: 'Thread 8 golden rings down the valley against the clock.',
    briefing:
      'Take off from Aurora Field, chase the golden rings in order and ' +
      'land back on the strip. Centre hits pay double. Mind the ridges.',
    rings: 8,
    fuelStart: 100,
    timeLimit: 420,
  },
  {
    id: 'landing',
    key: '2',
    name: 'Ridge Landing',
    tagline: 'One circuit, one perfect touchdown on a short valley strip.',
    briefing:
      'Climb out, fly the circuit and bring her home. Gear down, flaps ' +
      'out, under 100 kt over the numbers and sinking gently — or go around.',
    rings: 3,
    fuelStart: 100,
    timeLimit: 360,
  },
  {
    id: 'courier',
    key: '3',
    name: 'Storm Courier',
    tagline: 'Fuel is short. Deliver the mail to the far strip — or ditch.',
    briefing:
      'A storm is coming over the ridge and the tanks are half full. ' +
      'Fly the green refuel rings to stay alive and put down at the far ' +
      'strip before the fuel gauge reads empty.',
    rings: 5,
    fuelStart: 52,
    timeLimit: 480,
  },
];

export const RING_RADIUS = 16;
export const RING_SCORE = 100;
export const CENTRE_BONUS = 100;
export const LANDING_SCORE = 400;

export function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad) {
  return (rad * 180) / Math.PI;
}

export function wrapAngleDeg(deg) {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

export function msToKnots(ms) {
  return ms * 1.94384;
}

export function mToFeet(m) {
  return m * 3.28084;
}

export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
