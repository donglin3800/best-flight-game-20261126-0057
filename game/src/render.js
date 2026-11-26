// All drawing: sky, sun and clouds, the heightfield terrain, the
// runway, the rings, the trees and village, and the aircraft itself.
// Everything is drawn from the world with the camera in camera.js;
// nothing here is a picture loaded from a file.
import { RING_RADIUS, RUNWAY, TERRAIN, clamp, degToRad, lerp } from './config.js';
import { CLOUDS, HOUSES, TREES, groundColour, groundHeight, isWater } from './terrain.js';
import { project, projectClamped } from './camera.js';

// A safety net under everything: if a frame ever leaves a pixel
// uncovered (a quad clipped by the camera, a banked horizon), it
// reads as dusk meadow, never as black.
export function drawBase(ctx, camera) {
  const w = camera.width;
  const h = camera.height;
  const base = ctx.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, '#2f6fc4');
  base.addColorStop(0.5, '#7fae62');
  base.addColorStop(1, '#3d5c31');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
}

function shade(rgb, light) {
  return `rgb(${Math.min(255, rgb[0] * light) | 0},${Math.min(255, rgb[1] * light) | 0},${Math.min(
    255,
    rgb[2] * light,
  ) | 0})`;
}

export function drawSky(ctx, camera, plane, time, storm) {
  const w = camera.width;
  const h = camera.height;
  const horizonY = h * 0.58;
  const sky = ctx.createLinearGradient(0, 0, 0, horizonY);
  if (storm) {
    sky.addColorStop(0, '#3d4a63');
    sky.addColorStop(0.7, '#6d7a92');
    sky.addColorStop(1, '#9aa3b0');
  } else {
    sky.addColorStop(0, '#2f6fc4');
    sky.addColorStop(0.55, '#6ea8dd');
    sky.addColorStop(1, '#cfe6f5');
  }
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, horizonY + 2);
  // Haze band above the horizon so the terrain melts into the sky.
  const haze = ctx.createLinearGradient(0, horizonY - 60, 0, horizonY + 40);
  haze.addColorStop(0, 'rgba(207,230,245,0)');
  haze.addColorStop(1, 'rgba(207,230,245,0.85)');
  ctx.fillStyle = haze;
  ctx.fillRect(0, horizonY - 60, w, 100);

  // The sun, low in the west, and its glare.
  const sunX = w * 0.2;
  const sunY = h * 0.16;
  const glow = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 130);
  glow.addColorStop(0, 'rgba(255,244,200,0.95)');
  glow.addColorStop(0.25, 'rgba(255,226,150,0.55)');
  glow.addColorStop(1, 'rgba(255,226,150,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sunX - 130, sunY - 130, 260, 260);
  ctx.fillStyle = '#fff6cf';
  ctx.beginPath();
  ctx.arc(sunX, sunY, 26, 0, Math.PI * 2);
  ctx.fill();

  // Distant ridge silhouettes, two layers, for depth behind the terrain.
  drawRidge(ctx, w, horizonY, 0.9, 'rgba(96,128,168,0.55)', time * 0.002);
  drawRidge(ctx, w, horizonY, 0.7, 'rgba(74,102,140,0.7)', time * 0.004 + 40);
}

function drawRidge(ctx, w, horizonY, scale, colour, phase) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(0, horizonY + 2);
  for (let x = 0; x <= w; x += 24) {
    const y =
      horizonY -
      (Math.sin(x * 0.004 + phase) * 0.5 + Math.sin(x * 0.011 + phase * 2.7) * 0.3 + 0.4) *
        74 *
        scale;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, horizonY + 2);
  ctx.closePath();
  ctx.fill();
}

function drawCloud(ctx, camera, cloud, time) {
  const x = cloud.x + time * cloud.drift;
  const p = project(camera, { x, y: cloud.y, z: cloud.z });
  if (!p) return;
  const s = cloud.s * p.scale * 0.55;
  if (s < 4) return;
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  for (const [ox, oy, r] of [
    [0, 0, 1],
    [-0.9, 0.18, 0.62],
    [0.9, 0.22, 0.68],
    [-0.4, -0.3, 0.55],
    [0.5, -0.28, 0.5],
  ]) {
    ctx.beginPath();
    ctx.ellipse(p.x + ox * s, p.y + oy * s, r * s, r * s * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// The terrain: a grid of quads around the aircraft, far rows first,
// each quad two triangles coloured by height, slope and distance fog.
export function drawTerrain(ctx, camera, plane) {
  const cell = TERRAIN.cell;
  const half = TERRAIN.extent / 2;
  const cx = Math.round(plane.x / cell) * cell;
  const cz = Math.round(plane.z / cell) * cell;
  const n = Math.round(TERRAIN.extent / cell);
  const quads = [];
  for (let iz = 0; iz < n; iz += 1) {
    for (let ix = 0; ix < n; ix += 1) {
      const x0 = cx - half + ix * cell;
      const z0 = cz - half + iz * cell;
      const h00 = groundHeight(x0, z0);
      const h10 = groundHeight(x0 + cell, z0);
      const h01 = groundHeight(x0, z0 + cell);
      const h11 = groundHeight(x0 + cell, z0 + cell);
      const mx = x0 + cell / 2;
      const mz = z0 + cell / 2;
      const dx = mx - camera.pos.x;
      const dy = (h00 + h11) / 2 - camera.pos.y;
      const dz = mz - camera.pos.z;
      const depth =
        dx * camera.basis.forward.x + dy * camera.basis.forward.y + dz * camera.basis.forward.z;
      if (depth < 2 || depth > TERRAIN.viewDistance) continue;
      quads.push({ x0, z0, h00, h10, h01, h11, depth, mx, mz });
    }
  }
  quads.sort((a, b) => b.depth - a.depth);
  for (const q of quads) {
    // Clamped projection: a quad that runs under the camera still
    // paints the bottom of the frame instead of dropping out.
    const p00 = projectClamped(camera, { x: q.x0, y: q.h00, z: q.z0 });
    const p10 = projectClamped(camera, { x: q.x0 + cell, y: q.h10, z: q.z0 });
    const p01 = projectClamped(camera, { x: q.x0, y: q.h01, z: q.z0 + cell });
    const p11 = projectClamped(camera, { x: q.x0 + cell, y: q.h11, z: q.z0 + cell });
    const midH = (q.h00 + q.h10 + q.h01 + q.h11) / 4;
    const water = isWater(q.mx, q.mz);
    const base = water ? [58, 128, 178] : groundColour(q.mx, q.mz, midH);
    // Slope shading: faces tilted away from the sun go darker.
    const slopeLight = clamp(1.05 - Math.abs(q.h10 - q.h00) / cell - Math.abs(q.h01 - q.h00) / cell, 0.72, 1.08);
    // Distance fog toward the sky colour.
    const fog = clamp(1 - q.depth / TERRAIN.viewDistance, 0, 1);
    const light = slopeLight * (0.55 + 0.45 * fog);
    const fill = shade(base, light);
    if (water) {
      ctx.fillStyle = `rgba(64,138,190,${0.55 + 0.35 * fog})`;
    } else {
      ctx.fillStyle = fill;
    }
    ctx.beginPath();
    ctx.moveTo(p00.x, p00.y);
    ctx.lineTo(p10.x, p10.y);
    ctx.lineTo(p11.x, p11.y);
    ctx.lineTo(p01.x, p01.y);
    ctx.closePath();
    ctx.fill();
  }
}

// The strip itself: dark asphalt, white centre dashes, threshold bars
// and the numbers, laid a hand's breadth above the flattened ground.
export function drawRunway(ctx, camera) {
  const { centreX, centreZ, halfWidth, halfLength, elevation } = RUNWAY;
  const y = elevation + 0.35;
  const corners = [
    { x: centreX - halfWidth, z: centreZ - halfLength },
    { x: centreX + halfWidth, z: centreZ - halfLength },
    { x: centreX + halfWidth, z: centreZ + halfLength },
    { x: centreX - halfWidth, z: centreZ + halfLength },
  ].map((p) => projectClamped(camera, { x: p.x, y, z: p.z }));
  ctx.fillStyle = '#3a3f46';
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < 4; i += 1) ctx.lineTo(corners[i].x, corners[i].y);
  ctx.closePath();
  ctx.fill();
  // Centre dashes.
  ctx.fillStyle = '#f2f2e8';
  for (let z = -halfLength + 30; z < halfLength - 20; z += 44) {
    const a = projectClamped(camera, { x: -1.2, y: y + 0.05, z });
    const b = projectClamped(camera, { x: 1.2, y: y + 0.05, z });
    const c = projectClamped(camera, { x: 1.2, y: y + 0.05, z: z + 20 });
    const d = projectClamped(camera, { x: -1.2, y: y + 0.05, z: z + 20 });
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fill();
  }
  // Threshold bars at both ends.
  for (const zEnd of [-halfLength + 12, halfLength - 12]) {
    for (const xOff of [-16, -8, 0, 8, 16]) {
      const a = projectClamped(camera, { x: xOff - 2.4, y: y + 0.05, z: zEnd - 6 });
      const b = projectClamped(camera, { x: xOff + 2.4, y: y + 0.05, z: zEnd - 6 });
      const c = projectClamped(camera, { x: xOff + 2.4, y: y + 0.05, z: zEnd + 6 });
      const d = projectClamped(camera, { x: xOff - 2.4, y: y + 0.05, z: zEnd + 6 });
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fill();
    }
  }
}

// A ring: a glowing torus drawn as two projected ellipses, plus its
// number flag. The next ring is gold, later ones are pale blue.
export function drawRing(ctx, camera, ring, index, isNext, time) {
  const centre = project(camera, ring);
  if (!centre) return;
  const right = { x: Math.cos(degToRad(ring.heading ?? 0)), y: 0, z: Math.sin(degToRad(ring.heading ?? 0)) };
  const top = { x: 0, y: 1, z: 0 };
  const edgeR = project(camera, {
    x: ring.x + right.x * RING_RADIUS,
    y: ring.y,
    z: ring.z + right.z * RING_RADIUS,
  });
  const edgeT = project(camera, { x: ring.x, y: ring.y + RING_RADIUS, z: ring.z });
  if (!edgeR || !edgeT) return;
  const rx = Math.abs(edgeR.x - centre.x);
  const ry = Math.abs(edgeT.y - centre.y);
  if (rx < 3 || ry < 3) return;
  const pulse = isNext ? 0.75 + Math.sin(time * 5) * 0.25 : 0.5;
  ctx.lineWidth = Math.max(2, rx * 0.09);
  ctx.strokeStyle = isNext
    ? `rgba(255,196,0,${pulse})`
    : 'rgba(150,205,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(centre.x, centre.y, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = Math.max(1, rx * 0.03);
  ctx.strokeStyle = isNext ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.ellipse(centre.x, centre.y, rx * 0.86, ry * 0.86, 0, 0, Math.PI * 2);
  ctx.stroke();
  // Number flag above the ring.
  if (centre.depth < 900) {
    ctx.font = `bold ${Math.max(12, Math.round(ry * 0.32))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = isNext ? '#ffdf4d' : '#cfe8ff';
    ctx.fillText(String(index + 1), centre.x, centre.y - ry - 10);
  }
}

export function drawTrees(ctx, camera, plane) {
  for (const tree of TREES) {
    const dx = tree.x - plane.x;
    const dz = tree.z - plane.z;
    const distSq = dx * dx + dz * dz;
    if (distSq > 420 * 420) continue;
    const y = groundHeight(tree.x, tree.z);
    const base = project(camera, { x: tree.x, y, z: tree.z });
    const top = project(camera, { x: tree.x, y: y + 11 * tree.s, z: tree.z });
    if (!base || !top) continue;
    const h = base.y - top.y;
    if (h < 2) continue;
    const w = h * 0.42;
    ctx.fillStyle = '#2c5e33';
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(base.x - w, base.y);
    ctx.lineTo(base.x + w, base.y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#5a3d24';
    ctx.fillRect(base.x - 1, base.y - h * 0.16, 2, h * 0.16);
  }
}

export function drawHouses(ctx, camera, plane) {
  for (const house of HOUSES) {
    const dx = house.x - plane.x;
    const dz = house.z - plane.z;
    if (dx * dx + dz * dz > 520 * 520) continue;
    // Real 3D corners: four at the eaves, four at the ground, so the
    // house reads as a box with a pitched roof, not a flat tile.
    const hw = house.w / 2;
    const hd = house.d / 2;
    const cos = Math.cos(house.rot);
    const sin = Math.sin(house.rot);
    const corner = (lx, lz, ly) => {
      const x = house.x + lx * cos - lz * sin;
      const z = house.z + lx * sin + lz * cos;
      return project(camera, { x, y: house.y + ly, z });
    };
    const g = [corner(-hw, -hd, 0), corner(hw, -hd, 0), corner(hw, hd, 0), corner(-hw, hd, 0)];
    const e = [corner(-hw, -hd, house.h), corner(hw, -hd, house.h), corner(hw, hd, house.h), corner(-hw, hd, house.h)];
    const ridge = [corner(0, -hd, house.h + 3.2), corner(0, hd, house.h + 3.2)];
    if ([...g, ...e, ...ridge].some((p) => !p)) continue;
    const quad = (a, b, c, d, fill) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fill();
    };
    // Walls: the two faces toward the camera.
    quad(g[1], g[2], e[2], e[1], '#e8dcc0');
    quad(g[2], g[3], e[3], e[2], '#d9cbae');
    // Roof: two slopes meeting at the ridge.
    quad(e[0], ridge[0], ridge[1], e[3], house.roof);
    quad(e[1], e[2], ridge[1], ridge[0], house.roof);
  }
}

export function drawClouds(ctx, camera, time) {
  for (const cloud of CLOUDS) drawCloud(ctx, camera, cloud, time);
}

// The aircraft, drawn as a built machine: fuselage, wings, tail,
// spinning prop and navigation lights, banking with the roll.
export function drawPlane(ctx, camera, plane, time) {
  const p = project(camera, { x: plane.x, y: plane.y, z: plane.z });
  if (!p) return;
  // True scale: an 11 m wingspan and an 8.5 m fuselage at this depth.
  const span = 11 * p.scale;
  const len = 8.5 * p.scale;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(degToRad(-plane.roll * 0.9));
  // A faint shadow where the wing meets the fuselage.
  ctx.fillStyle = 'rgba(0,0,0,0.07)';
  ctx.beginPath();
  ctx.ellipse(0, len * 0.12, span * 0.44, len * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  // Wings: high wing with red tips.
  ctx.fillStyle = '#dfe6ec';
  ctx.beginPath();
  ctx.moveTo(-span / 2, 0);
  ctx.lineTo(-span * 0.12, -len * 0.1);
  ctx.lineTo(span * 0.12, -len * 0.1);
  ctx.lineTo(span / 2, 0);
  ctx.lineTo(span * 0.16, len * 0.16);
  ctx.lineTo(-span * 0.16, len * 0.16);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#c33';
  ctx.fillRect(-span / 2, -len * 0.02, span * 0.07, len * 0.1);
  ctx.fillRect(span / 2 - span * 0.07, -len * 0.02, span * 0.07, len * 0.1);
  // Tailplane and fin.
  ctx.fillStyle = '#c8d2da';
  ctx.beginPath();
  ctx.moveTo(-span * 0.24, len * 0.42);
  ctx.lineTo(span * 0.24, len * 0.42);
  ctx.lineTo(span * 0.14, len * 0.52);
  ctx.lineTo(-span * 0.14, len * 0.52);
  ctx.closePath();
  ctx.fill();
  // Fuselage: cream with a red cheatline and windows.
  const body = ctx.createLinearGradient(0, -len * 0.55, 0, len * 0.55);
  body.addColorStop(0, '#f4ede0');
  body.addColorStop(0.5, '#e8dcc8');
  body.addColorStop(1, '#cbb896');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, 0, span * 0.085, len * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#b02a2a';
  ctx.lineWidth = Math.max(1.5, span * 0.012);
  ctx.beginPath();
  ctx.moveTo(-span * 0.07, -len * 0.08);
  ctx.lineTo(span * 0.07, -len * 0.08);
  ctx.stroke();
  // Canopy glass.
  ctx.fillStyle = '#7fb2d9';
  ctx.beginPath();
  ctx.ellipse(0, -len * 0.22, span * 0.055, len * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(-span * 0.02, -len * 0.26, span * 0.02, len * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();
  // Spinning prop disc at the nose.
  const propR = span * 0.16;
  ctx.fillStyle = 'rgba(40,40,40,0.28)';
  ctx.beginPath();
  ctx.ellipse(0, -len * 0.55, propR, propR * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2c2c2c';
  ctx.beginPath();
  ctx.arc(0, -len * 0.55, Math.max(2, span * 0.02), 0, Math.PI * 2);
  ctx.fill();
  // Navigation lights: red left, green right, white tail strobe.
  const blink = Math.sin(time * 6) > 0 ? 1 : 0.25;
  ctx.fillStyle = `rgba(255,60,60,${blink})`;
  ctx.beginPath();
  ctx.arc(-span / 2, 0, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(60,255,120,${blink})`;
  ctx.beginPath();
  ctx.arc(span / 2, 0, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// The aircraft's shadow on the ground below it.
export function drawPlaneShadow(ctx, camera, plane) {
  const ground = groundHeight(plane.x, plane.z);
  const p = project(camera, { x: plane.x, y: ground + 0.4, z: plane.z });
  if (!p) return;
  const heightAbove = Math.max(1, plane.y - ground);
  const alpha = clamp(0.34 - heightAbove / 900, 0.04, 0.34);
  const r = clamp(900 / heightAbove, 6, 60);
  ctx.fillStyle = `rgba(10,20,10,${alpha})`;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, r * 1.9, r * 0.55, degToRad(-plane.roll * 0.5), 0, Math.PI * 2);
  ctx.fill();
}
