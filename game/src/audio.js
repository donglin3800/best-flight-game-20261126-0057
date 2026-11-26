// Synthesised sound: no audio files are shipped. An engine drone
// whose pitch follows the throttle, wind noise that grows with speed,
// and short cues for rings, touchdowns, stalls and crashes.
export function makeAudio() {
  const audio = {
    ctx: null,
    muted: false,
    engineOsc: null,
    engineGain: null,
    windGain: null,
    windSource: null,
    started: false,
  };

  audio.start = function start() {
    if (audio.started) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audio.ctx = new Ctx();
      // Engine: two detuned sawtooths through a low-pass filter.
      audio.engineOsc = audio.ctx.createOscillator();
      audio.engineOsc.type = 'sawtooth';
      audio.engineOsc.frequency.value = 62;
      const engineOsc2 = audio.ctx.createOscillator();
      engineOsc2.type = 'sawtooth';
      engineOsc2.frequency.value = 93;
      const filter = audio.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      audio.engineGain = audio.ctx.createGain();
      audio.engineGain.gain.value = 0;
      audio.engineOsc.connect(filter);
      engineOsc2.connect(filter);
      filter.connect(audio.engineGain);
      audio.engineGain.connect(audio.ctx.destination);
      audio.engineOsc.start();
      engineOsc2.start();
      audio.engineOsc2 = engineOsc2;
      // Wind: looped white noise through a band-pass filter.
      const length = audio.ctx.sampleRate * 2;
      const buffer = audio.ctx.createBuffer(1, length, audio.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
      audio.windSource = audio.ctx.createBufferSource();
      audio.windSource.buffer = buffer;
      audio.windSource.loop = true;
      const windFilter = audio.ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 700;
      windFilter.Q.value = 0.6;
      audio.windGain = audio.ctx.createGain();
      audio.windGain.gain.value = 0;
      audio.windSource.connect(windFilter);
      windFilter.connect(audio.windGain);
      audio.windGain.connect(audio.ctx.destination);
      audio.windSource.start();
      audio.started = true;
    } catch {
      audio.ctx = null;
    }
  };

  audio.update = function update(plane, stalled) {
    if (!audio.ctx || audio.muted) return;
    const t = audio.ctx.currentTime;
    const rpm = 0.25 + plane.throttle * 0.75;
    audio.engineOsc.frequency.setTargetAtTime(58 + rpm * 84, t, 0.08);
    audio.engineOsc2.frequency.setTargetAtTime(87 + rpm * 126, t, 0.08);
    audio.engineGain.gain.setTargetAtTime(plane.onGround ? 0.018 + rpm * 0.02 : 0.03 + rpm * 0.045, t, 0.1);
    audio.windGain.gain.setTargetAtTime(Math.min(0.12, plane.speed * 0.0011), t, 0.15);
    if (stalled && !audio.stallBeepAt) {
      audio.stallBeepAt = t;
      audio.beep(880, 0.09, 0.05);
    }
    if (!stalled) audio.stallBeepAt = null;
  };

  audio.tone = function tone(freq, dur, type, gainValue, when = 0) {
    if (!audio.ctx || audio.muted) return;
    const t = audio.ctx.currentTime + when;
    const osc = audio.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = audio.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(gainValue, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(audio.ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  };

  audio.beep = function beep(freq, dur, gainValue) {
    audio.tone(freq, dur, 'square', gainValue);
  };

  // Ring chime: a bright two-note arpeggio.
  audio.ring = function ring(centre) {
    audio.tone(880, 0.16, 'sine', 0.14);
    audio.tone(1318, 0.28, 'sine', 0.12, 0.08);
    if (centre) audio.tone(1760, 0.3, 'sine', 0.1, 0.16);
  };

  audio.touchdown = function touchdown() {
    audio.tone(140, 0.18, 'sine', 0.2);
    audio.tone(70, 0.3, 'sine', 0.16, 0.05);
  };

  audio.crash = function crash() {
    audio.tone(90, 0.5, 'sawtooth', 0.2);
    audio.tone(55, 0.7, 'sawtooth', 0.18, 0.08);
  };

  audio.click = function click() {
    audio.tone(660, 0.06, 'sine', 0.08);
  };

  audio.setMuted = function setMuted(muted) {
    audio.muted = muted;
    if (audio.engineGain) audio.engineGain.gain.value = 0;
    if (audio.windGain) audio.windGain.gain.value = 0;
  };

  return audio;
}
