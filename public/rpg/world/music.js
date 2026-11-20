// Original modal travel themes. Time is scheduled against the audio clock.
const tunes = [
  [62, 84, 'sine', [0, 3, 7, 10, 7, 5, 3, null, 2, 5, 7, 12, 10, 7, 3, null]],
  [65, 108, 'triangle', [0, 4, 7, null, 9, 7, 4, 2, 5, 9, 12, 9, 7, null, 4, 2]],
  [50, 112, 'triangle', [0, null, 3, 0, 7, null, 5, 3, 0, 3, 7, 10, 5, null, 3, 2]],
  [67, 102, 'sine', [7, 9, 12, null, 9, 7, 4, 2, 5, 7, 14, 12, 9, 7, 4, null]],
  [57, 76, 'sine', [0, 7, 10, 14, null, 12, 10, 7, 5, 8, 12, null, 10, 7, 3, null]],
  [69, 68, 'sine', [0, null, 7, 12, 14, null, 10, 7, 3, null, 5, 10, 7, 5, 2, null]],
  [60, 100, 'triangle', [0, 7, 12, 4, 7, null, 9, 12, 5, 9, 12, 14, 7, 4, 2, null]],
  [62, 76, 'sine', [0, 7, 12, 14, 15, null, 14, 10, 7, 10, 12, 19, 17, 14, 12, null]],
];
export function createMusic() {
  let ctx,
    gain,
    timer,
    beat = 0,
    next = 0,
    zone = 0,
    mode = 'title',
    enabled = false;
  function tone(note, start, sustain, level, wave = 'sine') {
    const o = ctx.createOscillator(),
      a = ctx.createGain();
    o.type = wave;
    o.frequency.value = 440 * 2 ** ((note - 69) / 12);
    a.gain.setValueAtTime(0.0001, start);
    a.gain.exponentialRampToValueAtTime(level, start + 0.02);
    a.gain.exponentialRampToValueAtTime(0.0001, start + sustain);
    o.connect(a);
    a.connect(gain);
    o.start(start);
    o.stop(start + sustain + 0.03);
    o.onended = () => {
      o.disconnect();
      a.disconnect();
    };
  }
  function tick() {
    if (!enabled || document.hidden || ctx?.state !== 'running') return;
    if (next < ctx.currentTime) next = ctx.currentTime + 0.03;
    const [root, tempo, wave, melody] = tunes[zone] || tunes[0];
    const fighting = mode === 'battle' || mode === 'tower',
      restful = mode === 'camp';
    const interval = 30 / (fighting ? tempo * 1.24 : restful ? tempo * 0.76 : tempo);
    while (next < ctx.currentTime + 0.22) {
      const pos = beat % 16,
        chord = [0, -5, -2, -7][Math.floor(beat / 8) % 4];
      if (pos % 4 === 0) {
        tone(root - 24 + chord, next, interval * 3.3, 0.085, 'triangle');
        tone(root - 12 + chord + 7, next + 0.02, interval * 3, 0.027);
      }
      const n = melody[pos];
      if (n !== null && (!restful || pos % 2 === 0)) {
        tone(root + n, next, interval * (restful ? 2.7 : 1.6), 0.073, wave);
        tone(root + n + 12, next + 0.06, interval * 1.3, 0.013);
      }
      if (fighting && pos % 2 === 0)
        tone(root - 21 + (pos % 4 ? 7 : 0), next, interval * 0.56, 0.063, 'triangle');
      next += interval;
      beat++;
    }
  }
  function suspend() {
    clearInterval(timer);
    if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
  }
  function start() {
    if (!enabled || document.hidden) return;
    const Engine = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Engine) return;
    if (!ctx) {
      ctx = new Engine();
      gain = ctx.createGain();
      gain.gain.value = 0.6;
      gain.connect(ctx.destination);
    }
    clearInterval(timer);
    ctx
      .resume()
      .then(tick)
      .catch(() => {});
    timer = setInterval(tick, 100);
  }
  document.addEventListener('visibilitychange', () => (document.hidden ? suspend() : start()));
  return {
    setEnabled(value) {
      enabled = value;
      if (value) start();
      else suspend();
    },
    scene(index, kind) {
      if (zone !== index || mode !== kind) {
        zone = index;
        mode = kind;
        beat = 0;
      }
    },
    cue(kind) {
      if (!enabled || ctx?.state !== 'running') return;
      if (kind === 'bridge-bell') {
        tone(55, ctx.currentTime, 0.72, 0.16, 'sine');
        tone(67, ctx.currentTime + 0.01, 0.38, 0.05, 'triangle');
        return;
      }
      const scale = kind === 'seal' ? [0, 4, 7, 12] : kind === 'danger' ? [0, -1, -5] : [0, 7];
      scale.forEach((n, i) => tone(68 + n, ctx.currentTime + i * 0.085, 0.24, 0.1, 'triangle'));
    },
  };
}
