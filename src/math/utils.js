/** Tiny numeric helpers shared by several modules. */

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const lerp = (a, b, t) => a + (b - a) * t;

/** Hermite smoothstep between edge0 and edge1. */
export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Wraps an angle to (-PI, PI]. */
export function wrapAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/**
 * Frame-rate independent exponential smoothing.
 * `sharpness` is "how much of the gap closes per second" in log space.
 */
export function damp(current, target, sharpness, dtSeconds) {
  return lerp(current, target, 1 - Math.exp(-sharpness * dtSeconds));
}
