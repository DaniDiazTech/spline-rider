/**
 * Procedural sound effects with the Web Audio API (no audio files needed).
 *
 *  - Engine: a sawtooth + square pair through a low-pass filter whose pitch
 *    follows the wheel speed and whose volume follows the throttle.
 *  - One-shot effects (coin, fuel, flip, crash...) are short synthesized notes.
 *
 * Browsers only allow audio after a user gesture, so `unlock()` is called
 * from the "Play" button / first key press.
 */
export class Audio {
  constructor(muted = false) {
    this.muted = muted;
    this.context = null;
    this.engine = null;
  }

  /** Creates the audio graph. Safe to call many times. */
  unlock() {
    if (this.context) {
      if (this.context.state === 'suspended') this.context.resume();
      return;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;

    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = this.muted ? 0 : 0.6;
    this.master.connect(this.context.destination);
    this.createEngine();
  }

  createEngine() {
    const ctx = this.context;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    filter.Q.value = 4;

    const gain = ctx.createGain();
    gain.gain.value = 0;

    const low = ctx.createOscillator();
    low.type = 'sawtooth';
    low.frequency.value = 45;
    const high = ctx.createOscillator();
    high.type = 'square';
    high.frequency.value = 90;
    const highGain = ctx.createGain();
    highGain.gain.value = 0.35;

    low.connect(filter);
    high.connect(highGain).connect(filter);
    filter.connect(gain).connect(this.master);
    low.start();
    high.start();

    this.engine = { low, high, filter, gain };
  }

  /**
   * Called every frame while playing.
   * @param {number} wheelSpin  rad/step (absolute value is used)
   * @param {number} throttle   -1..1
   * @param {boolean} running   false when paused or game over
   */
  updateEngine(wheelSpin, throttle, running) {
    if (!this.engine) return;
    const now = this.context.currentTime;
    const rpm = Math.min(Math.abs(wheelSpin) / 0.62, 1.4);
    const pitch = 42 + rpm * 70 + Math.abs(throttle) * 12;
    const volume = running ? 0.07 + Math.abs(throttle) * 0.08 + rpm * 0.03 : 0;

    this.engine.low.frequency.setTargetAtTime(pitch, now, 0.06);
    this.engine.high.frequency.setTargetAtTime(pitch * 2.01, now, 0.06);
    this.engine.filter.frequency.setTargetAtTime(380 + rpm * 900 + Math.abs(throttle) * 300, now, 0.08);
    this.engine.gain.gain.setTargetAtTime(volume, now, 0.08);
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.6, this.context.currentTime, 0.02);
  }

  // ---------------------------------------------------------------------------
  // One-shot effects
  // ---------------------------------------------------------------------------

  /** A short enveloped oscillator note. */
  tone({ type = 'sine', from, to = from, duration = 0.15, volume = 0.2, delay = 0 }) {
    if (!this.context) return;
    const ctx = this.context;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(to, start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(this.master);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  /** Filtered white noise burst (impacts, crashes). */
  noise({ duration = 0.3, volume = 0.3, frequency = 800 }) {
    if (!this.context) return;
    const ctx = this.context;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = frequency;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
  }

  /** Wet thud when a zombie goes down. */
  splat() {
    this.noise({ duration: 0.18, volume: 0.35, frequency: 500 });
    this.tone({ type: 'sine', from: 160, to: 60, duration: 0.15, volume: 0.18 });
  }

  /** Wood cracking. */
  smash() {
    this.noise({ duration: 0.12, volume: 0.22, frequency: 1800 });
    this.tone({ type: 'square', from: 300, to: 120, duration: 0.08, volume: 0.05 });
  }

  explosion() {
    this.noise({ duration: 0.9, volume: 0.6, frequency: 900 });
    this.tone({ type: 'sawtooth', from: 90, to: 30, duration: 0.7, volume: 0.25 });
  }

  /** Short whoosh every time the nitro kicks in. */
  boost() {
    this.noise({ duration: 0.35, volume: 0.2, frequency: 2500 });
  }

  finish() {
    [523, 659, 784, 1047, 1319].forEach((f, i) =>
      this.tone({ type: 'triangle', from: f, duration: 0.22, volume: 0.15, delay: i * 0.09 }),
    );
  }

  fuel() {
    [523, 659, 784, 1047].forEach((f, i) =>
      this.tone({ type: 'triangle', from: f, duration: 0.12, volume: 0.15, delay: i * 0.06 }),
    );
  }

  flip() {
    [784, 988, 1175, 1568].forEach((f, i) =>
      this.tone({ type: 'sine', from: f, duration: 0.18, volume: 0.14, delay: i * 0.07 }),
    );
  }

  land(strength) {
    this.noise({ duration: 0.12, volume: Math.min(0.25, strength * 0.03), frequency: 300 });
  }

  crash() {
    this.noise({ duration: 0.6, volume: 0.45, frequency: 1200 });
    this.tone({ type: 'sawtooth', from: 220, to: 55, duration: 0.5, volume: 0.15 });
  }

  gameOver() {
    [392, 330, 262].forEach((f, i) =>
      this.tone({ type: 'triangle', from: f, duration: 0.25, volume: 0.12, delay: i * 0.16 }),
    );
  }
}
