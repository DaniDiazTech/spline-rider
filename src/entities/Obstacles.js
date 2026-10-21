/**
 * Things in the way. Each factory returns an obstacle record:
 *   { type, x, bodies, constraints, alive }
 *
 *  crates     a small pyramid of light wooden boxes (they break on impact)
 *  barrel     explosive barrel: a hard hit sets it off (see GameSession)
 *  barricade  a row of standing planks to smash through
 *  ramp       static curved wooden kicker: launches the car over trouble
 *  wreck      a heavy abandoned car; push it or jump it
 *  blocks     a concrete block, very heavy
 *
 * Every body keeps a link to its obstacle in `body.plugin.obstacle`.
 */
import { Matter } from '../lib/matter.js';
import { sampleBezier } from '../math/splines.js';
import { OBSTACLES, COLLISION } from '../config.js';

const { Bodies } = Matter;

const DEBRIS_FILTER = {
  category: COLLISION.debris,
  mask: COLLISION.terrain | COLLISION.car | COLLISION.zombie | COLLISION.debris,
};

/** Shared options for movable props. */
function debris(label, density, extra = {}) {
  return { label, density, friction: 0.7, frictionAir: 0.01, restitution: 0.1, collisionFilter: DEBRIS_FILTER, ...extra };
}

function makeObstacle(type, x, bodies, constraints = []) {
  const obstacle = { type, x, bodies, constraints, alive: true };
  for (const body of bodies) body.plugin.obstacle = obstacle;
  return obstacle;
}

/**
 * Factories: (terrain, x, random) => obstacle. The terrain is used to sit
 * every prop on the road surface.
 */
export const ObstacleFactory = {
  crates(terrain, x, random) {
    const size = OBSTACLES.crateSize;
    const rows = random.int(2, 3);
    const bodies = [];
    const ground = restingHeight(terrain, x - size * 1.5, x + size * 1.5);
    for (let row = 0; row < rows; row++) {
      const count = rows - row;
      for (let i = 0; i < count; i++) {
        const cx = x + (i - (count - 1) / 2) * (size + 1);
        const cy = ground - size / 2 - row * size - 1;
        bodies.push(Bodies.rectangle(cx, cy, size, size, debris('crate', OBSTACLES.crateDensity)));
      }
    }
    return makeObstacle('crates', x, bodies);
  },

  barrel(terrain, x) {
    const { barrelWidth: w, barrelHeight: h } = OBSTACLES;
    const ground = restingHeight(terrain, x - w / 2, x + w / 2);
    const body = Bodies.rectangle(x, ground - h / 2 - 1, w, h, debris('barrel', OBSTACLES.barrelDensity, { chamfer: { radius: 4 } }));
    return makeObstacle('barrel', x, [body]);
  },

  barricade(terrain, x, random) {
    const { plankWidth: w, plankHeight: h } = OBSTACLES;
    const count = random.int(3, 5);
    const bodies = [];
    for (let i = 0; i < count; i++) {
      const px = x + i * (w + 4);
      const ground = restingHeight(terrain, px - w / 2, px + w / 2);
      bodies.push(Bodies.rectangle(px, ground - h / 2 - 1, w, h, debris('plank', OBSTACLES.plankDensity)));
    }
    return makeObstacle('barricade', x, bodies);
  },

  /**
   * A static wooden kicker ramp: low end at x, high end at x + length.
   *
   * The deck is a quadratic Bezier curve (De Casteljau): flat where the car
   * drives on, steeper at the lip, so it launches the car upwards. Matter.js
   * needs convex shapes, so the ramp is built like the road: one convex slab
   * under every segment of the curve.
   *
   * The height adapts to the road so the incline is never too steep; returns
   * null when no sensible ramp fits here.
   */
  ramp(terrain, x) {
    const { rampLength: length, rampHeight, rampMaxAngle, rampSegments } = OBSTACLES;
    const x1 = x + length;
    const y0 = terrain.heightAt(x);
    const y1 = terrain.heightAt(x1);
    // Rise already given by the road (y grows downwards) and the room left.
    const roadRise = y0 - y1;
    const height = Math.min(rampHeight, Math.tan(rampMaxAngle) * length - roadRise);
    if (height < OBSTACLES.rampMinHeight) return null;

    const deck = sampleBezier(
      [{ x, y: y0 + 2 }, { x: x + length * 0.55, y: y0 + 2 - roadRise * 0.55 }, { x: x1, y: y1 - height }],
      rampSegments,
    );
    // A short back slope behind the lip, so a slow car rolls off instead of
    // getting stuck straddling a vertical edge.
    const backLength = height * OBSTACLES.rampBackRatio;
    const back = sampleBezier(
      [{ x: x1, y: y1 - height }, { x: x1 + backLength * 0.3, y: y1 - height }, { x: x1 + backLength, y: terrain.heightAt(x1 + backLength) + 2 }],
      4,
    ).slice(1);
    deck.push(...back);

    const bodies = [];
    for (let i = 0; i < deck.length - 1; i++) {
      const a = deck[i];
      const b = deck[i + 1];
      // Keep every slab convex: its bottom is always below the deck.
      const bottomA = Math.max(terrain.heightAt(a.x) + 12, a.y + 8);
      const bottomB = Math.max(terrain.heightAt(b.x) + 12, b.y + 8);
      const vertices = [a, b, { x: b.x, y: bottomB }, { x: a.x, y: bottomA }];
      const cx = vertices.reduce((sum, v) => sum + v.x, 0) / 4;
      const cy = vertices.reduce((sum, v) => sum + v.y, 0) / 4;
      bodies.push(
        Bodies.fromVertices(cx, cy, [vertices], {
          isStatic: true,
          label: 'terrain',
          friction: 1,
          frictionStatic: 6,
          collisionFilter: { category: COLLISION.terrain },
        }),
      );
    }
    const obstacle = makeObstacle('ramp', x, bodies);
    obstacle.deck = deck;
    obstacle.lipIndex = rampSegments;
    obstacle.base = deck.map((point) => ({ x: point.x, y: Math.max(terrain.heightAt(point.x) + 12, point.y + 8) }));
    return obstacle;
  },

  wreck(terrain, x) {
    const { wreckWidth: w, wreckHeight: h } = OBSTACLES;
    const ground = restingHeight(terrain, x - w / 2, x + w / 2);
    const options = debris('wreck', OBSTACLES.wreckDensity, { chamfer: { radius: [20, 16, 4, 4] }, friction: 0.9 });
    const body = Bodies.rectangle(x, ground - h / 2 - 1, w, h, options);
    return makeObstacle('wreck', x, [body]);
  },

  /** A low concrete block: heavy, but the car can shove it or jump it. */
  blocks(terrain, x) {
    const { blockWidth: w, blockHeight: h } = OBSTACLES;
    const ground = restingHeight(terrain, x - w / 2, x + w / 2);
    const options = debris('block', OBSTACLES.blockDensity, { chamfer: { radius: 4 } });
    const body = Bodies.rectangle(x, ground - h / 2 - 1, w, h, options);
    return makeObstacle('blocks', x, [body]);
  },
};

/**
 * Height to rest a prop on: the highest road point under its footprint
 * (smallest y, since y grows downwards), so it never spawns inside a hill.
 */
function restingHeight(terrain, fromX, toX) {
  let top = Infinity;
  for (let x = fromX; x <= toX; x += 8) top = Math.min(top, terrain.heightAt(x));
  return top;
}
