/**
 * Wrapper around the Matter.js engine.
 *
 * Responsibilities:
 *  - run the simulation at a FIXED timestep (deterministic, frame-rate independent)
 *  - forward collision events to whoever subscribed
 *  - add / remove bodies and constraints
 */
import { Matter } from '../lib/matter.js';
import { PHYSICS } from '../config.js';

const { Engine, Composite, Events } = Matter;

export class PhysicsWorld {
  constructor() {
    this.engine = Engine.create({
      positionIterations: PHYSICS.positionIterations,
      velocityIterations: PHYSICS.velocityIterations,
      constraintIterations: PHYSICS.constraintIterations,
      enableSleeping: false,
    });
    this.engine.gravity.y = PHYSICS.gravityY;
    this.world = this.engine.world;

    this.accumulator = 0;
    this.collisionHandlers = { start: [], active: [], end: [] };

    Events.on(this.engine, 'collisionStart', (event) => this.dispatch('start', event.pairs));
    Events.on(this.engine, 'collisionActive', (event) => this.dispatch('active', event.pairs));
    Events.on(this.engine, 'collisionEnd', (event) => this.dispatch('end', event.pairs));
  }

  /** Subscribe to collisions. `phase` is 'start' | 'active' | 'end'. */
  onCollision(phase, handler) {
    this.collisionHandlers[phase].push(handler);
  }

  dispatch(phase, pairs) {
    for (const handler of this.collisionHandlers[phase]) {
      for (const pair of pairs) handler(pair);
    }
  }

  add(...items) {
    Composite.add(this.world, items.flat());
  }

  remove(...items) {
    Composite.remove(this.world, items.flat());
  }

  /**
   * Advances the simulation by the real elapsed time, using as many fixed
   * steps as needed. `beforeStep` runs before every single step (input,
   * forces...), `afterStep` right after it (game rules).
   *
   * @returns {number} interpolation factor (0..1) between the last two steps
   */
  advance(elapsedMs, beforeStep, afterStep) {
    this.accumulator += Math.min(elapsedMs, PHYSICS.timestep * PHYSICS.maxStepsPerFrame);

    while (this.accumulator >= PHYSICS.timestep) {
      beforeStep(PHYSICS.timestep / 1000);
      Engine.update(this.engine, PHYSICS.timestep);
      afterStep(PHYSICS.timestep / 1000);
      this.accumulator -= PHYSICS.timestep;
    }

    return this.accumulator / PHYSICS.timestep;
  }

  /** Removes everything and resets the clock (used when restarting). */
  clear() {
    Composite.clear(this.world, false, true);
    this.accumulator = 0;
  }
}
