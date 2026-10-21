/**
 * The player's vehicle, built from Matter.js rigid bodies:
 *
 *            (head)          <- the roof: touching the ground with it = crash
 *          [ cabin ]
 *     [=====chassis=====]>   <- one compound body (plus a plow on the van)
 *        \ /       \ /       <- 2 springs per wheel, arranged as a "V"
 *        (O)       (O)       <- wheels (circles), all-wheel drive
 *
 * Driving model (inspired by Hill Climb Racing / Earn to Die):
 *  - Gas spins both wheels forward, brake slows them and then reverses.
 *  - On the ground, the engine's reaction tilts the body (wheelies!).
 *  - In the air, gas rotates the car backwards and brake rotates it forwards.
 *  - Cars with nitro can boost: a forward push along the chassis, even mid-air.
 *
 * All sizes and engine numbers come from a car spec (data/cars.js).
 */
import { Matter } from '../lib/matter.js';
import { VEHICLE, COLLISION } from '../config.js';
import { clamp, lerp } from '../math/utils.js';

const { Bodies, Body, Constraint } = Matter;

export class Car {
  /**
   * @param {object} spec  entry of data/cars.js
   * @param {number} x @param {number} y  spawn position of the chassis centre
   */
  constructor(spec, x, y) {
    this.spec = spec;

    // Bodies in the same negative group never collide with each other.
    const group = Body.nextGroup(true);
    const filter = {
      group,
      category: COLLISION.car,
      mask: COLLISION.terrain | COLLISION.pickup | COLLISION.zombie | COLLISION.debris,
    };

    this.chassis = createChassis(spec, x, y, filter);
    this.head = this.chassis.parts.find((part) => part.label === 'head');

    // Offset from the centre of mass to the plate centre (local frame).
    // Renderers draw the sprites around the plate centre.
    this.bodyOffset = { x: x - this.chassis.position.x, y: y - this.chassis.position.y };
    /** Extent of the body around the plate centre (for exhaust, flames...). */
    this.extent = measureExtent(spec);
    const { wheels } = spec;
    this.rearWheel = createWheel(spec, x - wheels.offsetX, y + wheels.offsetY, filter, 'rear');
    this.frontWheel = createWheel(spec, x + wheels.offsetX, y + wheels.offsetY, filter, 'front');
    this.wheels = [this.rearWheel, this.frontWheel];
    this.bodies = [this.chassis, ...this.wheels];

    this.springs = [
      ...createSuspension(spec, this.chassis, this.rearWheel, { x: x - wheels.offsetX, y }),
      ...createSuspension(spec, this.chassis, this.frontWheel, { x: x + wheels.offsetX, y }),
    ];

    /** Nitro left, 0..1 (only for cars that have a boost). */
    this.boost = spec.boost ? 1 : 0;
    this.isBoosting = false;
    /** Chassis velocity at the start of the step, used to measure impacts. */
    this.velocityBefore = { x: 0, y: 0 };

    /** Which parts touched the ground during the current step. */
    this.contacts = { rear: false, front: false, body: false };
    /**
     * Steps since each part last touched the ground. Rolling wheels lose
     * contact for a step or two all the time; a short grace period keeps the
     * "grounded" state stable instead of flickering.
     */
    this.stepsSinceContact = { rear: Infinity, front: Infinity, body: Infinity };

    /** -1 (brake/reverse) .. 0 .. +1 (gas), as applied this step. */
    this.throttle = 0;
    /** Consecutive steps without wheel contact. */
    this.stepsAirborne = 0;

    // Previous transforms, used to interpolate rendering between physics steps.
    this.previous = this.captureTransforms();
  }

  /** Everything that must be added to the physics world. */
  get physicsObjects() {
    return [this.chassis, ...this.wheels, ...this.springs];
  }

  get position() {
    return this.chassis.position;
  }

  get velocity() {
    return this.chassis.velocity;
  }

  /** Chassis speed in px/step. */
  get speed() {
    return Math.hypot(this.chassis.velocity.x, this.chassis.velocity.y);
  }

  get angle() {
    return this.chassis.angle;
  }

  /** Rear / front wheel on the ground (with grace period). */
  get rearGrounded() {
    return this.stepsSinceContact.rear <= VEHICLE.contactGraceSteps;
  }

  get frontGrounded() {
    return this.stepsSinceContact.front <= VEHICLE.contactGraceSteps;
  }

  get isGrounded() {
    return this.rearGrounded || this.frontGrounded;
  }

  /** True when no part of the car has touched anything for a moment. */
  get isAirborne() {
    return !this.isGrounded && this.stepsSinceContact.body > VEHICLE.contactGraceSteps;
  }

  /** Average wheel spin (rad/step); drives the engine sound and dust. */
  get wheelSpin() {
    return (this.rearWheel.angularVelocity + this.frontWheel.angularVelocity) / 2;
  }

  // ---------------------------------------------------------------------------
  // Per-step logic
  // ---------------------------------------------------------------------------

  /** Called before each physics step. */
  beginStep() {
    this.previous = this.captureTransforms();
    this.velocityBefore = { ...this.chassis.velocity };
    this.dampSuspension();
  }

  /**
   * Shock absorbers.
   *
   * Matter.js constraints have a `damping` option, but it compares only the
   * velocities of the two body centres. For a spring mounted off-centre on a
   * rotating chassis that is wrong: plain rotation looks like compression and
   * gets damped away (the car could barely rotate in the air). Here we use the
   * real velocity of the mounting point, v + w x r, instead.
   */
  dampSuspension() {
    const { chassis } = this;
    const w = chassis.angularVelocity;

    for (const spring of this.springs) {
      const wheel = spring.bodyB;
      const r = spring.pointA; // Matter keeps this rotated with the chassis
      const anchor = { x: chassis.position.x + r.x, y: chassis.position.y + r.y };
      const anchorVelocity = { x: chassis.velocity.x - w * r.y, y: chassis.velocity.y + w * r.x };

      const dx = wheel.position.x - anchor.x;
      const dy = wheel.position.y - anchor.y;
      const length = Math.hypot(dx, dy) || 1;
      const nx = dx / length;
      const ny = dy / length;

      // Speed at which the spring is stretching (+) or compressing (-).
      const stretchSpeed =
        (wheel.velocity.x - anchorVelocity.x) * nx + (wheel.velocity.y - anchorVelocity.y) * ny;

      // Remove part of it, split between both bodies by mass (momentum is conserved).
      const impulse = stretchSpeed * this.spec.suspension.damping;
      const total = wheel.mass + chassis.mass;
      const wheelShare = chassis.mass / total;
      const chassisShare = wheel.mass / total;
      Body.setVelocity(wheel, {
        x: wheel.velocity.x - nx * impulse * wheelShare,
        y: wheel.velocity.y - ny * impulse * wheelShare,
      });
      Body.setVelocity(chassis, {
        x: chassis.velocity.x + nx * impulse * chassisShare,
        y: chassis.velocity.y + ny * impulse * chassisShare,
      });
    }
  }

  /** Clears contact flags; the collision handlers set them again during the step. */
  resetContacts() {
    this.contacts.rear = false;
    this.contacts.front = false;
    this.contacts.body = false;
  }

  /** Called after each physics step, once the collision handlers have run. */
  endStep() {
    for (const part of ['rear', 'front', 'body']) {
      this.stepsSinceContact[part] = this.contacts[part] ? 0 : this.stepsSinceContact[part] + 1;
    }
    this.stepsAirborne = this.isGrounded ? 0 : this.stepsAirborne + 1;
  }

  /** Marks a car part as touching something solid (called from collision events). */
  registerContact(part) {
    if (part === this.rearWheel) this.contacts.rear = true;
    else if (part === this.frontWheel) this.contacts.front = true;
    else if (part.parent === this.chassis) this.contacts.body = true;
  }

  /** True when `body` is any part of this car. */
  owns(body) {
    return body === this.rearWheel || body === this.frontWheel || body.parent === this.chassis;
  }

  isHead(body) {
    return body === this.head;
  }

  /**
   * Applies driver input for one physics step.
   * @param {number} input  -1..1 requested throttle
   * @param {boolean} hasFuel  without fuel the engine produces nothing
   */
  drive(input, hasFuel) {
    this.throttle = hasFuel ? clamp(input, -1, 1) : 0;

    for (const wheel of this.wheels) this.driveWheel(wheel, this.throttle);

    if (this.isGrounded) {
      // Engine reaction torque: accelerating lifts the nose, braking dips it.
      // It fades out as the car tilts, so it can never hold the car upright
      // on its tail; past ~60 degrees gravity alone decides.
      const upright = Math.max(0, Math.cos(this.chassis.angle));
      this.addChassisSpin(-this.throttle * VEHICLE.groundTiltTorque * upright * upright);
    } else if (this.throttle === 0) {
      // Stylised physics: with no pedal pressed the rotation settles quickly,
      // which makes landings controllable (as in most hill-climb games).
      this.spinAssembly(-this.chassis.angularVelocity * VEHICLE.airSpinDamping);
    } else {
      // Air control: rotate the whole car, capped so it stays controllable.
      // Its strength ramps up with time in the air, so short hops over bumps
      // barely rotate the car while long jumps allow full flips.
      const authority = Math.min(1, this.stepsAirborne / VEHICLE.airControlRampSteps);
      const current = this.chassis.angularVelocity;
      const change = this.throttle * VEHICLE.airTiltAcceleration * authority;
      const target = clamp(current - change, -VEHICLE.maxAirSpin, VEHICLE.maxAirSpin);
      // Never let the cap itself push the spin back (e.g. after a hard bounce).
      if (Math.abs(target) < Math.abs(current) && Math.sign(target) === Math.sign(-change)) return;
      this.spinAssembly(target - current);
    }
  }

  /**
   * Nitro: pushes the whole car forward along the chassis direction.
   * @param {boolean} requested  boost key held
   * @param {number} dt  seconds per step
   */
  applyBoost(requested, dt) {
    const { boost } = this.spec;
    this.isBoosting = Boolean(boost) && requested && this.boost > 0;
    if (!this.isBoosting) return;

    this.boost = Math.max(0, this.boost - dt / boost.capacitySeconds);
    const direction = { x: Math.cos(this.chassis.angle), y: Math.sin(this.chassis.angle) };
    // Same acceleration for every body, so the boost does not twist the car.
    for (const body of this.bodies) {
      Body.setVelocity(body, {
        x: body.velocity.x + direction.x * boost.acceleration,
        y: body.velocity.y + direction.y * boost.acceleration,
      });
    }
  }

  refillBoost() {
    if (this.spec.boost) this.boost = 1;
  }

  /**
   * Adds angular velocity `delta` to the car as ONE rigid object (chassis and
   * wheels together) around their common centre of mass.
   *
   * Spinning only the chassis does not work: the suspension springs would
   * immediately drag that rotation back into the wheels, which were not
   * rotating with it. A rigid rotation gives every body the extra velocity
   * v = delta x r, where r is its offset from the centre of mass.
   */
  spinAssembly(delta) {
    const { bodies } = this;
    const totalMass = bodies.reduce((sum, body) => sum + body.mass, 0);
    const center = bodies.reduce(
      (sum, body) => ({
        x: sum.x + (body.position.x * body.mass) / totalMass,
        y: sum.y + (body.position.y * body.mass) / totalMass,
      }),
      { x: 0, y: 0 },
    );

    for (const body of bodies) {
      const rx = body.position.x - center.x;
      const ry = body.position.y - center.y;
      // 2D cross product of (0, 0, delta) with (rx, ry): (-delta * ry, delta * rx).
      Body.setVelocity(body, { x: body.velocity.x - delta * ry, y: body.velocity.y + delta * rx });
      Body.setAngularVelocity(body, body.angularVelocity + delta);
    }
  }

  driveWheel(wheel, throttle) {
    const engine = this.spec.engine;
    let spin = wheel.angularVelocity;

    if (throttle > 0) {
      // Accelerate forward (clockwise = positive), never faster than top speed.
      // If already faster (going downhill) we leave it alone.
      if (spin < engine.maxSpin) spin = Math.min(spin + engine.acceleration * throttle, engine.maxSpin);
    } else if (throttle < 0) {
      // Rolling forward: brake hard. Stopped or rolling back: reverse gently.
      const rate = spin > 0 ? engine.brake : engine.acceleration;
      if (spin > -engine.maxReverseSpin) spin = Math.max(spin + rate * throttle, -engine.maxReverseSpin);
    } else {
      spin *= VEHICLE.rollingResistance;
    }

    Body.setAngularVelocity(wheel, spin);
  }

  addChassisSpin(delta) {
    Body.setAngularVelocity(this.chassis, this.chassis.angularVelocity + delta);
  }

  // ---------------------------------------------------------------------------
  // Rendering helpers
  // ---------------------------------------------------------------------------

  captureTransforms() {
    return this.bodies.map((body) => ({
      x: body.position.x,
      y: body.position.y,
      angle: body.angle,
    }));
  }

  /**
   * Transforms blended between the previous and current physics step, so the
   * car moves smoothly even on 120/144 Hz screens.
   * @returns {{ chassis, rear, front }} each { x, y, angle }
   */
  interpolated(alpha) {
    const current = this.captureTransforms();
    const [chassis, rear, front] = current.map((now, i) => {
      const before = this.previous[i];
      return {
        x: lerp(before.x, now.x, alpha),
        y: lerp(before.y, now.y, alpha),
        angle: lerp(before.angle, now.angle, alpha),
      };
    });
    return { chassis, rear, front };
  }
}

// -----------------------------------------------------------------------------
// Body factories
// -----------------------------------------------------------------------------

function measureExtent(spec) {
  const xs = spec.parts.flatMap((shape) => (shape.type === 'poly' ? shape.points.map((point) => point.x) : [shape.x - shape.w / 2, shape.x + shape.w / 2]));
  const ys = spec.parts.flatMap((shape) => (shape.type === 'poly' ? shape.points.map((point) => point.y) : [shape.y - shape.h / 2, shape.y + shape.h / 2]));
  return { rear: Math.min(...xs), front: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
}

/**
 * Builds the compound chassis from the shapes listed in the car spec. The
 * first shape is labelled 'chassis' (the floor of the car); the head circle
 * is the driver.
 */
function createChassis(spec, x, y, collisionFilter) {
  const parts = spec.parts.map((shape, index) => {
    const label = shape.label ?? (index === 0 ? 'chassis' : 'cabin');
    if (shape.type === 'poly') {
      const points = shape.points.map((point) => ({ x: x + point.x, y: y + point.y }));
      const cx = points.reduce((sum, point) => sum + point.x, 0) / points.length;
      const cy = points.reduce((sum, point) => sum + point.y, 0) / points.length;
      return Bodies.fromVertices(cx, cy, [points], { label });
    }
    return Bodies.rectangle(x + shape.x, y + shape.y, shape.w, shape.h, {
      label,
      chamfer: shape.chamfer ? { radius: shape.chamfer } : undefined,
    });
  });
  parts.push(Bodies.circle(x + spec.head.x, y + spec.head.y, spec.head.radius, { label: 'head' }));

  const chassis = Body.create({
    parts,
    label: 'car',
    collisionFilter,
    friction: VEHICLE.chassisFriction,
    frictionAir: VEHICLE.chassisAirFriction,
    restitution: 0.1,
  });

  // Parts carry their own density; apply it to the whole compound body.
  Body.setDensity(chassis, spec.density);
  for (const part of chassis.parts) part.collisionFilter = collisionFilter;
  return chassis;
}

function createWheel(spec, x, y, collisionFilter, label) {
  // Matter approximates circles with polygons; more sides = smoother rolling.
  return Bodies.circle(x, y, spec.wheels.radius, {
    label: `wheel-${label}`,
    collisionFilter,
    density: spec.wheels.density,
    friction: VEHICLE.wheelFriction,
    frictionStatic: VEHICLE.wheelFrictionStatic,
    frictionAir: VEHICLE.wheelAirFriction,
    restitution: VEHICLE.wheelRestitution,
  }, VEHICLE.wheelSides);
}

/**
 * `mount` is the world position above the wheel, at plate height.
 * Two springs from the chassis to the wheel centre, anchored left and right
 * of the wheel. Together they hold the wheel in place sideways while still
 * letting it travel up and down (a simple, stable suspension).
 */
function createSuspension(spec, chassis, wheel, mount) {
  const anchorY = mount.y + spec.suspension.anchorY;
  return [-1, 1].map((side) =>
    Constraint.create({
      bodyA: chassis,
      // Constraint points are relative to the body's centre of mass, which for
      // a compound body is not the centre of the base plate.
      pointA: {
        x: mount.x + side * VEHICLE.suspensionSpread - chassis.position.x,
        y: anchorY - chassis.position.y,
      },
      bodyB: wheel,
      pointB: { x: 0, y: 0 },
      stiffness: spec.suspension.stiffness,
      damping: 0, // see Car.dampSuspension()
      label: 'spring',
    }),
  );
}
