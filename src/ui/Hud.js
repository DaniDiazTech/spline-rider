/**
 * Heads-up display (plain DOM on top of the canvas).
 *
 * DOM text stays crisp at any zoom level and is easy to style and test.
 * Values are only written when they change, to avoid needless layout work.
 */
import { FUEL } from '../config.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.root = $('hud');
    this.fuelFill = $('fuel-fill');
    this.fuelGauge = $('fuel-gauge');
    this.boostWrap = $('boost-gauge-wrap');
    this.boostFill = $('boost-fill');
    this.boostGauge = $('boost-gauge');
    this.fuelHint = $('fuel-hint');
    this.level = $('hud-level');
    this.progressFill = $('progress-fill');
    this.progressCar = $('progress-car');
    this.remaining = $('hud-remaining');
    this.kills = $('hud-kills');
    this.speed = $('hud-speed');
    this.toasts = $('toasts');
    this.cache = {};
  }

  show(visible) {
    this.root.hidden = !visible;
  }

  /** Sets up the HUD for a level (name, whether the car has nitro). */
  setLevel(level, car) {
    this.cache = {};
    this.level.textContent = `Level ${level.id} · ${level.name}`;
    this.boostWrap.hidden = !car.boost;
    document.body.classList.toggle('has-boost', Boolean(car.boost));
  }

  /** Writes `value` into `element` only if it changed since last time. */
  write(key, element, value) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    element.textContent = value;
  }

  /** @param {object} snapshot  GameSession.snapshot() */
  update(snapshot) {
    const left = Math.max(0, Math.ceil(snapshot.length - snapshot.distance));
    this.write('remaining', this.remaining, left > 0 ? `${left} m` : 'Safe!');
    this.write('kills', this.kills, String(snapshot.kills));
    this.write('speed', this.speed, `${Math.round(snapshot.speedKmh)} km/h`);

    const progress = Math.round(snapshot.progress * 1000) / 1000;
    if (this.cache.progress !== progress) {
      this.cache.progress = progress;
      this.progressFill.style.transform = `scaleX(${progress})`;
      this.progressCar.style.left = `${progress * 100}%`;
    }

    this.meter('fuel', this.fuelGauge, this.fuelFill, snapshot.fuel);
    this.fuelGauge.classList.toggle('is-low', snapshot.fuel <= FUEL.lowFuelWarning);
    if (snapshot.hasBoost) {
      this.meter('boost', this.boostGauge, this.boostFill, snapshot.boost);
      this.boostGauge.classList.toggle('is-active', snapshot.boosting);
    }

    const hint = snapshot.nextFuelMeters == null ? '' : `next ⛽ ${Math.max(0, Math.round(snapshot.nextFuelMeters))} m`;
    this.write('hint', this.fuelHint, hint);
  }

  meter(key, gauge, fill, value) {
    const percent = Math.round(value * 100);
    if (this.cache[key] === percent) return;
    this.cache[key] = percent;
    fill.style.transform = `scaleX(${value})`;
    gauge.setAttribute('aria-valuenow', String(percent));
  }

  /** Bumps the kill counter for visual feedback. */
  pulseKills() {
    const chip = this.kills.parentElement;
    chip.classList.remove('pulse');
    void chip.offsetWidth; // restart the CSS animation
    chip.classList.add('pulse');
  }

  /**
   * Floating message in the middle of the screen ("Backflip!").
   * @param {string} title
   * @param {string} [detail]
   * @param {'good'|'info'|'warn'} [tone]
   */
  toast(title, detail = '', tone = 'good') {
    const element = document.createElement('div');
    element.className = `toast toast--${tone}`;
    element.innerHTML = `<strong></strong>${detail ? '<span></span>' : ''}`;
    element.querySelector('strong').textContent = title;
    if (detail) element.querySelector('span').textContent = detail;
    this.toasts.append(element);
    element.addEventListener('animationend', () => element.remove());
    while (this.toasts.children.length > 3) this.toasts.firstElementChild.remove();
  }

  clearToasts() {
    this.toasts.replaceChildren();
  }
}
