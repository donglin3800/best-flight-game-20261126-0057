// Instruments and HUD: the panel is drawn, not a picture — the
// artificial horizon, the airspeed and altitude tapes, the compass,
// fuel and throttle, and the mission HUD on top of the world.
import { formatTime, mToFeet, msToKnots, wrapAngleDeg } from './config.js';
import { projectLoose } from './camera.js';

function panel(ctx, x, y, w, h, radius = 10) {
  ctx.fillStyle = 'rgba(12,16,22,0.82)';
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fill();
  ctx.stroke();
}

function label(ctx, text, x, y, size = 11, colour = '#9fb2c8') {
  ctx.fillStyle = colour;
  ctx.font = `${size}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(text, x, y);
}

function value(ctx, text, x, y, size = 20, colour = '#f2f6fa') {
  ctx.fillStyle = colour;
  ctx.font = `600 ${size}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(text, x, y);
}

// Artificial horizon: sky and ground roll with the aircraft, the
// pitch ladder slides with pitch, the wings stay fixed to the panel.
export function drawHorizon(ctx, cx, cy, r, plane) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate((-plane.roll * Math.PI) / 180);
  const pitchPx = (plane.pitch / 90) * r * 1.6;
  ctx.fillStyle = '#3f7fc9';
  ctx.fillRect(-r - 2, -r - 2 - pitchPx, r * 2 + 4, r + 2 + pitchPx);
  ctx.fillStyle = '#7a5230';
  ctx.fillRect(-r - 2, pitchPx, r * 2 + 4, r + 2);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillRect(-r, pitchPx - 1, r * 2, 2);
  // Pitch ladder rungs every 10 degrees.
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 1.5;
  for (const deg of [-20, -10, 10, 20]) {
    const y = pitchPx - (deg / 90) * r * 1.6;
    const w = deg % 20 === 0 ? r * 0.44 : r * 0.28;
    ctx.beginPath();
    ctx.moveTo(-w, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.restore();
  // Fixed wings and the bezel.
  ctx.strokeStyle = '#ffd34d';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.62, cy);
  ctx.lineTo(cx - r * 0.18, cy);
  ctx.moveTo(cx + r * 0.18, cy);
  ctx.lineTo(cx + r * 0.62, cy);
  ctx.stroke();
  ctx.fillStyle = '#ffd34d';
  ctx.beginPath();
  ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  label(ctx, 'ATT', cx, cy + r + 16);
}

function drawTape(ctx, x, y, w, h, title, unit, major, format) {
  panel(ctx, x, y, w, h);
  label(ctx, title, x + w / 2, y + 16);
  value(ctx, format.major, x + w / 2, y + 44, 22);
  label(ctx, unit, x + w / 2, y + 62, 10);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 4, y + 70, w - 8, h - 78);
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.fillStyle = '#c8d6e2';
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  for (const tick of format.ticks) {
    const ty = y + h / 2 + 8 - tick.offset;
    if (ty < y + 72 || ty > y + h - 6) continue;
    ctx.beginPath();
    ctx.moveTo(x + 8, ty);
    ctx.lineTo(x + 16, ty);
    ctx.stroke();
    ctx.fillText(tick.text, x + 20, ty + 4);
  }
  ctx.restore();
  // Centre marker.
  ctx.fillStyle = '#ffd34d';
  ctx.beginPath();
  ctx.moveTo(x + w, y + h / 2);
  ctx.lineTo(x + w - 8, y + h / 2 - 5);
  ctx.lineTo(x + w - 8, y + h / 2 + 5);
  ctx.closePath();
  ctx.fill();
}

function tapeTicks(current, step, count, pxPerUnit) {
  const ticks = [];
  const base = Math.floor(current / step) * step;
  for (let i = -count; i <= count; i += 1) {
    const v = base + i * step;
    if (v < 0) continue;
    ticks.push({ text: String(v), offset: (v - current) * pxPerUnit });
  }
  return ticks;
}

// The bottom instrument panel: horizon centre, speed left, altitude
// right, vertical speed, fuel and throttle at the edges.
export function drawPanel(ctx, w, h, plane, state) {
  const panelH = 148;
  const y0 = h - panelH - 10;
  const cx = w / 2;
  panel(ctx, 10, y0, w - 20, panelH, 12);
  // Artificial horizon.
  drawHorizon(ctx, cx, y0 + 66, 52, plane);
  // Airspeed tape.
  const knots = msToKnots(plane.speed);
  drawTape(ctx, 24, y0 + 8, 92, panelH - 16, 'AIRSPEED', 'KT', 10, {
    major: String(Math.round(knots)),
    ticks: tapeTicks(knots, 10, 5, 2.2),
  });
  // Altitude tape.
  const feet = mToFeet(plane.y);
  drawTape(ctx, w - 116, y0 + 8, 92, panelH - 16, 'ALTITUDE', 'FT', 100, {
    major: String(Math.round(feet)),
    ticks: tapeTicks(feet, 100, 5, 0.22),
  });
  // Vertical speed, left of the horizon.
  const vs = plane.verticalSpeed * 196.85; // ft/min
  label(ctx, 'V/S', cx - 108, y0 + 26);
  value(ctx, `${vs >= 0 ? '+' : ''}${Math.round(vs)}`, cx - 108, y0 + 52, 17, vs < -600 ? '#ff9a7a' : '#f2f6fa');
  label(ctx, 'FT/MIN', cx - 108, y0 + 68, 9);
  // Fuel and throttle, right of the horizon.
  const fuelX = cx + 108;
  label(ctx, 'FUEL', fuelX, y0 + 26);
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(fuelX - 34, y0 + 36, 68, 10);
  ctx.fillStyle = plane.fuel < 20 ? '#e05252' : '#57b25e';
  ctx.fillRect(fuelX - 34, y0 + 36, 68 * (plane.fuel / 100), 10);
  value(ctx, `${Math.round(plane.fuel)}%`, fuelX, y0 + 70, 15);
  label(ctx, 'THROTTLE', fuelX, y0 + 92);
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(fuelX - 34, y0 + 100, 68, 10);
  ctx.fillStyle = '#4d9de0';
  ctx.fillRect(fuelX - 34, y0 + 100, 68 * plane.throttle, 10);
  // Gear and flaps lamps.
  const lamp = (x, text, on, colour) => {
    ctx.fillStyle = on ? colour : 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.arc(x, y0 + panelH - 18, 6, 0, Math.PI * 2);
    ctx.fill();
    label(ctx, text, x, y0 + panelH - 4, 9, on ? '#f2f6fa' : '#7d8b9a');
  };
  lamp(cx - 150, 'GEAR', plane.gearDown, '#57b25e');
  lamp(cx - 118, 'FLAPS', plane.flaps, '#4d9de0');
  lamp(cx + 118, 'STALL', state.stall, '#e05252');
  lamp(cx + 150, 'FUEL LOW', plane.fuel < 20, '#e05252');
  // Stall warning text.
  if (state.stall) {
    ctx.fillStyle = '#ff6b5e';
    ctx.font = '700 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('STALL — LOWER THE NOSE', cx, y0 - 12);
  }
}

// Compass tape across the top, with the heading bug at the centre.
export function drawCompass(ctx, w, plane) {
  const y = 26;
  const cx = w / 2;
  panel(ctx, cx - 190, y - 6, 380, 34, 8);
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - 186, y - 2, 372, 26);
  ctx.clip();
  const pxPerDeg = 3.2;
  for (let deg = 0; deg < 360; deg += 5) {
    const rel = wrapAngleDeg(deg - plane.heading);
    if (Math.abs(rel) > 58) continue;
    const x = cx + rel * pxPerDeg;
    const major = deg % 30 === 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.moveTo(x, y + (major ? 2 : 8));
    ctx.lineTo(x, y + 16);
    ctx.stroke();
    if (major) {
      ctx.fillStyle = '#e8eef4';
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      const names = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
      ctx.fillText(names[deg] ?? String(deg / 10), x, y + 26 - 2);
    }
  }
  ctx.restore();
  ctx.fillStyle = '#ffd34d';
  ctx.beginPath();
  ctx.moveTo(cx, y + 28);
  ctx.lineTo(cx - 6, y + 20);
  ctx.lineTo(cx + 6, y + 20);
  ctx.closePath();
  ctx.fill();
  value(ctx, String(Math.round(((plane.heading % 360) + 360) % 360)).padStart(3, '0'), cx, y - 12, 13, '#ffd34d');
}

// Top-left mission block, top-right score block, centre messages.
export function drawHud(ctx, w, h, plane, mission, progress, message, timeLeft) {
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f2f6fa';
  ctx.font = '700 17px system-ui, sans-serif';
  ctx.fillText(mission.name.toUpperCase(), 18, 30);
  ctx.fillStyle = '#c8d6e2';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText(progress.objective, 18, 50);
  ctx.fillText(`Rings ${progress.ringsDone}/${progress.ringsTotal}`, 18, 70);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#f2f6fa';
  ctx.font = '700 17px system-ui, sans-serif';
  ctx.fillText(`SCORE ${progress.score}`, w - 18, 30);
  ctx.fillStyle = '#c8d6e2';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText(`TIME ${formatTime(timeLeft)}`, w - 18, 50);
  ctx.fillText(`BEST ${progress.best}`, w - 18, 70);
  if (message && message.until > performance.now()) {
    ctx.textAlign = 'center';
    ctx.font = '700 22px system-ui, sans-serif';
    ctx.fillStyle = message.colour ?? '#ffe9a8';
    ctx.fillText(message.text, w / 2, h * 0.24);
    if (message.sub) {
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillStyle = '#e8eef4';
      ctx.fillText(message.sub, w / 2, h * 0.24 + 24);
    }
  }
}

// Arrow at the screen edge pointing at the next ring when it is
// off-screen, with the distance in metres.
export function drawRingPointer(ctx, camera, ring, plane) {
  if (!ring) return;
  const p = projectLoose(camera, ring);
  const dist = Math.hypot(ring.x - plane.x, ring.y - plane.y, ring.z - plane.z);
  const onScreen = !p.behind && p.x > 70 && p.x < camera.width - 70 && p.y > 90 && p.y < camera.height - 190;
  if (onScreen) return;
  const cx = camera.width / 2;
  const cy = camera.height / 2 - 40;
  const angle = Math.atan2(p.y - cy, p.x - cx);
  const ex = cx + Math.cos(angle) * 150;
  const ey = cy + Math.sin(angle) * 110;
  ctx.save();
  ctx.translate(ex, ey);
  ctx.rotate(angle);
  ctx.fillStyle = '#ffcf3d';
  ctx.beginPath();
  ctx.moveTo(16, 0);
  ctx.lineTo(-10, -11);
  ctx.lineTo(-4, 0);
  ctx.lineTo(-10, 11);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#ffdf4d';
  ctx.font = '700 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.round(dist)} m`, ex, ey + 30);
}
