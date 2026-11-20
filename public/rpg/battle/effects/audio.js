// All transients are synthesized locally. A single short noise buffer serves wood, steel and bowstring.
export function makeAudio() {
  let context, bus, noise, muted = true;
  function unlock() {
    const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (muted || !Audio) return;
    try {
      if (!context) {
        context = new Audio();
        bus = context.createGain();
        bus.gain.value = .45;
        bus.connect(context.destination);
        noise = context.createBuffer(1, Math.ceil(context.sampleRate * .35), context.sampleRate);
        const samples = noise.getChannelData(0);
        let seed = 476;
        for (let i = 0; i < samples.length; i++) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          samples[i] = seed / 2147483648 - 1;
        }
      }
      if (context.state === 'suspended') void context.resume().catch(() => {});
    } catch { /* A browser can start the visual turn with audio output unavailable. */ }
  }

  function voice(wave, from, to, duration, volume, delay = 0) {
    if (muted || context?.state !== 'running') return;
    const start = context.currentTime + delay;
    const envelope = context.createGain();
    const isNoise = wave === 'noise';
    const source = isNoise ? context.createBufferSource() : context.createOscillator();
    const filter = isNoise ? context.createBiquadFilter() : null;
    if (isNoise) {
      source.buffer = noise;
      filter.type = 'bandpass';
      filter.Q.value = .85;
      source.connect(filter);
      filter.connect(envelope);
    } else {
      source.type = wave;
      source.connect(envelope);
    }
    const frequency = isNoise ? filter.frequency : source.frequency;
    frequency.setValueAtTime(from, start);
    frequency.exponentialRampToValueAtTime(to, start + duration);
    envelope.gain.setValueAtTime(.0001, start);
    envelope.gain.exponentialRampToValueAtTime(volume, start + .008);
    envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
    envelope.connect(bus);
    source.onended = () => { source.disconnect(); filter?.disconnect(); envelope.disconnect(); };
    source.start(start);
    source.stop(start + duration);
  }

  return {
    unlock,
    mute(value) {
      muted = value;
      if (bus) bus.gain.value = muted ? 0 : .45;
      if (!muted) unlock();
    },
    cast(role, action) {
      if (action === 'guard') {
        voice('triangle', 350, 540, .12, .14);
      } else if (role === 'arcanist') {
        voice('sine', 330, 660, .24, .14);
        if (action === 'burst') {
          voice('sine', 660, 990, .25, .10, .11);
          voice('triangle', 990, 1320, .22, .06, .23);
        }
      } else if (role === 'ranger') {
        voice('triangle', 715, 230, .13, .16);
        voice('noise', 2100, 4700, .13, .11, .045);
      } else {
        voice('noise', 430, 3200, action === 'burst' ? .24 : .14, .26);
      }
    },
    impact({heavy = false, parry = false, broken = false, wood = false} = {}) {
      voice('sine', heavy ? 148 : 100, 42, heavy ? .22 : .14, .37);
      voice('noise', wood ? 1650 : 2650, 470, .10, .24);
      if (parry || broken) {
        voice('triangle', 860, 685, .20, .17);
        voice('sine', 1319, 1080, .25, .12, .028);
      }
      if (broken) {
        voice('noise', 1200, 350, .078, .14, .073);
        voice('sine', 784, 420, .28, .12, .09);
      }
    },
    destroy() { if (context) void context.close().catch(() => {}); },
  };
}
