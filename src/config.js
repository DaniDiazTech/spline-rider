/**
 * Global tunable numbers shared by every level.
 * (Per-car numbers live in data/cars.js, per-level numbers in data/levels.js.)
 *
 * Units: Matter.js works in pixels and "steps" (one step = 1/60 s).
 * Velocities are therefore in px/step and angular velocities in rad/step.
 */

/** Conversion used for everything shown to the player. */
export const PIXELS_PER_METER = 30;

export const PHYSICS = {
  /** Fixed simulation step in milliseconds (60 Hz). */
  timestep: 1000 / 60,
  /** Safety cap so a long frame (tab switch, GC pause) cannot freeze the game. */
  maxStepsPerFrame: 5,
  gravityY: 0.65,
  positionIterations: 10,
  velocityIterations: 8,
  constraintIterations: 4,
};

export const TERRAIN = {
  /** Horizontal distance between noise control points (px). */
  controlSpacing: 110,
  /** Catmull-Rom samples generated between two control points. */
  samplesPerSpan: 6,
  /** Vertical position of the starting plateau. */
  baseY: 0,
  /** Behind the start the road bends up into a ramp... */
  backRampStart: -380,
  backRampSlope: 0.6,
  backRampEase: 400,
  /** ...and past this x the engine refuses to reverse any further. */
  reverseLimitX: -650,
  /** Flat runway at the start, so the player can get going. */
  flatStartLength: 600,
  /** Length over which the hills fade in after the runway. */
  easeInLength: 900,
  /** The hills fade out over this length before the finish line. */
  finishEaseLength: 1400,
  /** Flat road after the finish line before the world ends. */
  finishRunout: 1600,
  /** Depth of every ground slab (deep, so wheels can never tunnel through). */
  thickness: 500,

  /** Noise frequency (per px) and fractal settings. */
  noiseFrequency: 0.0016,
  octaves: 3,
  persistence: 0.45,
  /** Slow drift so the track gently climbs and descends over long distances. */
  driftFrequency: 0.00018,

  /** Maximum slope between two control points (rise / run), about 39 degrees.
   *  Steeper climbs make the car tip over backwards; the margin also covers
   *  the small overshoot of the Catmull-Rom spline between control points. */
  maxSlope: 0.82,

  /** How much track to keep generated ahead of / behind the car (px). */
  generateAhead: 2600,
  keepBehind: 1600,
};

/** Driving rules shared by every car (see data/cars.js for each car's stats). */
export const VEHICLE = {
  /** Polygon sides used for the wheel collision shape. */
  wheelSides: 48,
  /** Steps a part may lose contact and still count as touching the ground. */
  contactGraceSteps: 4,
  /** Free-rolling resistance applied every step when not on the throttle. */
  rollingResistance: 0.996,
  wheelFriction: 1,
  wheelFrictionStatic: 6,
  wheelRestitution: 0.05,
  chassisFriction: 0.4,
  chassisAirFriction: 0.006,
  wheelAirFriction: 0.004,
  /** Suspension: two springs per wheel arranged as a "V" for lateral stability. */
  suspensionSpread: 22,
  /** Body reaction while driving on the ground (gives wheelies). */
  groundTiltTorque: 0.0003,
  /** Mid-air rotation control; full strength after this many steps in the air. */
  airControlRampSteps: 24,
  airTiltAcceleration: 0.008,
  /** Fraction of the air spin removed per step while no pedal is pressed. */
  airSpinDamping: 0.12,
  maxAirSpin: 0.18,
};

export const FUEL = {
  /** Fuel is 0..1. Burn per second while idling (throttle burn is per car). */
  idleBurnPerSecond: 1 / 90,
  /** Seconds the car may sit still without fuel before the run ends. */
  emptyGraceSeconds: 1.6,
  /** Below this speed (px/step) an empty car counts as stopped. */
  stopSpeed: 0.35,
  lowFuelWarning: 0.25,
  canSize: 30,
};

export const ZOMBIE = {
  /** Sizes match the Kenney "Toon Characters" zombie drawn at ZOMBIE.spriteScale. */
  spriteScale: 0.42,
  torsoWidth: 30,
  torsoHeight: 32,
  headRadius: 21,
  /** Same mass as before the sprites (bigger bodies, lower density). */
  density: 0.0012,
  friction: 0.6,
  /** Walking speed range (px/step) and how far ahead they notice the car (px). */
  walkSpeedMin: 0.35,
  walkSpeedMax: 1.0,
  noticeDistance: 1100,
  /** Strength of the "stay on your feet" correction while alive. */
  uprightStrength: 0.22,
  /** Dead bodies are removed after this many seconds. */
  corpseLifetime: 8,
};

export const OBSTACLES = {
  crateSize: 42,
  crateDensity: 0.0009,
  /** Explosive boxes (they used to be barrels, the name stuck). */
  barrelWidth: 40,
  barrelHeight: 40,
  barrelDensity: 0.0012,
  /** Impact speed (px/step) that makes a barrel explode. */
  barrelTriggerSpeed: 3,
  explosionRadius: 260,
  /** Velocity change (px/step) given at the centre of an explosion. */
  explosionStrength: 14,
  plankWidth: 22,
  plankHeight: 70,
  plankDensity: 0.0012,
  wreckWidth: 150,
  wreckHeight: 44,
  wreckDensity: 0.0014,
  blockWidth: 92,
  blockHeight: 46,
  blockDensity: 0.0025,
  rampLength: 280,
  rampHeight: 84,
  rampMinHeight: 40,
  /** Steepest average incline (road + ramp) allowed, in radians (~24 deg). */
  rampMaxAngle: 0.42,
  /** Samples along the curved (Bezier) ramp deck. */
  rampSegments: 10,
  /** Length of the back slope behind the lip, per px of ramp height. */
  rampBackRatio: 1.7,
};

export const RULES = {
  /** Seconds between the crash and the result screen (lets it play out). */
  crashDelaySeconds: 1.4,
  /** Seconds between crossing the finish line and the result screen. */
  finishDelaySeconds: 1.5,
  /** A flip counts once the car has rotated this much in the air. */
  flipThreshold: Math.PI * 2 - 0.45,
  /** Air time worth announcing (seconds). */
  airTimeMinSeconds: 1.1,
  /** Upside down (or on its side) and still for this long = run over. */
  stuckSeconds: 2.2,
  stuckSpeed: 0.8,
  stuckAngle: Math.PI * 0.4,
};

export const CAMERA = {
  /** World pixels visible vertically at rest (zoom adapts to the screen). */
  viewHeight: 780,
  /** Narrow screens zoom out so at least this much road is visible (px). */
  minViewWidth: 1000,
  /** Extra zoom-out at full speed (fraction). */
  speedZoomOut: 0.22,
  followSharpness: 6,
  zoomSharpness: 1.6,
  /** Look-ahead in front of the car per px/step of speed. */
  lookAhead: 16,
  maxLookAhead: 300,
  /** Car is shown slightly below the screen centre. */
  verticalBias: -60,
};

/** Collision categories (bit flags) for Matter.js collision filtering. */
export const COLLISION = {
  terrain: 0x0001,
  car: 0x0002,
  pickup: 0x0004,
  zombie: 0x0008,
  debris: 0x0010,
};

export const STORAGE_KEY = 'spline-rider:v2';
