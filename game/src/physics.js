// Flight model: an arcade model with real bones — lift needs speed,
// turns need bank, drag grows with the square of speed, and the wing
// quits below stall speed. All angles in degrees, speeds in m/s.
import { GRAVITY, PLANE, clamp, degToRad, radToDeg, wrapAngleDeg } from './config.js';
import { groundHeight } from './terrain.js';

export function freshPlane(mission) {
  return {
    x: 0,
    y: 121.6, // sitting on the strip
    z: 150,
    heading: 0, // north, down the strip
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0,
    fuel: mission.fuelStart,
    flaps: false,
    gearDown: true,
    onGround: true,
    damage: 0,
    verticalSpeed: 0,
    airborne: false,
    airTime: 0,
  };
}

// One fixed step. `input` is { pitch: -1..1, roll: -1..1, throttle: -1..1 }.
// Returns events: 'stall', 'touchdown', 'crash', 'takeoff', 'fuel-empty'.
export function stepFlight(plane, input, dt) {
  const events = [];
  const stallSpeed = PLANE.stallSpeed * (plane.flaps ? 0.86 : 1);

  // Throttle: Shift/Ctrl move it, and it stays where you leave it.
  plane.throttle = clamp(plane.throttle + input.throttle * dt * 0.55, 0, 1);

  // Fuel burn follows the throttle lever; empty tanks mean a glider.
  if (plane.throttle > 0 && plane.fuel > 0) {
    plane.fuel = Math.max(0, plane.fuel - PLANE.burnPerSecond * plane.throttle * dt);
    if (plane.fuel === 0) events.push('fuel-empty');
  }
  const thrust = plane.fuel > 0 ? plane.throttle * PLANE.maxThrust : 0;

  // Drag: parasite drag sized so full throttle tops out near
  // PLANE.maxSpeed in level flight, plus flaps and gear drag.
  const drag =
    0.089 * plane.speed * plane.speed * PLANE.wingArea * 0.5 +
    (plane.flaps ? 900 : 0) +
    (plane.gearDown && !plane.onGround ? 320 : 0);
  const accel = (thrust - drag) / PLANE.mass;
  plane.speed = Math.max(0, plane.speed + accel * dt);

  // Roll and pitch chase the stick with a little inertia.
  const targetRoll = input.roll * 62;
  plane.roll += clamp(targetRoll - plane.roll, -PLANE.rollRate * dt, PLANE.rollRate * dt);
  const targetPitch = input.pitch * 24;
  plane.pitch += clamp(targetPitch - plane.pitch, -PLANE.pitchRate * dt, PLANE.pitchRate * dt);

  const stalled = plane.speed < stallSpeed && !plane.onGround;
  if (stalled) {
    // The wing quits: the nose drops and the turn washes out.
    plane.pitch += (12 - plane.pitch) * dt * 1.4;
    plane.roll *= 1 - 0.8 * dt;
    events.push('stall');
  }

  // Coordinated turn: heading rate follows bank and speed.
  if (plane.speed > 4) {
    const turnRate = (GRAVITY * Math.tan(degToRad(plane.roll))) / Math.max(plane.speed, 12);
    plane.heading = wrapAngleDeg(plane.heading + radToDeg(turnRate) * dt);
  }

  // Vertical speed: pitch component plus lift margin over stall speed.
  // At cruise the wing still lifts a touch, so level flight wants a
  // whisper of nose-down trim; near the stall it sinks on its own.
  const liftMargin = clamp((plane.speed - stallSpeed) / 30, -1.2, 1.4);
  const targetVs = Math.sin(degToRad(plane.pitch)) * plane.speed + (liftMargin - 0.8) * 4.2;
  plane.verticalSpeed += (targetVs - plane.verticalSpeed) * Math.min(1, dt * 1.6);
  plane.y += plane.verticalSpeed * dt;

  // Move over the ground along the heading.
  const headingRad = degToRad(plane.heading);
  const forwardX = Math.sin(headingRad);
  const forwardZ = -Math.cos(headingRad);
  plane.x += forwardX * plane.speed * Math.cos(degToRad(plane.pitch)) * dt;
  plane.z += forwardZ * plane.speed * Math.cos(degToRad(plane.pitch)) * dt;

  // Ground contact.
  const ground = groundHeight(plane.x, plane.z);
  const wheelY = ground + PLANE.gearHeight;
  if (plane.y <= wheelY) {
    if (!plane.onGround) {
      const descent = -plane.verticalSpeed;
      const aligned = Math.abs(wrapAngleDeg(plane.heading)) < 14;
      const onStrip =
        Math.abs(plane.x) < 24 && Math.abs(plane.z) < 265 && Math.abs(plane.heading) < 14;
      if (descent > 7 || plane.speed > 62 || (!onStrip && descent > 3.5)) {
        events.push('crash');
      } else {
        events.push('touchdown');
      }
      if (aligned && onStrip && descent <= 7 && plane.speed <= 62) {
        // A survivable arrival: roll out on the wheels.
        plane.y = wheelY;
        plane.verticalSpeed = 0;
        plane.pitch = 0;
        plane.roll *= 0.4;
        plane.onGround = true;
        plane.airborne = false;
        plane.speed = Math.max(0, plane.speed - 14 * dt);
      } else if (descent > 7 || plane.speed > 62) {
        plane.damage = 100;
      }
    } else {
      plane.y = wheelY;
      plane.verticalSpeed = 0;
      if (plane.speed > 30 && plane.pitch > 6) {
        plane.onGround = false;
        plane.airborne = true;
        events.push('takeoff');
      }
      // Rolling friction on the strip.
      plane.speed = Math.max(0, plane.speed - 2.2 * dt);
    }
  } else if (plane.onGround && plane.y > wheelY + 0.4) {
    plane.onGround = false;
    plane.airborne = true;
  }

  if (plane.airborne) plane.airTime += dt;
  return events;
}

// A gentle autopilot for the screenshot scenes: steer at the target
// point, hold altitude and speed, keep the wings level-ish.
export function autopilotInput(plane, target, wantSpeed) {
  const dx = target.x - plane.x;
  const dz = target.z - plane.z;
  const dist = Math.hypot(dx, dz);
  const wantHeading = radToDeg(Math.atan2(dx, -dz));
  const headingError = wrapAngleDeg(wantHeading - plane.heading);
  const rollCmd = clamp(headingError / 26, -1, 1);
  const altError = target.y - plane.y;
  const pitchCmd = clamp(altError / 55, -0.8, 0.8) + clamp((wantSpeed - plane.speed) / 90, -0.25, 0.25);
  const throttleCmd = plane.speed < wantSpeed - 3 ? 1 : plane.speed > wantSpeed + 3 ? -1 : 0;
  return { pitch: clamp(pitchCmd, -1, 1), roll: rollCmd, throttle: throttleCmd, dist };
}
