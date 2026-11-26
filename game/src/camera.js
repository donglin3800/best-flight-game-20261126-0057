// Chase and cockpit cameras: a smoothed chase rig that takes some of
// the plane's bank, and a fixed cockpit rig at the nose.
import { CAMERA, clamp, degToRad, lerp } from './config.js';

function makeBasis(headingDeg, pitchDeg, rollDeg) {
  const h = degToRad(headingDeg);
  const p = degToRad(pitchDeg);
  const r = degToRad(rollDeg);
  // Forward: heading around Y, then pitch up.
  const forward = {
    x: Math.sin(h) * Math.cos(p),
    y: Math.sin(p),
    z: -Math.cos(h) * Math.cos(p),
  };
  // Right: heading only, then rolled around the forward axis.
  const rightFlat = { x: Math.cos(h), y: 0, z: Math.sin(h) };
  const upFlat = { x: 0, y: 1, z: 0 };
  const cosR = Math.cos(r);
  const sinR = Math.sin(r);
  const right = {
    x: rightFlat.x * cosR + upFlat.x * sinR,
    y: rightFlat.y * cosR + upFlat.y * sinR,
    z: rightFlat.z * cosR + upFlat.z * sinR,
  };
  // Up = right x forward (keeps the basis right-handed).
  const up = {
    x: right.y * forward.z - right.z * forward.y,
    y: right.z * forward.x - right.x * forward.z,
    z: right.x * forward.y - right.y * forward.x,
  };
  return { forward, right, up };
}

export function makeCamera() {
  return {
    pos: { x: 0, y: 130, z: 170 },
    look: { x: 0, y: 125, z: 0 },
    focal: 600,
    basis: makeBasis(0, 0, 0),
    mode: 'chase',
  };
}

// Ease the chase camera behind the aircraft; snap on the first frame.
export function updateCamera(camera, plane, dt, width, height, snap) {
  const h = degToRad(plane.heading);
  const forwardX = Math.sin(h);
  const forwardZ = -Math.cos(h);
  let wantPos;
  let wantLook;
  let roll;
  if (camera.mode === 'cockpit') {
    wantPos = {
      x: plane.x + forwardX * 1.4,
      y: plane.y + 1.1,
      z: plane.z + forwardZ * 1.4,
    };
    wantLook = {
      x: plane.x + forwardX * 60,
      y: plane.y + Math.sin(degToRad(plane.pitch)) * 60,
      z: plane.z + forwardZ * 60,
    };
    roll = plane.roll * 0.85;
  } else {
    wantPos = {
      x: plane.x - forwardX * CAMERA.chaseDistance,
      y: plane.y + CAMERA.chaseHeight,
      z: plane.z - forwardZ * CAMERA.chaseDistance,
    };
    wantLook = {
      x: plane.x + forwardX * 34,
      y: plane.y + 1.5,
      z: plane.z + forwardZ * 34,
    };
    roll = plane.roll * CAMERA.rollFollow;
  }
  const k = snap ? 1 : 1 - Math.exp(-dt * 7);
  camera.pos.x = lerp(camera.pos.x, wantPos.x, k);
  camera.pos.y = lerp(camera.pos.y, wantPos.y, k);
  camera.pos.z = lerp(camera.pos.z, wantPos.z, k);
  camera.look.x = lerp(camera.look.x, wantLook.x, k);
  camera.look.y = lerp(camera.look.y, wantLook.y, k);
  camera.look.z = lerp(camera.look.z, wantLook.z, k);

  // Look direction from camera to its look point, with the plane's roll.
  const dx = camera.look.x - camera.pos.x;
  const dy = camera.look.y - camera.pos.y;
  const dz = camera.look.z - camera.pos.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  const heading = (Math.atan2(dx, -dz) * 180) / Math.PI;
  const pitch = (Math.asin(clamp(dy / len, -1, 1)) * 180) / Math.PI;
  camera.basis = makeBasis(heading, pitch, roll);
  camera.focal = (height / 2) / Math.tan(degToRad(CAMERA.fovDeg / 2));
  camera.width = width;
  camera.height = height;
}

// Project a world point to screen space. Returns null behind the camera.
export function project(camera, p) {
  const dx = p.x - camera.pos.x;
  const dy = p.y - camera.pos.y;
  const dz = p.z - camera.pos.z;
  const { forward, right, up } = camera.basis;
  const z = dx * forward.x + dy * forward.y + dz * forward.z;
  if (z < 0.6) return null;
  const x = dx * right.x + dy * right.y + dz * right.z;
  const y = dx * up.x + dy * up.y + dz * up.z;
  return {
    x: camera.width / 2 + (x / z) * camera.focal,
    y: camera.height / 2 - (y / z) * camera.focal,
    depth: z,
    scale: camera.focal / z,
  };
}

// Project with the depth clamped to the near plane: a quad that
// straddles the camera still fills to the screen edge instead of
// vanishing and leaving a black wedge at the bottom of the frame.
export function projectClamped(camera, p) {
  const dx = p.x - camera.pos.x;
  const dy = p.y - camera.pos.y;
  const dz = p.z - camera.pos.z;
  const { forward, right, up } = camera.basis;
  const zRaw = dx * forward.x + dy * forward.y + dz * forward.z;
  const z = Math.max(zRaw, 0.6);
  const x = dx * right.x + dy * right.y + dz * right.z;
  const y = dx * up.x + dy * up.y + dz * up.z;
  return {
    x: camera.width / 2 + (x / z) * camera.focal,
    y: camera.height / 2 - (y / z) * camera.focal,
    depth: zRaw,
    scale: camera.focal / z,
  };
}

// Where on screen a world point sits, without the depth cut — used for
// the off-screen arrow that points the pilot at the next ring.
export function projectLoose(camera, p) {
  const dx = p.x - camera.pos.x;
  const dy = p.y - camera.pos.y;
  const dz = p.z - camera.pos.z;
  const { forward, right, up } = camera.basis;
  const z = dx * forward.x + dy * forward.y + dz * forward.z;
  const x = dx * right.x + dy * right.y + dz * right.z;
  const y = dx * up.x + dy * up.y + dz * up.z;
  return {
    x: camera.width / 2 + (x / Math.max(z, 1)) * camera.focal,
    y: camera.height / 2 - (y / Math.max(z, 1)) * camera.focal,
    behind: z < 0.6,
  };
}
