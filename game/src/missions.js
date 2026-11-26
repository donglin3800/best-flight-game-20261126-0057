// Missions: ring courses, scoring, landings, fuel and the clock.
// One mission object owns the sortie's progress; the flight model
// owns the aircraft. A ring counts when the aircraft passes within
// its radius; a centre pass (within a third of the radius) pays double.
import { CENTRE_BONUS, LANDING_SCORE, RING_RADIUS, RING_SCORE, RUNWAY } from './config.js';
import { ringCourse } from './terrain.js';
import { freshPlane } from './physics.js';

export function startMission(mission) {
  const course = ringCourse(mission.id);
  return {
    def: mission,
    plane: freshPlane(mission),
    rings: course.map((pos, i) => ({
      ...pos,
      heading: 0,
      done: false,
      index: i,
      refuel: mission.id === 'courier' && i % 2 === 1,
    })),
    ringIndex: 0,
    ringsDone: 0,
    score: 0,
    timeLeft: mission.timeLimit,
    elapsed: 0,
    status: 'flying', // flying | landed | crashed | done
    crashCause: '',
    landingQuality: null,
    best: 0,
    message: null,
    messageUntil: 0,
  };
}

export function nextRing(state) {
  return state.rings[state.ringIndex] ?? null;
}

export function objectiveText(state) {
  if (state.status === 'crashed') return state.crashCause;
  if (state.status === 'landed' || state.status === 'done') return 'Sortie complete — press R to fly again';
  const ring = nextRing(state);
  if (state.def.id === 'landing' && state.ringsDone >= state.rings.length) {
    return 'Circuit complete — land on the strip, gear down';
  }
  if (state.def.id === 'courier' && state.ringsDone >= state.rings.length) {
    return 'Mail delivered — put down at the far strip';
  }
  if (ring) return `Fly through ring ${state.ringIndex + 1} — ${ring.refuel ? 'green refuel ring' : 'gold ring'}`;
  return 'Land on the strip';
}

function showMessage(state, text, sub, colour) {
  state.message = { text, sub: sub ?? '', colour: colour ?? '#ffe9a8', until: performance.now() + 2600 };
}

// Called every frame while flying: rings, fuel, the clock, landings.
export function updateMission(state, events, audio, dt) {
  const plane = state.plane;
  if (state.status !== 'flying') return;
  state.elapsed += dt;
  state.timeLeft = Math.max(0, state.timeLeft - dt);
  if (state.timeLeft <= 0) {
    state.status = 'crashed';
    state.crashCause = 'Out of time — the sortie window closed';
    audio.crash();
    return;
  }
  if (plane.fuel <= 0 && plane.speed < 8 && plane.onGround) {
    state.status = 'crashed';
    state.crashCause = 'Out of fuel on the ground — the mail never arrived';
    return;
  }

  for (const event of events) {
    if (event === 'crash') {
      state.status = 'crashed';
      const ground = plane.y < 130 ? 'Terrain' : 'The aircraft';
      state.crashCause = plane.speed > 62 ? 'Too fast on arrival — the airframe broke up' : `${ground} got in the way`;
      if (plane.fuel <= 0) state.crashCause = 'Out of fuel — glided into the ridge';
      audio.crash();
      return;
    }
    if (event === 'takeoff') {
      showMessage(state, 'AIRBORNE', 'Gear up when you are ready — G toggles the gear');
    }
    if (event === 'touchdown') {
      handleTouchdown(state, audio);
      if (state.status !== 'flying') return;
    }
    if (event === 'fuel-empty') {
      showMessage(state, 'FUEL EMPTY', 'Throttle dead — glide her down gently', '#ff9a7a');
    }
  }

  // Ring passes: distance from the aircraft to the ring centre.
  const ring = nextRing(state);
  if (ring) {
    const dx = plane.x - ring.x;
    const dy = plane.y - ring.y;
    const dz = plane.z - ring.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < RING_RADIUS) {
      ring.done = true;
      state.ringIndex += 1;
      state.ringsDone += 1;
      const centre = dist < RING_RADIUS / 3;
      const points = RING_SCORE + (centre ? CENTRE_BONUS : 0);
      state.score += points;
      if (ring.refuel) {
        plane.fuel = Math.min(100, plane.fuel + 34);
        showMessage(state, `REFUEL +34%`, `Ring ${ring.index + 1} cleared — ${centre ? 'dead centre! ' : ''}+${points} pts`, '#8fe3a0');
      } else {
        showMessage(
          state,
          centre ? 'DEAD CENTRE!' : `RING ${ring.index + 1} CLEAR`,
          `+${points} pts — ${state.rings.length - state.ringsDone} to go`,
        );
      }
      audio.ring(centre);
      if (state.ringsDone >= state.rings.length && state.def.id === 'rings') {
        finishSortie(state, audio, 'All rings cleared');
      }
    }
  }
}

function handleTouchdown(state, audio) {
  const plane = state.plane;
  audio.touchdown();
  const onStrip = Math.abs(plane.x) < 26 && Math.abs(plane.z) < 268;
  const slow = plane.speed < 48;
  const gentle = -plane.verticalSpeed < 4;
  if (state.def.id === 'landing' && state.ringsDone >= state.rings.length && onStrip && slow && gentle) {
    finishSortie(state, audio, 'Perfect landing');
    return;
  }
  if (state.def.id === 'courier' && state.ringsDone >= state.rings.length) {
    const farStrip = Math.abs(plane.x - 60) < 30 && Math.abs(plane.z - 1480) < 268;
    if (farStrip && slow && gentle) {
      finishSortie(state, audio, 'Mail delivered');
      return;
    }
  }
  if (state.def.id === 'rings' && state.ringsDone >= state.rings.length && onStrip) {
    finishSortie(state, audio, 'Home on the strip');
    return;
  }
  // Any other touchdown is just a landing — or a bounce. Keep flying
  // if there is still strip ahead and speed to lift off again.
  if (onStrip && plane.speed > 12) {
    showMessage(state, 'TOUCHDOWN', 'Rolling — throttle up to go around or brake to stop', '#cfe8ff');
  }
}

function finishSortie(state, audio, why) {
  const plane = state.plane;
  const timeBonus = Math.round(state.timeLeft) * 2;
  const fuelBonus = Math.round(plane.fuel);
  state.score += LANDING_SCORE + timeBonus + fuelBonus;
  state.status = 'done';
  state.landingQuality = {
    why,
    timeBonus,
    fuelBonus,
    score: state.score,
    time: state.elapsed,
  };
  showMessage(state, why.toUpperCase(), `Landing +${LANDING_SCORE} · Time +${timeBonus} · Fuel +${fuelBonus}`, '#8fe3a0');
  audio.ring(false);
}
