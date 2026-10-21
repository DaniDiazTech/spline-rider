/**
 * The three vehicles, one per level. Every car shares the driving model in
 * entities/Car.js; only these numbers and the artwork change.
 *
 * Coordinates are in world pixels relative to the "plate centre" of the car,
 * a point chosen midway between the two wheels (x right = front, y down).
 * They were measured on the sprites: world = (spritePixel - anchor) * scale.
 *
 *  sprite   which images to use, the sprite pixel that sits on the plate
 *           centre (anchor), the drawing scale and where to draw the head
 *  parts    physics shapes of the body (rects and convex polygons)
 *  head     the driver's head: touching the ground with it is a crash
 *  engine   wheel spin rates in rad/step (see config.js for units)
 */
export const CARS = {
  roadster: {
    id: 'roadster',
    name: 'Cherry Bomb',
    description: 'A tiny red roadster. Light, quick and fragile.',
    sprite: { folder: 'roadster', scale: 0.35, anchor: { x: 282, y: 146 }, wheelScale: 0.35, head: { scale: 0.16, x: -14, y: -50 } },
    parts: [
      // Ground clearance matters more than a perfect fit to the bodywork.
      { type: 'rect', x: 6, y: -3, w: 196, h: 24, chamfer: 10 },
      { type: 'rect', x: 4, y: -22, w: 150, h: 16, chamfer: 8 },
    ],
    head: { radius: 13, x: -14, y: -44 },
    density: 0.0011,
    wheels: { radius: 21, offsetX: 48, offsetY: 14, density: 0.0038 },
    suspension: { stiffness: 0.32, damping: 0.18, anchorY: -8 },
    engine: { acceleration: 0.013, maxSpin: 0.5, maxReverseSpin: 0.22, brake: 0.04 },
    fuelBurnPerSecond: 1 / 45,
    boost: null,
    /** Relative impact speed (px/step) needed to knock a zombie down for good. */
    zombieKillSpeed: 3.6,
  },

  monster: {
    id: 'monster',
    name: 'Big Blue',
    description: 'A monster truck with huge tyres and a nitro bottle.',
    sprite: { folder: 'monster', scale: 0.27, anchor: { x: 300, y: 180 }, wheelScale: 0.27, head: { scale: 0.15, x: -14, y: -38 } },
    parts: [
      { type: 'rect', x: 5, y: 12, w: 170, h: 20, chamfer: 8 },
      { type: 'rect', x: 6, y: -10, w: 156, h: 26, chamfer: 8 },
    ],
    head: { radius: 14, x: -14, y: -33 },
    density: 0.0011,
    wheels: { radius: 31, offsetX: 59, offsetY: 50, density: 0.0024 },
    suspension: { stiffness: 0.3, damping: 0.2, anchorY: -4 },
    engine: { acceleration: 0.013, maxSpin: 0.36, maxReverseSpin: 0.16, brake: 0.035 },
    fuelBurnPerSecond: 1 / 50,
    /** Nitro: forward acceleration (px/step²) and seconds of boost per tank. */
    boost: { acceleration: 0.11, capacitySeconds: 4 },
    zombieKillSpeed: 3.0,
  },

  wagon: {
    id: 'wagon',
    name: 'Orc War Wagon',
    description: 'Spiked wheels, a battering ram and twin rockets. Zombies beware.',
    sprite: { folder: 'orc', scale: 0.37, anchor: { x: 296, y: 137 }, wheelScale: 0.37, head: { scale: 0.17, x: 2, y: -46 } },
    parts: [
      { type: 'rect', x: 3, y: 1, w: 158, h: 34, chamfer: 6 },
      { type: 'rect', x: -83, y: -5, w: 44, h: 48, chamfer: 6 },
      // The battering ram doubles as a zombie plow. Its physics shape is
      // shorter and blunter than the drawn spike, so it can't spear a hillside.
      { type: 'poly', label: 'plow', points: [{ x: 80, y: -20 }, { x: 110, y: -7 }, { x: 108, y: 2 }, { x: 80, y: 14 }] },
    ],
    head: { radius: 14, x: 2, y: -38 },
    density: 0.0012,
    wheels: { radius: 27, offsetX: 50, offsetY: 22, density: 0.0034 },
    suspension: { stiffness: 0.3, damping: 0.2, anchorY: -10 },
    engine: { acceleration: 0.016, maxSpin: 0.42, maxReverseSpin: 0.18, brake: 0.045 },
    fuelBurnPerSecond: 1 / 62,
    boost: { acceleration: 0.13, capacitySeconds: 6 },
    zombieKillSpeed: 1.6,
  },
};
