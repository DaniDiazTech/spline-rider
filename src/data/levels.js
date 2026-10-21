/**
 * The three levels. Each one is a fixed road (fixed seed) with its own car,
 * look and mix of zombies and obstacles. Reach the finish line to unlock the
 * next level.
 *
 *  terrain   hill height at the start / end of the level (px)
 *  fuelCans  first can and spacing between cans (m)
 *  zombies   gap between groups (m) and group size range
 *  features  gap between obstacles (m) and relative weight of each kind
 */
export const LEVELS = [
  {
    id: 1,
    name: 'The Outskirts',
    tagline: 'Get out of town before the horde arrives.',
    car: 'roadster',
    seed: 1101,
    length: 550,
    theme: 'sunset',
    terrain: { amplitudeStart: 50, amplitudeEnd: 230, driftAmplitude: 120 },
    fuelCans: { first: 140, spacing: 170 },
    zombies: { gap: [14, 30], group: [1, 3] },
    features: {
      gap: [28, 50],
      weights: { crates: 3, ramp: 2, barrel: 2, barricade: 1 },
    },
  },
  {
    id: 2,
    name: 'Dead Highway',
    tagline: 'The road is jammed with wrecks… and worse.',
    car: 'monster',
    seed: 2202,
    length: 800,
    theme: 'dusk',
    terrain: { amplitudeStart: 90, amplitudeEnd: 330, driftAmplitude: 200 },
    fuelCans: { first: 150, spacing: 200 },
    zombies: { gap: [10, 22], group: [2, 5] },
    features: {
      gap: [24, 42],
      weights: { crates: 2, ramp: 2, barrel: 2, barricade: 2, wreck: 3 },
    },
  },
  {
    id: 3,
    name: 'Quarantine Zone',
    tagline: 'Smash through the barricades to the evac point.',
    car: 'wagon',
    seed: 3303,
    length: 1050,
    theme: 'night',
    terrain: { amplitudeStart: 120, amplitudeEnd: 420, driftAmplitude: 260 },
    fuelCans: { first: 160, spacing: 180 },
    zombies: { gap: [8, 18], group: [3, 7] },
    features: {
      gap: [20, 36],
      weights: { crates: 1, ramp: 2, barrel: 3, barricade: 3, wreck: 2, blocks: 2 },
    },
  },
];

export const levelById = (id) => LEVELS.find((level) => level.id === id);
