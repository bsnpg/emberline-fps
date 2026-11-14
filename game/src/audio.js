// All sound is synthesised with WebAudio: no audio files, no network. One shared
// noise buffer, short envelopes, and a tiny helper per effect. The context is created
// on the first user gesture (the play click), so browsers never block it.
export function createAudio() {
  let context = null;
  let master = null;
  let noiseBuffer = null;
  let enabled = true;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume();
      return context;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = 0.42;
    master.connect(context.destination);
    const length = Math.floor(context.sampleRate * 1);
    noiseBuffer = context.createBuffer(1, length, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return context;
  }

  function noise(duration, filterType, frequency, gainValue, when = 0) {
    if (!ensure() || !enabled) return;
    const t = context.currentTime + when;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    const gain = context.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(t, Math.random() * 0.5);
    source.stop(t + duration + 0.05);
  }

  function tone(frequency, duration, type, gainValue, slideTo = 0, when = 0) {
    if (!ensure() || !enabled) return;
    const t = context.currentTime + when;
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, t);
    if (slideTo > 0) oscillator.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    oscillator.connect(gain).connect(master);
    oscillator.start(t);
    oscillator.stop(t + duration + 0.05);
  }

  // Distance-attenuated shot: the caller passes 0..1 (1 = own weapon).
  function shot(kind, loudness = 1) {
    if (kind === 'rifle') {
      noise(0.14, 'lowpass', 2400, 0.9 * loudness);
      tone(180, 0.09, 'square', 0.25 * loudness, 60);
    } else if (kind === 'smg') {
      noise(0.09, 'bandpass', 3200, 0.7 * loudness);
      tone(220, 0.06, 'square', 0.18 * loudness, 90);
    } else if (kind === 'dmr') {
      noise(0.22, 'lowpass', 1500, 1.0 * loudness);
      tone(120, 0.16, 'square', 0.35 * loudness, 45);
    } else {
      noise(0.1, 'bandpass', 2600, 0.65 * loudness);
      tone(260, 0.06, 'square', 0.16 * loudness, 110);
    }
  }

  return {
    unlock() {
      ensure();
    },
    toggle() {
      enabled = !enabled;
      return enabled;
    },
    shot,
    dryFire() {
      tone(1400, 0.03, 'square', 0.12);
    },
    reload() {
      tone(900, 0.04, 'square', 0.1);
      tone(620, 0.04, 'square', 0.1, 0, 0.16);
      tone(1100, 0.05, 'square', 0.14, 0, 0.55);
    },
    hit() {
      tone(2100, 0.05, 'sine', 0.22);
    },
    kill() {
      tone(1560, 0.07, 'sine', 0.22);
      tone(2340, 0.1, 'sine', 0.2, 0, 0.07);
    },
    hurt() {
      noise(0.12, 'lowpass', 500, 0.5);
      tone(110, 0.14, 'sawtooth', 0.2, 70);
    },
    step() {
      noise(0.05, 'lowpass', 420, 0.12);
    },
    plantBeep(final = false) {
      tone(final ? 1750 : 1250, final ? 0.16 : 0.07, 'sine', 0.22);
    },
    defuseBeep() {
      tone(980, 0.06, 'sine', 0.18);
    },
    explosion() {
      noise(1.1, 'lowpass', 900, 1.0);
      tone(70, 0.9, 'sine', 0.7, 32);
      noise(0.4, 'highpass', 3000, 0.4, 0.05);
    },
    grenadePin() {
      tone(1800, 0.03, 'square', 0.12);
    },
    bounce() {
      tone(320, 0.05, 'triangle', 0.15, 180);
    },
    buy() {
      tone(880, 0.06, 'sine', 0.2);
      tone(1320, 0.08, 'sine', 0.18, 0, 0.06);
    },
    denied() {
      tone(220, 0.12, 'square', 0.16, 160);
    },
    roundWin() {
      tone(523, 0.14, 'sine', 0.22);
      tone(659, 0.14, 'sine', 0.22, 0, 0.13);
      tone(784, 0.24, 'sine', 0.24, 0, 0.26);
    },
    roundLoss() {
      tone(392, 0.16, 'sine', 0.2);
      tone(330, 0.16, 'sine', 0.2, 0, 0.15);
      tone(262, 0.3, 'sine', 0.22, 0, 0.3);
    },
    tick() {
      tone(1050, 0.04, 'sine', 0.14);
    },
  };
}
