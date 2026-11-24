// Procedural gym acoustics. Only a real contact or a net crossing plays a cue.
const preference = 'learning2game.court.audio.v1';

export function getCourtSoundEnabled() {
  try { return localStorage.getItem(preference) !== 'off'; } catch { return true; }
}

export function setCourtSoundEnabled(enabled) {
  try { localStorage.setItem(preference, enabled ? 'on' : 'off'); } catch { /* session only */ }
  window.dispatchEvent(new CustomEvent('matching:sound', { detail: { enabled } }));
}

const modes = {
  floor: [[88, 0.52, 0.14], [158, 0.16, 0.09]],
  board: [[142, 0.38, 0.13], [330, 0.14, 0.12], [715, 0.05, 0.07]],
  rim: [[485, 0.23, 0.24], [811, 0.15, 0.22], [1360, 0.08, 0.18]],
};

export function createCourtAudio() {
  let ctx, master, room, noise;
  let enabled = getCourtSoundEnabled(), disposed = false;
  const lastContact = new Map();
  function unlock() {
    if (disposed || !enabled) return;
    try {
      if (!ctx) {
        const Context = window.AudioContext || window.webkitAudioContext;
        if (!Context) return;
        ctx = new Context();
        master = ctx.createGain();
        master.gain.value = 0.54;
        master.connect(ctx.destination);
        room = ctx.createDelay(0.2);
        room.delayTime.value = 0.078;
        const reflection = ctx.createGain();
        reflection.gain.value = 0.13;
        room.connect(reflection).connect(master);
        noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.35), ctx.sampleRate);
        const samples = noise.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    } catch { /* Audio output is optional on devices without an audio sink. */ }
  }
  function pulse(source, duration, level, filter) {
    const now = ctx.currentTime, gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(level, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    if (filter) source.connect(filter).connect(gain);
    else source.connect(gain);
    gain.connect(master);
    gain.connect(room);
    source.onended = () => { source.disconnect(); filter?.disconnect(); gain.disconnect(); };
    source.start(now);
    source.stop(now + duration);
  }
  function rustle(frequency, duration, level) {
    const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter();
    source.buffer = noise;
    filter.type = 'bandpass';
    filter.Q.value = 0.85;
    filter.frequency.setValueAtTime(frequency, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(frequency * 0.57, ctx.currentTime + duration);
    pulse(source, duration, level, filter);
  }
  function hit(type, speed) {
    if (!enabled || ctx?.state !== 'running' || !modes[type] || !(speed > 0.48)) return;
    const now = ctx.currentTime;
    if (now - (lastContact.get(type) ?? -1) < 0.052) return;
    lastContact.set(type, now);
    const force = Math.min(speed / 7, 1);
    for (const [pitch, level, duration] of modes[type]) {
      const resonator = ctx.createOscillator();
      resonator.frequency.setValueAtTime(pitch * (1.12 + force * 0.13), now);
      resonator.frequency.exponentialRampToValueAtTime(pitch, now + duration * 0.55);
      pulse(resonator, duration, level * force);
    }
    rustle(type === 'floor' ? 1250 : 3000, 0.035, force * 0.32);
  }
  function swish() {
    if (enabled && ctx?.state === 'running') rustle(3100, 0.22, 0.36);
  }
  function preferenceChanged(event) {
    enabled = event.detail.enabled;
    if (enabled) unlock();
    if (master && ctx.state !== 'closed') master.gain.setTargetAtTime(enabled ? 0.54 : 0, ctx.currentTime, 0.01);
  }
  window.addEventListener('matching:sound', preferenceChanged);
  return { unlock, hit, swish, dispose() {
    disposed = true;
    window.removeEventListener('matching:sound', preferenceChanged);
    if (ctx && ctx.state !== 'closed') ctx.close().catch(() => {});
  } };
}
