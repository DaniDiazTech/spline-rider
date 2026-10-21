/**
 * The procedural road of one level.
 *
 * Pipeline (left to right, generated lazily as the car advances):
 *
 *   1. Control points  every `controlSpacing` px, height = Perlin fBm noise
 *                      scaled by the level's difficulty, slope-limited for fairness.
 *                      Flat at the start and around the finish line.
 *   2. Samples         a uniform Catmull-Rom spline through the control points,
 *                      giving a smooth curve that passes through every point.
 *   3. Ground slabs    one static Matter.js parallelogram per pair of samples.
 *                      Neighbouring slabs share their top vertices exactly, so
 *                      the road surface is continuous for the wheels.
 *
 * Old segments far behind the car are removed to keep the world small.
 */
import { Matter } from '../lib/matter.js';
import { PerlinNoise1D } from '../math/perlin.js';
import { catmullRom } from '../math/splines.js';
import { clamp, lerp, smoothstep } from '../math/utils.js';
import { TERRAIN, PIXELS_PER_METER, COLLISION } from '../config.js';

const { Bodies, Body } = Matter;

const WALL_HEIGHT = 3000;

export class Terrain {
  /**
   * @param {PhysicsWorld} physics
   * @param {object} level  entry of data/levels.js (seed, length, terrain)
   */
  constructor(physics, level) {
    this.physics = physics;
    this.level = level;
    this.noise = new PerlinNoise1D(level.seed);
    this.driftNoise = new PerlinNoise1D(level.seed ^ 0x5f3759df);

    /** Finish line and the very end of the road (px). */
    this.finishX = level.length * PIXELS_PER_METER;
    this.worldEndX = this.finishX + TERRAIN.finishRunout;

    this.controlPoints = [];
    /** Smooth surface points, sorted by x. Used for rendering and lookups. */
    this.samples = [];
    /** Generated spans: { startX, endX, bodies } */
    this.spans = [];
    /** Callbacks notified when a new span exists: (startX, endX) => void */
    this.spanListeners = [];

    // Start a few control points left of x = 0 so the car spawns on solid ground.
    this.nextControlIndex = -13;
    this.previousHeight = this.heightField(this.nextControlIndex * TERRAIN.controlSpacing);

    // Seed the first control points (the spline needs neighbours on both sides).
    for (let i = 0; i < 4; i++) this.pushControlPoint();

    // An invisible wall at the left edge of the generated road keeps the car
    // on the map. It moves forward whenever old road is pruned.
    this.leftWall = Bodies.rectangle(0, 0, 40, WALL_HEIGHT, {
      isStatic: true,
      label: 'terrain',
      collisionFilter: { category: COLLISION.terrain },
    });
    this.rightWall = null;
    this.physics.add(this.leftWall);
    this.generateSpan();
    this.moveLeftWall();
  }

  onSpanCreated(listener) {
    this.spanListeners.push(listener);
  }

  /** Track generated so far, right end. */
  get endX() {
    return this.samples.length ? this.samples[this.samples.length - 1].x : 0;
  }

  get startX() {
    return this.samples.length ? this.samples[0].x : 0;
  }

  /**
   * Makes sure the road exists from `x - keepBehind` to `x + generateAhead`.
   * Called every frame with the car position.
   */
  update(x) {
    while (this.endX < x + TERRAIN.generateAhead && !this.isComplete) this.generateSpan();
    this.pruneBehind(x - TERRAIN.keepBehind);
  }

  /** True once the road reaches the end of the level. */
  get isComplete() {
    return this.endX >= this.worldEndX;
  }

  // ---------------------------------------------------------------------------
  // Generation
  // ---------------------------------------------------------------------------

  /** Height (y) of the raw noise field at a given x, before smoothing. */
  heightField(x) {
    // Behind the start the road bends up into a ramp. Together with the
    // reverse limiter (see GameSession) gravity rolls the car back to the start.
    if (x < TERRAIN.backRampStart) {
      const d = TERRAIN.backRampStart - x;
      return TERRAIN.baseY - TERRAIN.backRampSlope * d * smoothstep(0, TERRAIN.backRampEase, d);
    }
    if (x <= TERRAIN.flatStartLength || x >= this.finishX) return TERRAIN.baseY;

    // Hills grow along the level, from amplitudeStart to amplitudeEnd.
    const { amplitudeStart, amplitudeEnd, driftAmplitude } = this.level.terrain;
    const amplitude = lerp(amplitudeStart, amplitudeEnd, smoothstep(0, this.finishX, x));

    // Hills fade in after the starting runway and fade out before the finish.
    const easeIn = smoothstep(TERRAIN.flatStartLength, TERRAIN.flatStartLength + TERRAIN.easeInLength, x);
    const easeOut = 1 - smoothstep(this.finishX - TERRAIN.finishEaseLength, this.finishX - 150, x);

    const hills = this.noise.fbm(x * TERRAIN.noiseFrequency, TERRAIN.octaves, TERRAIN.persistence);
    const drift = this.driftNoise.noise(x * TERRAIN.driftFrequency) * 2;

    // Screen y grows downwards, so "higher" hills mean smaller y.
    return TERRAIN.baseY - easeIn * easeOut * (hills * amplitude + drift * driftAmplitude);
  }

  pushControlPoint() {
    const x = this.nextControlIndex * TERRAIN.controlSpacing;
    let y = this.heightField(x);

    // Limit the slope between consecutive points so every hill is climbable
    // (the back ramp has its own shape, so it is left alone).
    if (x > TERRAIN.backRampStart) {
      const maxRise = TERRAIN.maxSlope * TERRAIN.controlSpacing;
      y = clamp(y, this.previousHeight - maxRise, this.previousHeight + maxRise);
    }

    this.controlPoints.push({ x, y });
    this.previousHeight = y;
    this.nextControlIndex++;
  }

  /**
   * Builds the spline segment between control points [n-3] and [n-2]
   * (the last four points are P0..P3), then its physics slabs.
   */
  generateSpan() {
    this.pushControlPoint();

    const count = this.controlPoints.length;
    const [p0, p1, p2, p3] = this.controlPoints.slice(count - 4);

    const newSamples = [];
    const firstStep = this.samples.length === 0 ? 0 : 1; // avoid duplicating p1
    for (let s = firstStep; s <= TERRAIN.samplesPerSpan; s++) {
      newSamples.push(catmullRom(p0, p1, p2, p3, s / TERRAIN.samplesPerSpan));
    }

    // Connect to the previous span's last sample so slabs are seamless.
    const chain = this.samples.length
      ? [this.samples[this.samples.length - 1], ...newSamples]
      : newSamples;

    const bodies = [];
    for (let i = 0; i < chain.length - 1; i++) {
      bodies.push(createGroundSlab(chain[i], chain[i + 1]));
    }
    this.physics.add(bodies);

    this.samples.push(...newSamples);
    const span = { startX: p1.x, endX: p2.x, bodies };
    this.spans.push(span);

    // Keep only the control points the spline still needs.
    if (this.controlPoints.length > 8) this.controlPoints.splice(0, this.controlPoints.length - 8);

    for (const listener of this.spanListeners) listener(span.startX, span.endX);

    // Close the world with a wall once the road reaches its end.
    if (this.isComplete && !this.rightWall) {
      this.rightWall = Bodies.rectangle(this.endX + 20, this.heightAt(this.endX) - WALL_HEIGHT / 2 + 200, 40, WALL_HEIGHT, {
        isStatic: true,
        label: 'terrain',
        collisionFilter: { category: COLLISION.terrain },
      });
      this.physics.add(this.rightWall);
    }
  }

  pruneBehind(limitX) {
    while (this.spans.length > 2 && this.spans[0].endX < limitX) {
      const span = this.spans.shift();
      this.physics.remove(span.bodies);
    }
    // Drop render samples that are no longer backed by physics.
    const firstX = this.spans.length ? this.spans[0].startX : -Infinity;
    let cut = 0;
    while (cut < this.samples.length - 1 && this.samples[cut + 1].x <= firstX) cut++;
    if (cut > 0) {
      this.samples.splice(0, cut);
      this.moveLeftWall();
    }
  }

  moveLeftWall() {
    const x = this.startX;
    Body.setPosition(this.leftWall, { x: x - 20, y: this.heightAt(x) - WALL_HEIGHT / 2 + 200 });
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  /** Index of the last sample with sample.x <= x (binary search). */
  indexAt(x) {
    let low = 0;
    let high = this.samples.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (this.samples[mid].x <= x) low = mid;
      else high = mid - 1;
    }
    return low;
  }

  /** Road surface height (y) at x, linearly interpolated between samples. */
  heightAt(x) {
    if (!this.samples.length) return TERRAIN.baseY;
    const i = this.indexAt(x);
    const a = this.samples[i];
    const b = this.samples[Math.min(i + 1, this.samples.length - 1)];
    if (b.x === a.x) return a.y;
    const t = clamp((x - a.x) / (b.x - a.x), 0, 1);
    return a.y + (b.y - a.y) * t;
  }

  /** Surface angle (radians) at x. Positive = road goes down to the right. */
  slopeAt(x) {
    const i = this.indexAt(x);
    const a = this.samples[i];
    const b = this.samples[Math.min(i + 1, this.samples.length - 1)];
    return Math.atan2(b.y - a.y, b.x - a.x || 1);
  }

  /** Samples visible between two x positions (with one extra on each side). */
  visibleSamples(fromX, toX) {
    const start = Math.max(0, this.indexAt(fromX) - 1);
    const end = Math.min(this.samples.length, this.indexAt(toX) + 2);
    return this.samples.slice(start, end);
  }

  destroy() {
    for (const span of this.spans) this.physics.remove(span.bodies);
    this.physics.remove(this.leftWall);
    if (this.rightWall) this.physics.remove(this.rightWall);
    this.spans = [];
    this.samples = [];
  }
}

/**
 * A static parallelogram whose top edge is the road segment a -> b and which
 * extends `thickness` px straight down.
 */
function createGroundSlab(a, b) {
  const depth = TERRAIN.thickness;
  const vertices = [
    { x: a.x, y: a.y },
    { x: b.x, y: b.y },
    { x: b.x, y: b.y + depth },
    { x: a.x, y: a.y + depth },
  ];
  // The centroid of a parallelogram is the mean of its vertices; Matter
  // re-centres vertices around the body position, so this keeps them in place.
  const cx = (a.x + b.x) / 2;
  const cy = (a.y + b.y) / 2 + depth / 2;

  return Bodies.fromVertices(cx, cy, [vertices], {
    isStatic: true,
    label: 'terrain',
    friction: 1,
    frictionStatic: 6,
    restitution: 0,
    collisionFilter: { category: COLLISION.terrain },
  });
}
