/**
 * Top-level controller: owns the current GameSession (one attempt at one
 * level) and connects it to rendering (p5), sound, input and the DOM UI.
 *
 * App states:
 *   menu     title screen, the first level idles behind it
 *   levels   level select
 *   playing  player in control
 *   paused   simulation frozen
 *   result   level complete / failed panel (the world keeps settling)
 *   victory  all three levels done
 */
import { GameSession, SessionState } from './GameSession.js';
import { Camera } from '../systems/Camera.js';
import { Input } from '../systems/Input.js';
import { Audio } from '../systems/Audio.js';
import { Storage } from '../systems/Storage.js';
import { BackgroundRenderer } from '../render/BackgroundRenderer.js';
import { TerrainRenderer } from '../render/TerrainRenderer.js';
import { CarRenderer } from '../render/CarRenderer.js';
import { ZombieRenderer } from '../render/ZombieRenderer.js';
import { ObstacleRenderer } from '../render/ObstacleRenderer.js';
import { Particles } from '../render/Particles.js';
import { PhysicsDebugRenderer } from '../render/PhysicsDebugRenderer.js';
import { Hud } from '../ui/Hud.js';
import { Screens } from '../ui/Screens.js';
import { LEVELS, levelById } from '../data/levels.js';
import { CARS } from '../data/cars.js';
import { THEMES, EFFECTS } from '../render/palette.js';

export const AppState = Object.freeze({
  MENU: 'menu',
  LEVELS: 'levels',
  PLAYING: 'playing',
  PAUSED: 'paused',
  RESULT: 'result',
  VICTORY: 'victory',
});

export class Game {
  /**
   * @param {p5} p          the p5 instance (instance mode)
   * @param {Assets} assets  loaded images (render/Assets.js)
   */
  constructor(p, assets) {
    this.p = p;
    this.assets = assets;
    /** Draws the Matter.js bodies on top of the art (toggle with V). */
    this.showPhysics = false;
    this.state = AppState.MENU;
    this.time = 0;
    this.alpha = 0;
    this.lastResult = null;
    /** Hints already shown this visit. */
    this.tips = new Set();

    this.storage = new Storage();
    this.audio = new Audio(this.storage.muted);
    this.camera = new Camera();
    this.particles = new Particles(p, assets);
    this.hud = new Hud();
    this.input = new Input((action) => this.handleAction(action));
    this.screens = new Screens({
      onPlay: () => this.showLevels(),
      onSelectLevel: (id) => this.startLevel(id),
      onBackToMenu: () => this.showMenu(),
      onResume: () => this.resume(),
      onRestart: () => this.startLevel(this.session.level.id),
      onLevels: () => this.showLevels(),
      onNext: () => this.nextLevel(),
      onPause: () => this.pause(),
      onMute: () => this.toggleMute(),
    });
    this.input.bindPedal(document.getElementById('gas-pedal'), 'gas');
    this.input.bindPedal(document.getElementById('brake-pedal'), 'brake');
    this.input.bindPedal(document.getElementById('boost-pedal'), 'boost');

    this.background = new BackgroundRenderer(p, assets);
    this.terrainRenderer = new TerrainRenderer(p, assets);
    this.carRenderer = new CarRenderer(p, assets);
    this.zombieRenderer = new ZombieRenderer(p, assets);
    this.obstacleRenderer = new ObstacleRenderer(p, assets);
    this.physicsRenderer = new PhysicsDebugRenderer(p);

    // Auto-pause when the tab is hidden.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause();
    });

    this.screens.setMuted(this.audio.muted);
    this.loadLevel(LEVELS[0]);
    this.showMenu();
  }

  // ---------------------------------------------------------------------------
  // State transitions
  // ---------------------------------------------------------------------------

  /** Builds a fresh attempt at `level` and themes the renderers for it. */
  loadLevel(level) {
    this.session?.destroy();
    this.session = new GameSession(level);
    this.bindSessionEvents(this.session);

    const theme = THEMES[level.theme];
    if (this.themeLevel !== level.id) {
      this.background.setTheme(theme, level.seed);
      this.terrainRenderer.setTheme(theme);
      this.themeLevel = level.id;
    }
    document.body.dataset.theme = level.theme;

    this.particles.clear();
    this.hud.clearToasts();
    this.hud.setLevel(level, CARS[level.car]);
    const { x, y } = this.session.car.position;
    this.camera.snapTo(x, y);
  }

  startLevel(id) {
    const level = levelById(id);
    if (!level || !this.storage.isUnlocked(id)) return;
    this.audio.unlock();
    this.loadLevel(level);
    this.state = AppState.PLAYING;
    this.screens.show(null);
    this.hud.show(true);
    document.body.classList.add('is-playing');
    this.hud.toast(`Level ${level.id}: ${level.name}`, `${CARS[level.car].name} · ${level.length} m to safety`, 'info');
    if (CARS[level.car].boost && !this.tips.has('nitro')) {
      this.tips.add('nitro');
      const touch = window.matchMedia('(pointer: coarse)').matches;
      this.hud.toast('New: nitro!', touch ? 'Hold NITRO to boost' : 'Hold Space or Shift to boost', 'good');
    }
  }

  /** One-time hints for new players. */
  showTips() {
    const { session } = this;
    if (!this.tips.has('air') && session.air.time > 0.35 && session.state === SessionState.RUNNING) {
      this.tips.add('air');
      this.hud.toast('Tip: in the air', 'Gas tilts back · Brake tilts forward', 'info');
    }
  }

  nextLevel() {
    const next = levelById(this.session.level.id + 1);
    if (next) this.startLevel(next.id);
    else this.showVictory();
  }

  showMenu() {
    if (this.state !== AppState.MENU && this.state !== AppState.LEVELS) this.loadLevel(LEVELS[0]);
    this.state = AppState.MENU;
    this.leavePlay();
    this.screens.show('menu');
  }

  showLevels() {
    this.audio.unlock();
    if (this.state === AppState.PAUSED) this.loadLevel(this.session.level);
    this.state = AppState.LEVELS;
    this.leavePlay();
    this.screens.renderLevels(this.storage.progress);
    this.screens.show('levels');
  }

  showVictory() {
    const levels = Object.values(this.storage.progress.levels);
    this.screens.setVictory({
      kills: levels.reduce((sum, level) => sum + level.bestKills, 0),
      time: levels.reduce((sum, level) => sum + (level.bestTime ?? 0), 0),
    });
    this.state = AppState.VICTORY;
    this.leavePlay();
    this.screens.show('victory');
  }

  leavePlay() {
    this.hud.show(false);
    this.input.releaseAll();
    document.body.classList.remove('is-playing');
  }

  pause() {
    if (this.state !== AppState.PLAYING) return;
    this.state = AppState.PAUSED;
    this.input.releaseAll();
    this.screens.show('pause');
  }

  resume() {
    if (this.state !== AppState.PAUSED) return;
    this.audio.unlock();
    this.state = AppState.PLAYING;
    this.screens.show(null);
  }

  showResult(result) {
    const level = this.session.level;
    const newBest = this.storage.recordAttempt(level.id, result, LEVELS.length);
    this.lastResult = result;
    this.state = AppState.RESULT;
    this.input.releaseAll();
    if (result.outcome !== 'complete') this.audio.gameOver();
    this.screens.setResult(result, { hasNext: Boolean(levelById(level.id + 1)), newBest });
    this.screens.show('result');
    document.body.classList.remove('is-playing');
  }

  toggleMute() {
    const muted = !this.audio.muted;
    this.audio.setMuted(muted);
    this.storage.muted = muted;
    this.screens.setMuted(muted);
  }

  /** Keyboard shortcuts that depend on the current state. */
  handleAction(action) {
    switch (action) {
      case 'confirm':
        if (this.state === AppState.MENU) this.showLevels();
        else if (this.state === AppState.LEVELS) this.startLevel(this.storage.progress.unlocked);
        else if (this.state === AppState.PAUSED) this.resume();
        else if (this.state === AppState.RESULT) {
          if (this.lastResult?.outcome === 'complete') this.nextLevel();
          else this.startLevel(this.session.level.id);
        } else if (this.state === AppState.VICTORY) this.showLevels();
        break;
      case 'pause':
        if (this.state === AppState.PLAYING) this.pause();
        else if (this.state === AppState.PAUSED) this.resume();
        break;
      case 'restart':
        if ([AppState.PLAYING, AppState.PAUSED, AppState.RESULT].includes(this.state)) {
          this.startLevel(this.session.level.id);
        }
        break;
      case 'mute':
        this.toggleMute();
        break;
      case 'physics':
        this.showPhysics = !this.showPhysics;
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Session events -> feedback (sound, particles, messages)
  // ---------------------------------------------------------------------------

  bindSessionEvents(session) {
    const { events } = session;

    events.on('kill', ({ x, y, total }) => {
      this.audio.splat();
      this.hud.pulseKills();
      this.camera.shake(3, 0.12);
      this.particles.burst(x, y, 16, { speed: 280, color: EFFECTS.blood, size: 9, gravity: 800, life: 0.8 });
      this.particles.burst(x, y, 8, { speed: 200, color: EFFECTS.zombieBlood, size: 7, gravity: 800, life: 0.7 });
      this.particles.emit({ x, y, shape: 'image', image: 'fx/puff04', size: 50, grow: 1.8, life: 0.45, gravity: -30, alpha: 0.5 });
      if (total % 25 === 0) this.hud.toast(`${total} zombies!`, 'Keep smashing', 'warn');
    });

    events.on('explosion', ({ x, y }) => {
      this.audio.explosion();
      this.camera.shake(18, 0.55);
      const frames = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => `fx/explosion${i}`);
      this.particles.emit({ x, y: y - 20, shape: 'image', frames, size: 230, grow: 1.4, life: 0.65, gravity: 0, drag: 0 });
      for (let i = 0; i < 7; i++) {
        this.particles.emit({
          x: x + (Math.random() - 0.5) * 80, y: y - 20 + (Math.random() - 0.5) * 50,
          vx: (Math.random() - 0.5) * 120, vy: -60 - Math.random() * 80,
          shape: 'image', image: `fx/smoke${['00', '04', '08', '12'][i % 4]}`, size: 90 + Math.random() * 60,
          grow: 2.2, spin: (Math.random() - 0.5) * 1.5, life: 1.6 + Math.random() * 0.8, gravity: -40, drag: 1, alpha: 0.8,
        });
      }
      this.particles.burst(x, y, 18, { speed: 560, color: EFFECTS.spark, size: 7, gravity: 600, life: 0.8, shape: 'star' });
    });

    events.on('smash', ({ x, y }) => {
      this.audio.smash();
      for (let i = 0; i < 6; i++) {
        this.particles.emit({
          x, y, vx: (Math.random() - 0.3) * 420, vy: -150 - Math.random() * 260,
          shape: 'image', image: `debris/wood${1 + (i % 3)}`, size: 14 + Math.random() * 12, grow: 1,
          spin: (Math.random() - 0.5) * 14, life: 0.9 + Math.random() * 0.5, gravity: 900, drag: 0.4,
        });
      }
    });

    events.on('fuel', ({ x, y }) => {
      this.audio.fuel();
      const nitro = session.car.spec.boost ? ' + nitro' : '';
      this.hud.toast(`Fuel refilled${nitro}!`, '', 'info');
      this.particles.burst(x, y, 16, { speed: 220, color: EFFECTS.fuel, size: 10, gravity: 200, life: 0.6 });
    });

    events.on('flip', ({ count, direction }) => {
      this.audio.flip();
      const name = direction === 'back' ? 'Backflip' : 'Frontflip';
      this.hud.toast(count > 1 ? `${count}× ${name}!` : `${name}!`);
    });

    events.on('airtime', ({ seconds }) => this.hud.toast(`Air time ${seconds.toFixed(1)} s`, '', 'info'));

    events.on('landed', ({ impact }) => {
      if (impact > 8) {
        this.audio.land(impact);
        this.camera.shake(Math.min(10, impact * 0.6), 0.25);
      }
    });

    events.on('crash', ({ x, y }) => {
      this.audio.crash();
      this.camera.shake(14, 0.5);
      this.particles.burst(x, y, 12, { speed: 260, color: '#ffe35c', size: 14, gravity: 200, life: 1, shape: 'star' });
      this.particles.emit({ x, y, shape: 'image', image: 'fx/puff08', size: 70, grow: 2, life: 0.6, gravity: -20, alpha: 0.7 });
      this.hud.toast('Wrecked!', '', 'warn');
    });

    events.on('finish', () => {
      this.audio.finish();
      this.hud.toast('Safe!', 'You made it through', 'good');
    });

    events.on('gameover', (result) => {
      if (this.state === AppState.PLAYING) this.showResult(result);
    });
  }

  // ---------------------------------------------------------------------------
  // Frame loop (called by p5's draw)
  // ---------------------------------------------------------------------------

  frame(deltaMs) {
    const dt = Math.min(deltaMs, 100) / 1000;
    const { session } = this;
    const paused = this.state === AppState.PAUSED;

    if (!paused) {
      this.time += dt;
      const playing = this.state === AppState.PLAYING;
      const input = { throttle: playing ? this.input.throttle : 0, boost: playing && this.input.boost };
      const wasBoosting = session.car.isBoosting;
      this.alpha = session.advance(deltaMs, input);
      if (session.car.isBoosting && !wasBoosting) this.audio.boost();
      this.emitDrivingParticles(dt);
      this.particles.update(dt);
    }

    const car = session.car.interpolated(this.alpha).chassis;
    this.camera.update(car, session.car.velocity, this.p, paused ? 0 : dt);

    this.audio.updateEngine(
      session.car.wheelSpin,
      session.car.throttle,
      this.state === AppState.PLAYING && session.state === SessionState.RUNNING,
    );

    this.render();
    if (this.state === AppState.PLAYING) this.showTips();
    if (this.state === AppState.PLAYING || paused) this.hud.update(session.snapshot());
  }

  /** Dust from spinning wheels, exhaust smoke and nitro sparks. */
  emitDrivingParticles(dt) {
    const { car } = this.session;
    const spin = Math.abs(car.wheelSpin);
    const radius = car.spec.wheels.radius;

    for (const [wheel, grounded] of [
      [car.rearWheel, car.rearGrounded],
      [car.frontWheel, car.frontGrounded],
    ]) {
      if (!grounded || spin < 0.12 || Math.random() > spin * 0.9) continue;
      this.particles.emit({
        x: wheel.position.x - Math.sign(car.wheelSpin) * radius * 0.6,
        y: wheel.position.y + radius * 0.75,
        vx: -car.wheelSpin * 260 + (Math.random() - 0.5) * 60,
        vy: -50 - Math.random() * 90,
        life: 0.6 + Math.random() * 0.4,
        size: 18 + Math.random() * 14,
        shape: 'image',
        image: `fx/puff${['00', '04', '08', '12'][Math.floor(Math.random() * 4)]}`,
        grow: 2,
        spin: (Math.random() - 0.5) * 3,
        gravity: 120,
        alpha: 0.55,
      });
    }

    // Exhaust (or nitro sparks) from the back of the car.
    const boosting = car.isBoosting;
    if ((car.throttle !== 0 || boosting) && Math.random() < dt * (boosting ? 60 : 12)) {
      const angle = car.angle;
      const { x: ox, y: oy } = car.bodyOffset;
      const lx = car.extent.rear - 6 + ox;
      const ly = 4 + oy;
      const x = car.position.x + lx * Math.cos(angle) - ly * Math.sin(angle);
      const y = car.position.y + lx * Math.sin(angle) + ly * Math.cos(angle);
      if (boosting) {
        this.particles.emit({
          x, y, vx: -Math.cos(angle) * 260 + (Math.random() - 0.5) * 40, vy: -Math.sin(angle) * 260 - 20,
          life: 0.4, size: 6 + Math.random() * 4, color: EFFECTS.spark, gravity: 200, drag: 1, shape: 'star',
        });
      } else {
        this.particles.emit({
          x, y, vx: -Math.cos(angle) * 50 + (Math.random() - 0.5) * 30, vy: -40 - Math.random() * 20,
          life: 0.9, size: 14 + Math.random() * 8, shape: 'image', image: 'fx/puff08', grow: 2.6,
          spin: (Math.random() - 0.5) * 2, gravity: -40, drag: 1, alpha: 0.3,
        });
      }
    }
  }

  render() {
    const { p, session, camera } = this;
    this.background.draw(camera, this.time);

    p.push();
    camera.apply(p);
    const bounds = camera.visibleBounds(p.width, p.height);
    this.terrainRenderer.draw(session.terrain, bounds, session.level);
    this.obstacleRenderer.draw(session.content, bounds, this.time);
    this.zombieRenderer.draw(session.content.zombies, bounds, this.time);
    this.carRenderer.draw(session.car, this.alpha, session.headHit, this.time);
    this.particles.draw();
    if (this.showPhysics) this.physicsRenderer.draw(session.physics.world, bounds);
    p.pop();
  }

  resize() {
    this.background.resize();
  }

  /** Read-only view used by automated browser tests and for debugging. */
  debugSnapshot() {
    return {
      appState: this.state,
      fps: Math.round(this.p.frameRate()),
      unlocked: this.storage.progress.unlocked,
      ...this.session.snapshot(),
    };
  }
}
