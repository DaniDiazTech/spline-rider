/**
 * Everything placed on the road of a level: obstacles, zombie groups and
 * fuel cans. Content is created lazily, a little ahead of the generated road,
 * from the level's seed, so a level always looks the same.
 *
 * It also owns their lifetime: dead zombies fade away after a while and
 * anything left far behind the car is removed from the physics world.
 */
import { Matter } from '../lib/matter.js';
import { createRandom } from '../math/random.js';
import { Zombie } from '../entities/Zombie.js';
import { ObstacleFactory } from '../entities/Obstacles.js';
import { PIXELS_PER_METER, OBSTACLES, FUEL, ZOMBIE, COLLISION } from '../config.js';

const { Bodies } = Matter;

/** Nothing is placed before this x (the starting runway). */
const FIRST_CONTENT_X = 900;
/** Keep the finish area clear (px before the finish line). */
const FINISH_CLEARANCE = 450;
/** Content is only placed once this much road exists after it (px). */
const LOOKAHEAD = 600;
/** Cap on ragdolls lying around, for performance. */
const MAX_CORPSES = 14;

export class LevelContent {
  constructor(physics, terrain, level) {
    this.physics = physics;
    this.terrain = terrain;
    this.level = level;
    this.random = createRandom(level.seed ^ 0xbeef);

    this.zombies = [];
    this.obstacles = [];
    this.fuelCans = [];
    /** x ranges taken by obstacles, so zombies do not spawn inside them. */
    this.occupied = [];

    const m = PIXELS_PER_METER;
    this.nextFeatureX = FIRST_CONTENT_X + this.random.range(...level.features.gap) * m * 0.5;
    this.nextZombieX = FIRST_CONTENT_X + 200;
    this.nextFuelX = level.fuelCans.first * m;
    this.lastX = terrain.finishX - FINISH_CLEARANCE;

    terrain.onSpanCreated((_, endX) => this.populateUntil(endX));
    this.populateUntil(terrain.endX);
  }

  // ---------------------------------------------------------------------------
  // Placement
  // ---------------------------------------------------------------------------

  populateUntil(roadEndX) {
    const limit = Math.min(roadEndX - LOOKAHEAD, this.lastX);
    const m = PIXELS_PER_METER;
    const { features, zombies, fuelCans } = this.level;

    // Fuel first: obstacles (and their ramps) are then kept away from cans.
    while (this.nextFuelX < Math.min(roadEndX - LOOKAHEAD, this.terrain.finishX)) {
      this.placeFuelCan(this.nextFuelX);
      this.nextFuelX += fuelCans.spacing * m;
    }

    while (this.nextFeatureX < limit) {
      const x = this.findFreeSpot(this.nextFeatureX);
      this.placeFeature(x, this.pickFeature());
      this.nextFeatureX = x + this.random.range(...features.gap) * m;
    }

    while (this.nextZombieX < limit) {
      this.placeZombieGroup(this.nextZombieX, this.random.int(...zombies.group));
      this.nextZombieX += this.random.range(...zombies.gap) * m;
    }
  }

  /** Picks an obstacle type using the level's weights. */
  pickFeature() {
    const entries = Object.entries(this.level.features.weights);
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = this.random.range(0, total);
    for (const [type, weight] of entries) {
      roll -= weight;
      if (roll < 0) return type;
    }
    return entries[0][0];
  }

  /**
   * Moves x forward until the road is gentle enough to put things on and
   * the obstacle (with a possible ramp in front of it) does not cover a can.
   */
  findFreeSpot(x) {
    let spot = x;
    const clear = (at) =>
      Math.abs(this.terrain.slopeAt(at)) <= 0.35 && !this.overlaps(at - OBSTACLES.rampLength - 300, at + 180);
    for (let tries = 0; tries < 20 && !clear(spot); tries++) spot += 60;
    return spot;
  }

  placeFeature(x, type) {
    // Heavy obstacles always get a ramp in front, so they can be jumped.
    // Where no ramp fits (steep road), a lighter obstacle is used instead.
    let kind = type;
    if (kind === 'wreck' || kind === 'blocks') {
      const ramp = ObstacleFactory.ramp(this.terrain, x - OBSTACLES.rampLength - 240);
      if (ramp) this.addObstacle(ramp);
      else kind = 'barrel';
    }
    if (kind === 'ramp') {
      const ramp = ObstacleFactory.ramp(this.terrain, x);
      if (ramp) this.addObstacle(ramp);
      return;
    }
    this.addObstacle(ObstacleFactory[kind](this.terrain, x, this.random));
  }

  addObstacle(obstacle) {
    this.obstacles.push(obstacle);
    const xs = obstacle.bodies.flatMap((body) => [body.bounds.min.x, body.bounds.max.x]);
    this.occupied.push([Math.min(...xs) - 40, Math.max(...xs) + 40]);
    this.physics.add(obstacle.bodies, obstacle.constraints);
  }

  isOccupied(x) {
    return this.occupied.some(([from, to]) => x >= from && x <= to);
  }

  overlaps(fromX, toX) {
    return this.occupied.some(([from, to]) => from <= toX && to >= fromX);
  }

  placeZombieGroup(x, count) {
    for (let i = 0; i < count; i++) {
      const zx = x + i * this.random.range(52, 80);
      if (this.isOccupied(zx) || Math.abs(this.terrain.slopeAt(zx)) > 0.6) continue;
      const zombie = new Zombie(zx, this.terrain.heightAt(zx), this.random);
      this.zombies.push(zombie);
      this.physics.add(zombie.physicsObjects);
    }
  }

  placeFuelCan(x) {
    const size = FUEL.canSize;
    const y = this.terrain.heightAt(x) - size * 0.9;
    // The sensor is larger than the drawn can, so it is easy to grab mid-jump.
    const body = Bodies.circle(x, y, size * 1.4, {
      isStatic: true,
      isSensor: true,
      label: 'fuel',
      collisionFilter: { category: COLLISION.pickup, mask: COLLISION.car },
    });
    const can = { x, y, body, phase: this.random.range(0, Math.PI * 2) };
    body.plugin.fuelCan = can;
    this.fuelCans.push(can);
    this.occupied.push([x - 60, x + 60]);
    this.physics.add(body);
  }

  // ---------------------------------------------------------------------------
  // Runtime
  // ---------------------------------------------------------------------------

  /** Zombie brains, before every physics step. */
  think(carX) {
    for (const zombie of this.zombies) zombie.think(carX);
  }

  /** Swaps a living zombie for its ragdoll. */
  killZombie(zombie, launch) {
    if (!zombie.alive) return false;
    this.physics.remove(zombie.physicsObjects);
    zombie.die(launch, this.random);
    this.physics.add(zombie.physicsObjects);

    // Too many bodies lying around: remove the oldest corpse.
    const corpses = this.zombies.filter((z) => !z.alive);
    if (corpses.length > MAX_CORPSES) this.removeZombie(corpses[0]);
    return true;
  }

  removeZombie(zombie) {
    this.physics.remove(zombie.physicsObjects);
    this.zombies.splice(this.zombies.indexOf(zombie), 1);
  }

  removeObstacle(obstacle) {
    obstacle.alive = false;
    this.physics.remove(obstacle.bodies, obstacle.constraints);
    this.obstacles.splice(this.obstacles.indexOf(obstacle), 1);
  }

  /** Removes a single body of an obstacle (a smashed crate or plank). */
  removeBody(body) {
    const obstacle = body.plugin.obstacle;
    if (!obstacle?.alive || !obstacle.bodies.includes(body)) return false;
    this.physics.remove(body);
    obstacle.bodies.splice(obstacle.bodies.indexOf(body), 1);
    if (obstacle.bodies.length === 0) this.removeObstacle(obstacle);
    return true;
  }

  collectFuel(can) {
    const index = this.fuelCans.indexOf(can);
    if (index < 0) return false;
    this.fuelCans.splice(index, 1);
    this.physics.remove(can.body);
    return true;
  }

  /** x of the next fuel can ahead (even if not spawned yet), or null. */
  upcomingFuelX(x) {
    const can = this.fuelCans.find((item) => item.x > x);
    if (can) return can.x;
    return this.nextFuelX < this.terrain.finishX ? this.nextFuelX : null;
  }

  /** Ages corpses and removes everything far behind the road's left end. */
  update(dt) {
    const leftEdge = this.terrain.startX;

    for (const zombie of [...this.zombies]) {
      if (!zombie.alive) zombie.deadTime += dt;
      const gone = zombie.position.x < leftEdge || zombie.position.y > this.terrain.heightAt(zombie.position.x) + 400;
      if (gone || zombie.deadTime > ZOMBIE.corpseLifetime) this.removeZombie(zombie);
    }

    for (const obstacle of [...this.obstacles]) {
      const fellOff = obstacle.bodies.every((body) => body.position.y > this.terrain.heightAt(body.position.x) + 400);
      if (obstacle.bodies.every((body) => body.position.x < leftEdge) || fellOff) this.removeObstacle(obstacle);
    }

    for (const can of this.fuelCans.filter((item) => item.x < leftEdge)) this.collectFuel(can);
    this.occupied = this.occupied.filter(([, to]) => to > leftEdge);
  }

  destroy() {
    for (const zombie of [...this.zombies]) this.removeZombie(zombie);
    for (const obstacle of [...this.obstacles]) this.removeObstacle(obstacle);
    for (const can of [...this.fuelCans]) this.collectFuel(can);
  }
}
