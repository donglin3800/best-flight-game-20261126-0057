// Aurora Ridge — boot, the frame loop, and the screens.
// ?shot=start|play|ring|land&seed=1 freezes one deterministic scene
// for the screenshots; without it the game plays live.
import { MISSIONS, formatTime, msToKnots, mToFeet } from './config.js';
import { makeCamera, updateCamera } from './camera.js';
import { stepFlight } from './physics.js';
import { makeInput } from './input.js';
import { makeAudio } from './audio.js';
import { drawCompass, drawHud, drawPanel, drawRingPointer } from './instruments.js';
import {
  drawBase,
  drawClouds,
  drawHouses,
  drawPlane,
  drawPlaneShadow,
  drawRing,
  drawRunway,
  drawSky,
  drawTerrain,
  drawTrees,
} from './render.js';
import { nextRing, objectiveText, startMission, updateMission } from './missions.js';
import { missionForShot, stageShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seed = Number(params.get('seed') ?? 1) || 1;

const input = makeInput(canvas);
const audio = makeAudio();
const camera = makeCamera();

let screen = 'title'; // title | play | pause | over | done
let missionIndex = 0;
let state = startMission(MISSIONS[0]);
let best = Number(window.localStorage?.getItem('aurora-ridge-best') ?? 0) || 0;
let time = 0;
let lastNow = performance.now();
let stalled = false;
let shotFrozen = false;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

function setScreen(next) {
  screen = next;
  input.clearPressed();
  if (next === 'title') {
    state = startMission(MISSIONS[missionIndex]);
    state.best = best;
  }
}

function startSelectedMission() {
  audio.start();
  audio.click();
  state = startMission(MISSIONS[missionIndex]);
  state.best = best;
  setScreen('play');
  updateCamera(camera, state.plane, 0, canvas.width, canvas.height, true);
}

function finishScreen() {
  if (state.score > best) {
    best = state.score;
    try {
      window.localStorage.setItem('aurora-ridge-best', String(best));
    } catch {
      // Private mode: the best score just lives for this session.
    }
  }
  state.best = best;
}

function renderWorld() {
  const plane = state.plane;
  const storm = state.def.id === 'courier';
  drawBase(ctx, camera);
  drawSky(ctx, camera, plane, time, storm);
  drawTerrain(ctx, camera, plane);
  drawRunway(ctx, camera);
  drawHouses(ctx, camera, plane);
  drawTrees(ctx, camera, plane);
  drawClouds(ctx, camera, time);
  drawPlaneShadow(ctx, camera, plane);
  for (let i = 0; i < state.rings.length; i += 1) {
    const ring = state.rings[i];
    if (!ring.done) drawRing(ctx, camera, ring, i, i === state.ringIndex, time);
  }
  if (camera.mode !== 'cockpit') drawPlane(ctx, camera, plane, time);
}

function renderHud() {
  const plane = state.plane;
  drawCompass(ctx, canvas.width, plane);
  drawHud(ctx, canvas.width, canvas.height, plane, state.def, {
    objective: objectiveText(state),
    ringsDone: state.ringsDone,
    ringsTotal: state.rings.length,
    score: state.score,
    best,
  }, state.message, state.timeLeft);
  drawRingPointer(ctx, camera, nextRing(state), plane);
  // In the cockpit the cowling is drawn first, so the panel sits on
  // top of it instead of hiding behind it.
  if (camera.mode === 'cockpit') drawCockpitFrame();
  drawPanel(ctx, canvas.width, canvas.height, plane, { stall: stalled });
}

// The cockpit view: cowling at the bottom and a windscreen frame,
// so the panel reads as a flown cockpit rather than a flat overlay.
function drawCockpitFrame() {
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = '#20242a';
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, h * 0.82);
  ctx.quadraticCurveTo(w * 0.5, h * 0.68, w, h * 0.82);
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#31363d';
  ctx.fillRect(0, h * 0.82 - 6, w, 6);
  ctx.fillStyle = 'rgba(127,178,217,0.16)';
  ctx.fillRect(0, 0, w, 4);
}

function renderTitle() {
  renderWorld();
  // Dim the world a little so the title reads.
  ctx.fillStyle = 'rgba(8,14,24,0.45)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const cx = canvas.width / 2;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffe9a8';
  ctx.font = '700 54px system-ui, sans-serif';
  ctx.fillText('AURORA RIDGE', cx, 108);
  ctx.fillStyle = '#e8eef4';
  ctx.font = '20px system-ui, sans-serif';
  ctx.fillText('A valley flight game — rings, ridges and one short strip', cx, 142);
  // Mission cards.
  const cardW = 300;
  const cardH = 168;
  const gap = 24;
  const totalW = cardW * 3 + gap * 2;
  const y0 = 190;
  MISSIONS.forEach((mission, i) => {
    const x = cx - totalW / 2 + i * (cardW + gap);
    const selected = i === missionIndex;
    ctx.fillStyle = selected ? 'rgba(255,207,61,0.16)' : 'rgba(12,16,22,0.78)';
    ctx.strokeStyle = selected ? '#ffcf3d' : 'rgba(255,255,255,0.25)';
    ctx.lineWidth = selected ? 3 : 1;
    ctx.beginPath();
    ctx.roundRect(x, y0, cardW, cardH, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffd34d';
    ctx.font = '700 15px system-ui, sans-serif';
    ctx.fillText(`[${mission.key}] ${mission.name.toUpperCase()}`, cx - totalW / 2 + i * (cardW + gap) + cardW / 2, y0 + 32);
    // Card body text is left-aligned inside the card; wrapText centres
    // on its x, so it is given the card's centre, not its left edge.
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e8eef4';
    ctx.font = '14px system-ui, sans-serif';
    wrapText(mission.tagline, x + 18, y0 + 58, cardW - 36, 20);
    ctx.fillStyle = '#9fb2c8';
    ctx.font = '12px system-ui, sans-serif';
    wrapText(mission.briefing, x + 18, y0 + 96, cardW - 36, 16);
    ctx.textAlign = 'center';
  });
  ctx.fillStyle = '#f2f6fa';
  ctx.font = '600 16px system-ui, sans-serif';
  ctx.fillText('Press 1, 2 or 3 to pick a sortie — Enter to take off', cx, y0 + cardH + 36);
  ctx.fillStyle = '#c8d6e2';
  ctx.font = '14px system-ui, sans-serif';
  const controls = [
    'Arrows / WASD — pitch and roll      Shift / Ctrl — throttle up / down',
    'G — gear      F — flaps      C — cockpit / chase camera      M — sound',
    'Mouse drag — steer      P — pause      R — restart      H — help',
  ];
  controls.forEach((line, i) => ctx.fillText(line, cx, y0 + cardH + 64 + i * 22));
  if (best > 0) {
    ctx.fillStyle = '#ffd34d';
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.fillText(`Best score so far: ${best}`, cx, y0 + cardH + 142);
  }
  ctx.fillStyle = '#9fb2c8';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('Aurora Ridge is an original game. Fly the valley, mind the ridges, bring her home.', cx, canvas.height - 24);
}

function wrapText(text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
}

function renderCentreCard(title, lines, accent) {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2 - 40;
  ctx.fillStyle = 'rgba(8,14,24,0.82)';
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(cx - 260, cy - 110, 520, 220, 14);
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = accent;
  ctx.font = '700 30px system-ui, sans-serif';
  ctx.fillText(title, cx, cy - 58);
  ctx.fillStyle = '#e8eef4';
  ctx.font = '16px system-ui, sans-serif';
  lines.forEach((line, i) => ctx.fillText(line, cx, cy - 18 + i * 26));
  ctx.fillStyle = '#9fb2c8';
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillText('Press R to fly again — T for the title screen', cx, cy + 84);
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (screen === 'title') {
    renderTitle();
    return;
  }
  renderWorld();
  renderHud();
  if (screen === 'pause') {
    ctx.fillStyle = 'rgba(8,14,24,0.5)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    renderCentreCard('PAUSED', ['The valley waits. Take a breath, pilot.'], '#c8d6e2');
  } else if (screen === 'over') {
    renderCentreCard('CRASHED', [state.crashCause, `Score ${state.score} · Best ${best}`], '#ff6b5e');
  } else if (screen === 'done') {
    const q = state.landingQuality;
    renderCentreCard('SORTIE COMPLETE', [
      q ? q.why : 'Well flown',
      `Score ${state.score} · Best ${best}`,
      `Time ${formatTime(q?.time ?? 0)} · Rings ${state.ringsDone}/${state.rings.length}`,
    ], '#8fe3a0');
  }
}

function frame(now) {
  const dt = Math.min(0.05, (now - lastNow) / 1000);
  lastNow = now;
  time += dt;
  input.poll();

  // Global keys.
  if (input.wasPressed('KeyM')) audio.setMuted(!audio.muted);
  if (input.wasPressed('KeyC')) {
    camera.mode = camera.mode === 'chase' ? 'cockpit' : 'chase';
  }
  if (input.wasPressed('KeyR') && screen !== 'title') {
    state = startMission(MISSIONS[missionIndex]);
    state.best = best;
    setScreen('play');
    updateCamera(camera, state.plane, 0, canvas.width, canvas.height, true);
  }
  if (input.wasPressed('KeyT') && screen !== 'title') setScreen('title');

  if (screen === 'title') {
    // Parked aircraft, idling: keep the world alive behind the title.
    const plane = state.plane;
    plane.throttle = 0.22;
    stepFlight(plane, { pitch: 0, roll: 0, throttle: 0 }, dt);
    plane.throttle = 0;
    for (const [code, i] of [['Digit1', 0], ['Digit2', 1], ['Digit3', 2], ['Numpad1', 0], ['Numpad2', 1], ['Numpad3', 2]]) {
      if (input.wasPressed(code)) {
        missionIndex = i;
        audio.start();
        audio.click();
      }
    }
    if (input.wasPressed('Enter') || input.wasPressed('Space')) startSelectedMission();
    updateCamera(camera, plane, dt, canvas.width, canvas.height, false);
    render();
    statusEl.textContent = 'Aurora Ridge title screen. Choose a mission and press Enter to take off.';
  } else if (screen === 'play') {
    const plane = state.plane;
    if (input.wasPressed('KeyP')) {
      setScreen('pause');
    } else {
      if (input.wasPressed('KeyG')) {
        plane.gearDown = !plane.gearDown;
        audio.click();
      }
      if (input.wasPressed('KeyF')) {
        plane.flaps = !plane.flaps;
        audio.click();
      }
      const events = stepFlight(plane, input, dt);
      stalled = events.includes('stall');
      updateMission(state, events, audio, dt);
      audio.update(plane, stalled);
      if (state.status === 'crashed') {
        finishScreen();
        setScreen('over');
      } else if (state.status === 'done' || state.status === 'landed') {
        finishScreen();
        setScreen('done');
      }
      updateCamera(camera, plane, dt, canvas.width, canvas.height, false);
      render();
      const ring = nextRing(state);
      statusEl.textContent =
        `Flying ${state.def.name}. Speed ${Math.round(msToKnots(plane.speed))} knots, ` +
        `altitude ${Math.round(mToFeet(plane.y))} feet, ` +
        `${ring ? `${state.ringsDone + 1} of ${state.rings.length} rings` : 'land on the strip'}.`;
    }
  } else if (screen === 'pause') {
    if (input.wasPressed('KeyP') || input.wasPressed('Escape')) setScreen('play');
    render();
  } else {
    // over / done: the world stays put behind the card.
    render();
  }

  if (!shotFrozen) requestAnimationFrame(frame);
}

// Screenshot mode: stage one deterministic scene, draw it once.
if (shotName) {
  const mission = missionForShot(seed);
  const staged = stageShot(shotName, mission);
  state = staged.state;
  state.best = best;
  screen = staged.screen;
  if (staged.cameraMode) camera.mode = staged.cameraMode;
  if (staged.message) state.message = staged.message;
  updateCamera(camera, state.plane, 0, canvas.width, canvas.height, true);
  // Let the fonts settle, then draw a single frozen frame.
  shotFrozen = true;
  requestAnimationFrame(() => {
    render();
    document.title = `Aurora Ridge — ${shotName}`;
  });
} else {
  updateCamera(camera, state.plane, 0, canvas.width, canvas.height, true);
  requestAnimationFrame(frame);
}
