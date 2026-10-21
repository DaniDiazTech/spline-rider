/**
 * One attempt at one level: physics world + road + car + level content + rules.
 *
 * This class knows nothing about drawing, sound or the DOM. It advances the
 * simulation and announces what happened through an EventBus:
 *
 *   'kill'      { x, y, total }         'explosion' { x, y }
 *   'fuel'      { x, y }                'flip'      { count, direction }
 *   'airtime'   { seconds }             'landed'    { impact }
 *   'smash'     { x, y, label }         (a crate or plank broken by the car)
 *   'crash'     { x, y }                'finish'    { time }
 *   'gameover'  { outcome: 'complete' | 'failed', reason, stats }
 */
import { Matter } from '../lib/matter.js';
import { PhysicsWorld } from '../physics/PhysicsWorld.js';
import { Terrain } from '../world/Terrain.js';
import { LevelContent } from '../world/LevelContent.js';
import { Car } from '../entities/Car.js';
import { EventBus } from './EventBus.js';
import { CARS } from '../data/cars.js';
import { wrapAngle } from '../math/utils.js';
import { FUEL, RULES, TERRAIN, OBSTACLES, PIXELS_PER_METER } from '../config.js';

const { Body, Bounds, Composite } = Matter;

export const SessionState = Object.freeze({
  RUNNING: 'running',
  CRASHED: 'crashed',
  FINISHED: 'finished',
  OVER: 'over',
});

export const FailReason = Object.freeze({
  CRASH: 'crash',
  FUEL: 'fuel',
  FLIPPED: 'flipped',
});

/** Delay before a barrel caught in a blast goes off too (chain reactions). */
const CHAIN_DELAY_SECONDS = 0.12;
/** Wooden props break when the car hits them at least this fast (px/step). */
const SMASH_SPEED = 1.5;
const BREAKABLE = new Set(['crate', 'plank']);
/** Fraction of the struck mass's share of momentum the car loses per hit. */
const IMPACT_MOMENTUM = 0.8;
/** Only things this close to the car are tested for impacts (px). */
const IMPACT_RANGE = 320;

export class GameSession {
  /** @param {object} level  entry of data/levels.js */
  constructor(level) {
    this.level = level;
    this.events = new EventBus();
    this.physics = new PhysicsWorld();
    this.terrain = new Terrain(this.physics, level);
    this.terrain.update(0);
    this.content = new LevelContent(this.physics, this.terrain, level);

    const spec = CARS[level.car];
    const spawnY = this.terrain.heightAt(0) - spec.wheels.offsetY - spec.wheels.radius - 6;
    this.car = new Car(spec, 0, spawnY);
    this.physics.add(this.car.physicsObjects);

    this.state = SessionState.RUNNING;
    this.fuel = 1;
    this.elapsed = 0;

    this.stats = { distance: 0, kills: 0, flips: 0, bestAirTime: 0, fuelCans: 0, time: 0 };

    // Air tracking for flips.
    this.air = { time: 0, rotation: 0, lastAngle: this.car.angle };
    // Timers for the end-of-attempt conditions.
    this.timers = { crash: 0, finish: 0, empty: 0, stuck: 0 };
    this.headHit = false;

    // Work queued from collision callbacks (Matter is mid-step there, so
    // bodies must not be added or removed until the step is over).
    this.pendingKills = new Map();
    this.pendingExplosions = [];
    this.pendingSmashes = new Set();

    this.registerCollisions();
  }

  // ---------------------------------------------------------------------------
  // Collisions
  // ---------------------------------------------------------------------------

  registerCollisions() {
    const eachCarPair = (pair, handler) => {
      for (const [own, other] of [
        [pair.bodyA, pair.bodyB],
        [pair.bodyB, pair.bodyA],
      ]) {
        if (this.car.owns(own)) handler(own, other);
      }
    };

    // Contacts: anything solid counts as "touching" for the air logic, but
    // only the road (and ramps) can hurt the driver's head.
    const handleContact = (pair) =>
      eachCarPair(pair, (own, other) => {
        if (other.isSensor) return;
        this.car.registerContact(own);
        if (this.car.isHead(own) && other.label === 'terrain') this.headHit = true;
        // Anything soft pinned under the chassis would lift the wheels off
        // the road (the car "beaches" on it): crush it instead.
        const zombie = other.parent.plugin.zombie;
        if (zombie?.alive) {
          zombie.touchingCar = true;
          if (own.label === 'chassis') this.pendingKills.set(zombie, { x: this.car.velocity.x, y: -2 });
        }
        if (own.label === 'chassis' && BREAKABLE.has(other.label)) this.pendingSmashes.add(other);
      });

    const handleImpact = (pair) =>
      eachCarPair(pair, (own, other) => {
        const zombie = other.parent.plugin.zombie;
        const obstacle = other.parent.plugin.obstacle;
        const can = other.plugin.fuelCan;

        if (zombie?.alive) this.checkZombieHit(zombie);
        else if (obstacle?.type === 'barrel') this.checkBarrelHit(obstacle, other);
        else if (BREAKABLE.has(other.label) && this.impactSpeed(other.velocity) >= SMASH_SPEED) this.pendingSmashes.add(other);
        else if (can) this.collectFuel(can);
      });

    this.physics.onCollision('start', handleContact);
    this.physics.onCollision('active', handleContact);
    this.physics.onCollision('start', handleImpact);
  }

  /** Relative speed between the car (before this step) and another body. */
  impactSpeed(velocity) {
    const { velocityBefore } = this.car;
    return Math.hypot(velocityBefore.x - velocity.x, velocityBefore.y - velocity.y);
  }

  checkZombieHit(zombie) {
    if (this.impactSpeed(zombie.velocityBefore) < this.car.spec.zombieKillSpeed) return;
    // Launch the body forward and up, in the direction the car was going.
    const v = this.car.velocityBefore;
    this.pendingKills.set(zombie, { x: v.x * 0.6, y: v.y * 0.6 - 3 - Math.abs(v.x) * 0.15 });
  }

  checkBarrelHit(barrel, body) {
    if (this.impactSpeed(body.velocity) >= OBSTACLES.barrelTriggerSpeed) this.queueExplosion(barrel, 0);
  }

  queueExplosion(barrel, delay) {
    if (!barrel.alive || barrel.fuse !== undefined) return;
    barrel.fuse = delay;
    this.pendingExplosions.push(barrel);
  }

  collectFuel(can) {
    if (this.state !== SessionState.RUNNING || !this.content.collectFuel(can)) return;
    this.fuel = 1;
    this.car.refillBoost();
    this.stats.fuelCans++;
    this.timers.empty = 0;
    this.events.emit('fuel', { x: can.x, y: can.y });
  }

  // ---------------------------------------------------------------------------
  // Simulation
  // ---------------------------------------------------------------------------

  get isOver() {
    return this.state === SessionState.OVER;
  }

  get hasFuel() {
    return this.fuel > 0;
  }

  get currentMeters() {
    return Math.max(0, this.car.position.x / PIXELS_PER_METER);
  }

  /**
   * Advances the attempt by real elapsed time.
   * @param {number} elapsedMs  time since last frame
   * @param {{throttle:number, boost:boolean}} input
   * @returns {number} interpolation factor for rendering
   */
  advance(elapsedMs, input) {
    return this.physics.advance(
      elapsedMs,
      (dt) => this.beforeStep(input, dt),
      (dt) => this.afterStep(dt),
    );
  }

  beforeStep(input, dt) {
    const { car } = this;
    car.beginStep();
    this.terrain.update(car.position.x);
    this.content.think(car.position.x);

    const driving = this.state === SessionState.RUNNING;
    let throttle = driving ? input.throttle : 0;
    // Reverse limiter: behind the start the engine will not push backwards.
    if (throttle < 0 && car.position.x < TERRAIN.reverseLimitX && car.isGrounded) throttle = 0;
    car.drive(throttle, this.hasFuel);
    car.applyBoost(driving && input.boost, dt);
    this.predictImpacts();
    car.resetContacts();
  }

  /**
   * Swept impact test, run BEFORE the physics step.
   *
   * If we waited for Matter's collision events, a zombie would already have
   * been "solid" for one step: the wheel would climb its legs and the car
   * would pop into a wheelie on every kill. Instead, anything the car is
   * about to hit hard is resolved first (zombie -> ragdoll, crate -> splinters,
   * barrel -> boom) and the car pays for it with momentum: it loses the
   * share m / (M + m) of its speed, as in an inelastic collision.
   */
  predictImpacts() {
    const { car } = this;
    const reach = sweptBounds(car.bodies);
    const carMass = car.bodies.reduce((sum, body) => sum + body.mass, 0);
    const near = (position) => Math.abs(position.x - car.position.x) < IMPACT_RANGE;
    let massHit = 0;

    for (const zombie of this.content.zombies) {
      if (!zombie.alive || !near(zombie.position) || !Bounds.overlaps(zombie.body.bounds, reach)) continue;
      zombie.velocityBefore = { ...zombie.body.velocity };
      if (this.impactSpeed(zombie.body.velocity) < car.spec.zombieKillSpeed) continue;
      this.checkZombieHit(zombie);
      massHit += zombie.body.mass;
    }

    for (const obstacle of [...this.content.obstacles]) {
      if (!near(obstacle.bodies[0]?.position ?? { x: Infinity })) continue;
      for (const body of [...obstacle.bodies]) {
        if (!Bounds.overlaps(body.bounds, reach)) continue;
        if (obstacle.type === 'barrel') this.checkBarrelHit(obstacle, body);
        else if (BREAKABLE.has(body.label) && this.impactSpeed(body.velocity) >= SMASH_SPEED) {
          this.pendingSmashes.add(body);
          massHit += body.mass;
        }
      }
    }

    this.resolveKills();
    this.resolveSmashes();
    this.resolveExplosions(0);

    if (massHit > 0) {
      const keep = 1 - (IMPACT_MOMENTUM * massHit) / (carMass + massHit);
      for (const body of car.bodies) Body.setVelocity(body, { x: body.velocity.x * keep, y: body.velocity.y * keep });
    }
  }

  afterStep(dt) {
    this.car.endStep();
    this.elapsed += dt;
    this.resolveKills();
    this.resolveSmashes();
    this.resolveExplosions(dt);
    this.content.update(dt);

    switch (this.state) {
      case SessionState.OVER:
        return;
      case SessionState.CRASHED:
        this.timers.crash += dt;
        if (this.timers.crash >= RULES.crashDelaySeconds) this.end('failed', FailReason.CRASH);
        return;
      case SessionState.FINISHED:
        this.timers.finish += dt;
        if (this.timers.finish >= RULES.finishDelaySeconds) this.end('complete');
        return;
    }

    if (this.headHit) {
      this.crash();
      return;
    }

    this.stats.time += dt;
    this.burnFuel(dt);
    this.trackDistance();
    this.trackAir(dt);
    this.checkStuck(dt);
  }

  resolveKills() {
    for (const [zombie, launch] of this.pendingKills) {
      if (!this.content.killZombie(zombie, launch)) continue;
      this.stats.kills++;
      const { x, y } = zombie.position;
      this.events.emit('kill', { x, y, total: this.stats.kills });
    }
    this.pendingKills.clear();
  }

  resolveSmashes() {
    for (const body of this.pendingSmashes) {
      if (!this.content.removeBody(body)) continue;
      this.events.emit('smash', { x: body.position.x, y: body.position.y, label: body.label });
    }
    this.pendingSmashes.clear();
  }

  resolveExplosions(dt) {
    const ready = [];
    for (const barrel of this.pendingExplosions) {
      barrel.fuse -= dt;
      if (barrel.fuse <= 1e-9) ready.push(barrel);
    }
    this.pendingExplosions = this.pendingExplosions.filter((barrel) => !ready.includes(barrel));
    for (const barrel of ready) this.explode(barrel);
  }

  /**
   * Explosion: every movable body nearby gets a velocity kick away from the
   * centre (stronger when closer and for lighter bodies), zombies in range
   * die and other barrels in range go off a moment later.
   */
  explode(barrel) {
    if (!barrel.alive) return;
    const center = { ...barrel.bodies[0].position };
    this.content.removeObstacle(barrel);

    const radius = OBSTACLES.explosionRadius;
    const kickAt = (position, scale = 1) => {
      const dx = position.x - center.x;
      const dy = position.y - center.y - 30; // centre a bit low: things fly up
      const distance = Math.hypot(dx, dy) || 1;
      if (distance > radius) return null;
      const strength = OBSTACLES.explosionStrength * (1 - distance / radius) * scale;
      return { x: (dx / distance) * strength, y: (dy / distance) * strength };
    };

    // The car is kicked as one rigid object (same velocity for all its bodies).
    const carKick = kickAt(this.car.position, 0.45);
    if (carKick) {
      for (const body of this.car.bodies) {
        Body.setVelocity(body, { x: body.velocity.x + carKick.x, y: body.velocity.y + carKick.y });
      }
    }

    for (const zombie of this.content.zombies) {
      const kick = kickAt(zombie.position);
      if (kick && zombie.alive) this.pendingKills.set(zombie, kick);
    }

    for (const body of Composite.allBodies(this.physics.world)) {
      if (body.isStatic || this.car.owns(body) || body.plugin.zombie?.alive) continue;
      const obstacle = body.plugin.obstacle;
      if (obstacle?.type === 'barrel') {
        if (kickAt(body.position)) this.queueExplosion(obstacle, CHAIN_DELAY_SECONDS);
        continue;
      }
      const kick = kickAt(body.position, Math.min(1.5, 4 / body.mass));
      if (kick) Body.setVelocity(body, { x: body.velocity.x + kick.x, y: body.velocity.y + kick.y });
    }

    this.resolveKills();
    this.events.emit('explosion', center);
  }

  burnFuel(dt) {
    const throttling = Math.abs(this.car.throttle) > 0;
    const burn = FUEL.idleBurnPerSecond + (throttling ? this.car.spec.fuelBurnPerSecond : 0);
    this.fuel = Math.max(0, this.fuel - burn * dt);

    // Out of fuel: the attempt ends once the car has (almost) stopped rolling.
    if (this.fuel <= 0 && this.car.speed < FUEL.stopSpeed) {
      this.timers.empty += dt;
      if (this.timers.empty >= FUEL.emptyGraceSeconds) this.end('failed', FailReason.FUEL);
    } else {
      this.timers.empty = 0;
    }
  }

  trackDistance() {
    const meters = Math.min(this.currentMeters, this.level.length);
    if (meters > this.stats.distance) this.stats.distance = meters;

    if (this.car.position.x >= this.terrain.finishX) {
      this.state = SessionState.FINISHED;
      this.timers.finish = 0;
      this.events.emit('finish', { time: this.stats.time });
    }
  }

  /**
   * While fully airborne we integrate the chassis rotation. On landing on the
   * wheels, every full turn counts as a flip.
   */
  trackAir(dt) {
    const { car, air } = this;
    const angleDelta = wrapAngle(car.angle - air.lastAngle);
    air.lastAngle = car.angle;

    if (car.isAirborne) {
      air.time += dt;
      air.rotation += angleDelta;
      return;
    }

    if (air.time > 0) {
      if (car.isGrounded) this.rewardLanding();
      air.time = 0;
      air.rotation = 0;
    }
  }

  rewardLanding() {
    const { air, stats } = this;
    stats.bestAirTime = Math.max(stats.bestAirTime, air.time);

    const flips = Math.floor((Math.abs(air.rotation) + (Math.PI * 2 - RULES.flipThreshold)) / (Math.PI * 2));
    if (flips > 0) {
      stats.flips += flips;
      // Negative rotation is counter-clockwise on screen: a backflip when driving right.
      this.events.emit('flip', { count: flips, direction: air.rotation < 0 ? 'back' : 'front' });
    }
    if (air.time >= RULES.airTimeMinSeconds) this.events.emit('airtime', { seconds: air.time });
    this.events.emit('landed', { impact: this.car.velocity.y });
  }

  /** On its side or roof and not moving = the attempt cannot continue. */
  checkStuck(dt) {
    const { car } = this;
    const tilted = Math.abs(wrapAngle(car.angle)) > RULES.stuckAngle;
    if (tilted && car.speed < RULES.stuckSpeed) {
      this.timers.stuck += dt;
      if (this.timers.stuck >= RULES.stuckSeconds) this.end('failed', FailReason.FLIPPED);
    } else {
      this.timers.stuck = 0;
    }

    // Safety net: should never happen thanks to the deep ground slabs.
    if (car.position.y > this.terrain.heightAt(car.position.x) + TERRAIN.thickness) {
      this.end('failed', FailReason.FLIPPED);
    }
  }

  crash() {
    this.state = SessionState.CRASHED;
    this.timers.crash = 0;
    this.events.emit('crash', { x: this.car.head.position.x, y: this.car.head.position.y });
  }

  end(outcome, reason = null) {
    if (this.state === SessionState.OVER) return;
    this.state = SessionState.OVER;
    this.events.emit('gameover', { outcome, reason, stats: { ...this.stats } });
  }

  /** Read-only snapshot for the HUD, tests and debugging. */
  snapshot() {
    const { car } = this;
    const fuelX = this.content.upcomingFuelX(car.position.x);
    return {
      state: this.state,
      level: this.level.id,
      car: car.spec.id,
      fuel: this.fuel,
      boost: car.boost,
      hasBoost: Boolean(car.spec.boost),
      boosting: car.isBoosting,
      distance: this.stats.distance,
      length: this.level.length,
      progress: this.stats.distance / this.level.length,
      kills: this.stats.kills,
      flips: this.stats.flips,
      time: this.stats.time,
      currentMeters: this.currentMeters,
      speedKmh: (car.speed * 60 * 3.6) / PIXELS_PER_METER,
      angle: wrapAngle(car.angle),
      x: car.position.x,
      y: car.position.y,
      grounded: car.isGrounded,
      airborne: car.isAirborne,
      nextFuelMeters: fuelX === null ? null : (fuelX - car.position.x) / PIXELS_PER_METER,
      zombiesAlive: this.content.zombies.filter((zombie) => zombie.alive).length,
      bodies: Composite.allBodies(this.physics.world).length,
    };
  }

  destroy() {
    this.physics.clear();
  }
}

/**
 * Bounds covering where the bodies are now and where they will be after one
 * step at their current velocity (plus a small margin).
 */
function sweptBounds(bodies) {
  const margin = 4;
  const result = { min: { x: Infinity, y: Infinity }, max: { x: -Infinity, y: -Infinity } };
  for (const { bounds, velocity } of bodies) {
    result.min.x = Math.min(result.min.x, bounds.min.x, bounds.min.x + velocity.x) - margin;
    result.min.y = Math.min(result.min.y, bounds.min.y, bounds.min.y + velocity.y) - margin;
    result.max.x = Math.max(result.max.x, bounds.max.x, bounds.max.x + velocity.x) + margin;
    result.max.y = Math.max(result.max.y, bounds.max.y, bounds.max.y + velocity.y) + margin;
  }
  return result;
}
