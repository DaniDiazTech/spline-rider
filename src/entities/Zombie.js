/**
 * A zombie, in two physical forms:
 *
 *  ALIVE  one compound body (torso + head). A small "stay upright" correction
 *         keeps it on its feet like a wobbly toy, and it shuffles towards
 *         the car. Hitting it slowly just shoves it (and slows you down).
 *
 *  DEAD   hit hard enough, it is swapped for a ragdoll: six bodies (torso,
 *         head, two arms, two legs) joined by pin constraints, which flies
 *         off with the momentum of the impact.
 *
 * Legs and arms of a living zombie are only drawn (animated), not simulated.
 */
import { Matter } from '../lib/matter.js';
import { ZOMBIE, COLLISION } from '../config.js';

const { Bodies, Body, Constraint } = Matter;

const ZOMBIE_MASK = COLLISION.terrain | COLLISION.car | COLLISION.zombie | COLLISION.debris;
/** Corpses no longer touch the car: they would only jam under its wheels. */
const RAGDOLL_MASK = COLLISION.terrain | COLLISION.zombie | COLLISION.debris;

/** Ragdoll limb sizes (px), matching the sprites. */
const LIMB = { armWidth: 14, armLength: 25, legWidth: 14, legLength: 24 };

export class Zombie {
  /**
   * @param {number} x       feet position
   * @param {number} groundY road height under the feet
   * @param {object} random  seeded RNG (math/random.js)
   */
  constructor(x, groundY, random) {
    this.alive = true;
    this.walkSpeed = random.range(ZOMBIE.walkSpeedMin, ZOMBIE.walkSpeedMax);
    this.phase = random.range(0, Math.PI * 2); // walk-cycle offset
    this.skinTone = random.int(0, 2);
    this.deadTime = 0;
    this.group = Body.nextGroup(true);
    this.velocityBefore = { x: 0, y: 0 };
    /** Set by GameSession while the zombie is pressed against the car. */
    this.touchingCar = false;

    const { torsoWidth, torsoHeight, headRadius } = ZOMBIE;
    // Legs are drawn below the torso, so lift it by the leg length.
    const torsoY = groundY - LIMB.legLength - torsoHeight / 2 + 4;
    const filter = { group: this.group, category: COLLISION.zombie, mask: ZOMBIE_MASK };

    const torso = Bodies.rectangle(x, torsoY, torsoWidth, torsoHeight, {
      label: 'zombie-torso',
      chamfer: { radius: 6 },
    });
    const head = Bodies.circle(x, torsoY - torsoHeight / 2 - headRadius + 4, headRadius, {
      label: 'zombie-head',
    });
    // The feet: a small box at the bottom of the (drawn) legs, so the body
    // stands on the road at the right height.
    const feet = Bodies.rectangle(x, groundY - 6, torsoWidth, 12, { label: 'zombie-feet' });

    this.body = Body.create({
      parts: [torso, head, feet],
      label: 'zombie',
      collisionFilter: filter,
      friction: ZOMBIE.friction,
      frictionAir: 0.02,
    });
    Body.setDensity(this.body, ZOMBIE.density);
    // Torso centre and feet relative to the centre of mass (local frame), for drawing.
    this.torsoOffset = { x: torso.position.x - this.body.position.x, y: torso.position.y - this.body.position.y };
    this.feetOffset = { x: x - this.body.position.x, y: groundY - this.body.position.y };
    for (const part of this.body.parts) part.collisionFilter = filter;
    this.body.plugin.zombie = this;

    /** Ragdoll bodies and joints (filled in when the zombie dies). */
    this.ragdoll = null;
  }

  get position() {
    return this.alive ? this.body.position : this.ragdoll.parts.torso.position;
  }

  /** Bodies and constraints currently in the physics world. */
  get physicsObjects() {
    if (this.alive) return [this.body];
    return [...Object.values(this.ragdoll.parts), ...this.ragdoll.joints];
  }

  /** Called before every physics step while the zombie is alive. */
  think(carX) {
    if (!this.alive) return;
    const { body } = this;
    this.velocityBefore = { ...body.velocity };

    // Stay upright: steer the angle back to 0, like a weighted toy.
    Body.setAngularVelocity(body, body.angularVelocity * 0.7 - body.angle * ZOMBIE.uprightStrength);

    // Shamble towards the car once it is close enough (but do not keep
    // shoving it once in contact: a horde would otherwise push a car back).
    const distance = carX - body.position.x;
    const onFeet = Math.abs(body.angle) < 0.5 && Math.abs(body.velocity.y) < 1.5;
    const touching = this.touchingCar;
    this.touchingCar = false; // set again by the collision handler this step
    if (onFeet && !touching && Math.abs(distance) < ZOMBIE.noticeDistance) {
      const target = Math.sign(distance) * this.walkSpeed;
      Body.setVelocity(body, { x: body.velocity.x + (target - body.velocity.x) * 0.1, y: body.velocity.y });
    }
  }

  /**
   * Turns the zombie into a ragdoll.
   * @param {{x:number,y:number}} launch  extra velocity given by the impact (px/step)
   * @param {object} random
   * @returns the objects to swap in the physics world
   */
  die(launch, random) {
    const { position, velocity, angle } = this.body;
    this.alive = false;
    this.deadTime = 0;

    const filter = { group: this.group, category: COLLISION.zombie, mask: RAGDOLL_MASK };
    const options = (label) => ({ label, collisionFilter: filter, density: ZOMBIE.density * 0.8, friction: 0.8, frictionAir: 0.01 });
    const { torsoWidth, torsoHeight, headRadius } = ZOMBIE;

    // Build the ragdoll upright around the torso, then rotate it into place.
    const cx = position.x + this.torsoOffset.x;
    const cy = position.y + this.torsoOffset.y;
    const top = cy - torsoHeight / 2;
    const bottom = cy + torsoHeight / 2;
    const parts = {
      torso: Bodies.rectangle(cx, cy, torsoWidth, torsoHeight, { ...options('ragdoll'), chamfer: { radius: 6 } }),
      head: Bodies.circle(cx, top - headRadius + 4, headRadius, options('ragdoll')),
      armL: Bodies.rectangle(cx - 6, top + LIMB.armLength / 2, LIMB.armWidth, LIMB.armLength, options('ragdoll')),
      armR: Bodies.rectangle(cx + 6, top + LIMB.armLength / 2, LIMB.armWidth, LIMB.armLength, options('ragdoll')),
      legL: Bodies.rectangle(cx - 5, bottom + LIMB.legLength / 2 - 2, LIMB.legWidth, LIMB.legLength, options('ragdoll')),
      legR: Bodies.rectangle(cx + 5, bottom + LIMB.legLength / 2 - 2, LIMB.legWidth, LIMB.legLength, options('ragdoll')),
    };

    const pin = (bodyA, pointA, bodyB, pointB) =>
      Constraint.create({ bodyA, pointA, bodyB, pointB, length: 0, stiffness: 0.8, damping: 0.05 });
    const joints = [
      pin(parts.torso, { x: 0, y: -torsoHeight / 2 + 2 }, parts.head, { x: 0, y: headRadius - 2 }),
      pin(parts.torso, { x: -6, y: -torsoHeight / 2 + 4 }, parts.armL, { x: 0, y: -LIMB.armLength / 2 + 3 }),
      pin(parts.torso, { x: 6, y: -torsoHeight / 2 + 4 }, parts.armR, { x: 0, y: -LIMB.armLength / 2 + 3 }),
      pin(parts.torso, { x: -5, y: torsoHeight / 2 - 2 }, parts.legL, { x: 0, y: -LIMB.legLength / 2 + 3 }),
      pin(parts.torso, { x: 5, y: torsoHeight / 2 - 2 }, parts.legR, { x: 0, y: -LIMB.legLength / 2 + 3 }),
    ];

    for (const part of Object.values(parts)) {
      Body.rotate(part, angle, position);
      Body.setVelocity(part, {
        x: velocity.x + launch.x + random.range(-1, 1),
        y: velocity.y + launch.y + random.range(-1, 1),
      });
      Body.setAngularVelocity(part, random.range(-0.3, 0.3));
      part.plugin.zombie = this;
    }

    this.ragdoll = { parts, joints };
  }

  /** Transforms for the renderer. */
  get pose() {
    if (this.alive) {
      const { position, angle, velocity } = this.body;
      const { x: ox, y: oy } = this.feetOffset;
      return {
        alive: true,
        // Feet position: the walk sprite is anchored on it.
        x: position.x + ox * Math.cos(angle) - oy * Math.sin(angle),
        y: position.y + ox * Math.sin(angle) + oy * Math.cos(angle),
        angle,
        vx: velocity.x,
      };
    }
    const { parts } = this.ragdoll;
    const transform = (body) => ({ x: body.position.x, y: body.position.y, angle: body.angle });
    return {
      alive: false,
      torso: transform(parts.torso),
      head: transform(parts.head),
      armL: transform(parts.armL),
      armR: transform(parts.armR),
      legL: transform(parts.legL),
      legR: transform(parts.legR),
    };
  }
}

export const ZOMBIE_LIMBS = LIMB;
