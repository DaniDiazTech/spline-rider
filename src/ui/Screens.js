/**
 * Menu, level select, pause, result and victory overlays.
 * Only one screen is visible at a time; buttons call back into the Game.
 */
import { LEVELS } from '../data/levels.js';
import { CARS } from '../data/cars.js';

const $ = (id) => document.getElementById(id);

const FAIL_TEXT = {
  crash: { title: 'Wrecked!', subtitle: 'Your driver hit the ground. Keep the wheels down.' },
  fuel: { title: 'Out of fuel', subtitle: 'Grab the red cans along the road.' },
  flipped: { title: 'Flipped over', subtitle: 'Use gas and brake in the air to land on your wheels.' },
};

export class Screens {
  /**
   * @param {{ onPlay, onSelectLevel, onBackToMenu, onResume, onRestart, onLevels, onNext, onPause, onMute }} actions
   */
  constructor(actions) {
    this.actions = actions;
    this.screens = {
      menu: $('menu-screen'),
      levels: $('levels-screen'),
      pause: $('pause-screen'),
      result: $('result-screen'),
      victory: $('victory-screen'),
    };

    const bind = (id, handler) => $(id).addEventListener('click', handler);
    bind('play-button', actions.onPlay);
    bind('levels-back-button', actions.onBackToMenu);
    bind('resume-button', actions.onResume);
    bind('pause-restart-button', actions.onRestart);
    bind('pause-levels-button', actions.onLevels);
    bind('next-button', actions.onNext);
    bind('retry-button', actions.onRestart);
    bind('result-levels-button', actions.onLevels);
    bind('victory-button', actions.onLevels);
    bind('pause-button', actions.onPause);
    bind('mute-button', actions.onMute);
  }

  /** @param {'menu'|'levels'|'pause'|'result'|'victory'|null} name */
  show(name) {
    for (const [key, element] of Object.entries(this.screens)) element.hidden = key !== name;
    // Move keyboard focus to the main visible button for accessibility.
    const primary = name && [...this.screens[name].querySelectorAll('.button--primary')].find((b) => !b.hidden && !b.disabled);
    primary?.focus({ preventScroll: true });
  }

  /** Builds the three level cards from the level data and saved progress. */
  renderLevels(progress) {
    const container = $('level-cards');
    container.replaceChildren(
      ...LEVELS.map((level) => {
        const car = CARS[level.car];
        const locked = level.id > progress.unlocked;
        const best = progress.levels[level.id];
        const card = document.createElement('article');
        card.className = `level-card level-card--${level.theme}${locked ? ' is-locked' : ''}`;
        card.dataset.testid = `level-${level.id}`;
        card.innerHTML = `
          <img class="level-card__car-image" src="assets/cars/${car.sprite.folder}/body.png" alt="" />
          <span class="level-card__number">Level ${level.id} · ${level.length} m</span>
          <h3 class="level-card__name"></h3>
          <p class="level-card__tagline"></p>
          <p class="level-card__car">🚗 <strong></strong> — <span></span></p>
          <p class="level-card__best"></p>
          <button class="button button--primary" type="button"></button>`;
        card.querySelector('.level-card__name').textContent = level.name;
        card.querySelector('.level-card__tagline').textContent = level.tagline;
        card.querySelector('.level-card__car strong').textContent = car.name;
        card.querySelector('.level-card__car span').textContent = car.description;
        card.querySelector('.level-card__best').textContent = best?.completed
          ? `✔ Best ${best.bestTime.toFixed(1)} s · ${best.bestKills} zombies`
          : best ? `Best ${Math.floor(best.bestDistance)} m` : '';
        const button = card.querySelector('button');
        button.textContent = locked ? '🔒 Locked' : 'Drive';
        button.disabled = locked;
        button.addEventListener('click', () => this.actions.onSelectLevel(level.id));
        return card;
      }),
    );
  }

  /**
   * @param {{ outcome, reason, stats }} result
   * @param {{ hasNext: boolean, newBest: boolean }} info
   */
  setResult({ outcome, reason, stats }, { hasNext, newBest }) {
    const complete = outcome === 'complete';
    const text = complete
      ? { title: 'Level complete!', subtitle: hasNext ? 'A new car is waiting for you.' : 'The evac chopper is here!' }
      : FAIL_TEXT[reason] ?? FAIL_TEXT.crash;
    $('result-title').textContent = text.title;
    $('result-subtitle').textContent = text.subtitle;
    $('result-distance').textContent = `${Math.floor(stats.distance)} m`;
    $('result-kills').textContent = String(stats.kills);
    $('result-time').textContent = `${stats.time.toFixed(1)} s`;
    $('result-flips').textContent = String(stats.flips);
    $('result-badge').hidden = !newBest;
    $('next-button').hidden = !complete;
    $('next-button').textContent = hasNext ? 'Next level' : 'Finish';
    $('retry-button').hidden = complete;
  }

  setVictory({ kills, time }) {
    $('victory-kills').textContent = String(kills);
    $('victory-time').textContent = `${time.toFixed(1)} s`;
  }

  setMuted(muted) {
    const button = $('mute-button');
    button.setAttribute('aria-pressed', String(muted));
    button.title = muted ? 'Unmute (M)' : 'Mute (M)';
    button.textContent = muted ? '🔇' : '🔊';
  }
}
