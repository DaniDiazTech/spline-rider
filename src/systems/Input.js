/**
 * Keyboard + touch input, reduced to a throttle value and a boost flag.
 *
 *   Gas:   → / D / on-screen GAS pedal
 *   Brake: ← / A / on-screen BRAKE pedal
 *   Nitro: Space / Shift / on-screen NITRO button
 *
 * Other keys (pause, restart, mute) are forwarded as named actions.
 */
const GAS_KEYS = new Set(['ArrowRight', 'KeyD', 'ArrowUp', 'KeyW']);
const BRAKE_KEYS = new Set(['ArrowLeft', 'KeyA', 'ArrowDown', 'KeyS']);
const BOOST_KEYS = new Set(['Space', 'ShiftLeft', 'ShiftRight']);
const ACTION_KEYS = {
  Enter: 'confirm',
  KeyP: 'pause',
  Escape: 'pause',
  KeyR: 'restart',
  KeyM: 'mute',
  KeyV: 'physics',
};

export class Input {
  /** @param {(action: string) => void} onAction */
  constructor(onAction) {
    this.onAction = onAction;
    this.gasKeys = new Set();
    this.brakeKeys = new Set();
    this.boostKeys = new Set();
    this.touchGas = false;
    this.touchBrake = false;
    this.touchBoost = false;

    window.addEventListener('keydown', (event) => this.handleKey(event, true));
    window.addEventListener('keyup', (event) => this.handleKey(event, false));
    // Losing focus must never leave a pedal stuck down.
    window.addEventListener('blur', () => this.releaseAll());
  }

  handleKey(event, pressed) {
    const { code } = event;

    if (BOOST_KEYS.has(code)) {
      if (pressed) this.boostKeys.add(code);
      else this.boostKeys.delete(code);
      event.preventDefault();
      // Space also confirms on menus (the Game ignores it while driving).
      if (pressed && !event.repeat && code === 'Space') this.onAction('confirm');
      return;
    }

    if (GAS_KEYS.has(code) || BRAKE_KEYS.has(code)) {
      const set = GAS_KEYS.has(code) ? this.gasKeys : this.brakeKeys;
      if (pressed) set.add(code);
      else set.delete(code);
      event.preventDefault();
      return;
    }

    if (pressed && !event.repeat && ACTION_KEYS[code]) {
      event.preventDefault();
      this.onAction(ACTION_KEYS[code]);
    }
  }

  /** Wires a DOM button as a hold-to-press pedal (mouse, touch and pen). */
  bindPedal(element, pedal) {
    const set = (value) => {
      if (pedal === 'gas') this.touchGas = value;
      else if (pedal === 'boost') this.touchBoost = value;
      else this.touchBrake = value;
      element.classList.toggle('is-pressed', value);
    };
    element.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      element.setPointerCapture?.(event.pointerId);
      set(true);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      element.addEventListener(type, () => set(false));
    }
    element.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  get gas() {
    return this.gasKeys.size > 0 || this.touchGas;
  }

  get brake() {
    return this.brakeKeys.size > 0 || this.touchBrake;
  }

  get boost() {
    return this.boostKeys.size > 0 || this.touchBoost;
  }

  /** -1 (brake), 0 or +1 (gas). Pressing both cancels out. */
  get throttle() {
    return (this.gas ? 1 : 0) - (this.brake ? 1 : 0);
  }

  releaseAll() {
    this.gasKeys.clear();
    this.brakeKeys.clear();
    this.boostKeys.clear();
    this.touchGas = false;
    this.touchBrake = false;
    this.touchBoost = false;
  }
}
