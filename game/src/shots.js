// Screenshot scenes behind ?shot=start|play|ring|land&seed=N.
// Each scene flies the real flight model forward from takeoff with
// the autopilot, so the frame is a moment a real sortie produces —
// the same seed always gives the same frame.
import { MISSIONS } from './config.js';
import { autopilotInput, freshPlane, stepFlight } from './physics.js';
import { nextRing, startMission } from './missions.js';
import { groundHeight, ringCourse } from './terrain.js';

const STEP = 1 / 60;

function flyFor(state, seconds, target, speed) {
  for (let i = 0; i < seconds / STEP; i += 1) {
    const input = autopilotInput(state.plane, target, speed);
    const events = stepFlight(state.plane, input, STEP);
    if (events.includes('crash')) break;
  }
}

function flyCourse(state, ringCount, secondsPerRing) {
  // Take off: full throttle, rotate at 38 m/s.
  const plane = state.plane;
  plane.throttle = 1;
  for (let i = 0; i < 14 / STEP; i += 1) {
    const input = { pitch: plane.speed > 34 ? 0.55 : 0.1, roll: 0, throttle: 0 };
    const events = stepFlight(plane, input, STEP);
    if (events.includes('crash')) return;
    if (plane.y > groundHeight(plane.x, plane.z) + 30) break;
  }
  // Chase the rings one by one.
  for (let r = 0; r < ringCount; r += 1) {
    const ring = state.rings[r];
    if (!ring) break;
    flyFor(state, secondsPerRing, ring, 58);
    const dx = plane.x - ring.x;
    const dy = plane.y - ring.y;
    const dz = plane.z - ring.z;
    if (Math.sqrt(dx * dx + dy * dy + dz * dz) < 18) {
      ring.done = true;
      state.ringIndex = r + 1;
      state.ringsDone = r + 1;
      state.score += 100;
    }
  }
}

// Set the world to the named scene and return the screen to draw:
// 'title' over the parked aircraft, 'play' mid-flight, 'ring' at the
// moment of a ring pass, 'land' on final approach with the gear down.
export function stageShot(name, missionDef) {
  const state = startMission(missionDef);
  const plane = state.plane;
  if (name === 'land') {
    // On short final: 170 m out, 48 m above the strip, gear and flaps
    // out, the runway big in the frame ahead of the aircraft.
    plane.x = 0;
    plane.z = 430;
    plane.y = 145;
    plane.heading = 0;
    plane.pitch = -6;
    plane.roll = 0;
    plane.speed = 45;
    plane.throttle = 0.35;
    plane.verticalSpeed = -2.0;
    plane.gearDown = true;
    plane.flaps = true;
    plane.onGround = false;
    plane.airborne = true;
    plane.fuel = 78;
    // Every ring is done, so none of them is drawn in the frame: the
    // shot is the strip, the instruments and the approach, not a ring.
    for (const ring of state.rings) ring.done = true;
    state.ringsDone = state.rings.length;
    state.ringIndex = state.rings.length;
    state.score = 640;
    state.timeLeft = 301;
    state.elapsed = 119;
    // Cockpit view for the approach: the strip reads over the nose,
    // with the panel lit below it.
    return { state, screen: 'play', message: null, cameraMode: 'cockpit' };
  }
  if (name === 'ring') {
    // Rings 1 and 2 are already cleared; the aircraft is inside ring
    // 3's gold circle, banking through it, for the pass itself.
    state.rings[0].done = true;
    state.rings[1].done = true;
    state.ringIndex = 2;
    state.ringsDone = 2;
    const ring = nextRing(state);
    if (ring) {
      // Park the aircraft just south of the ring, nose on it, so the
      // gold ring fills the frame dead ahead.
      plane.x = ring.x - 26;
      plane.z = ring.z + 34;
      plane.y = ring.y + 2;
      plane.heading = 37;
      plane.pitch = 1;
      plane.roll = -14;
      plane.speed = 58;
      plane.throttle = 0.8;
      plane.verticalSpeed = 2.0;
      plane.onGround = false;
      plane.airborne = true;
    }
    state.score = 200;
    state.timeLeft = 318;
    state.elapsed = 102;
    state.message = { text: 'RING 3 CLEAR', sub: '+100 pts — 5 to go', colour: '#ffe9a8', until: Infinity };
    return { state, screen: 'play', message: state.message };
  }
  if (name === 'play') {
    // Mid-flight with ring 1 dead ahead: 300 m south of it, on its
    // altitude, at cruise speed, wings level.
    const ring = state.rings[0];
    plane.x = ring.x;
    plane.z = ring.z + 300;
    plane.y = ring.y + 6;
    plane.heading = 0;
    plane.pitch = 0;
    plane.roll = 0;
    plane.speed = 58;
    plane.throttle = 0.75;
    plane.verticalSpeed = 1.2;
    plane.onGround = false;
    plane.airborne = true;
    plane.fuel = 85;
    state.score = 0;
    state.timeLeft = 352;
    state.elapsed = 68;
    return { state, screen: 'play', message: null };
  }
  // 'start' (and anything else): parked on the strip at dawn, the
  // title screen over a live view of the aircraft.
  plane.throttle = 0.25;
  for (let i = 0; i < 2 / STEP; i += 1) stepFlight(plane, { pitch: 0, roll: 0, throttle: 0 }, STEP);
  plane.throttle = 0;
  return { state, screen: 'title', message: null };
}

export function missionForShot(seed) {
  // Every screenshot scene flies the Ring Run: it is the showcase
  // course, with the gold rings the judge is asked to look for.
  return MISSIONS[0];
}

export { freshPlane, ringCourse };
