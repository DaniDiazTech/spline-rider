/**
 * Smooth follow camera.
 *
 * It looks a bit ahead of the car in the direction of travel and zooms out
 * as the car speeds up, so the player can see what is coming.
 */
import { CAMERA } from '../config.js';
import { clamp, damp } from '../math/utils.js';

export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
    this.lookAhead = 0;
    this.speedFactor = 0;
    this.shakeTime = 0;
    this.shakeStrength = 0;
    this.offset = { x: 0, y: 0 };
  }

  /** Jump straight to the target (used when a run starts). */
  snapTo(x, y) {
    this.x = x;
    this.y = y + CAMERA.verticalBias;
    this.lookAhead = 0;
    this.speedFactor = 0;
  }

  /**
   * @param {{x:number,y:number}} target   car position (interpolated)
   * @param {{x:number,y:number}} velocity car velocity in px/step
   * @param {{width:number,height:number}} screen
   * @param {number} dt seconds since last frame
   */
  update(target, velocity, screen, dt) {
    const desiredAhead = clamp(velocity.x * CAMERA.lookAhead, -CAMERA.maxLookAhead, CAMERA.maxLookAhead);
    this.lookAhead = damp(this.lookAhead, desiredAhead, 1.5, dt);

    this.x = damp(this.x, target.x + this.lookAhead, CAMERA.followSharpness, dt);
    this.y = damp(this.y, target.y + CAMERA.verticalBias, CAMERA.followSharpness, dt);

    const speed = Math.hypot(velocity.x, velocity.y);
    this.speedFactor = damp(this.speedFactor, clamp(speed / 18, 0, 1), CAMERA.zoomSharpness, dt);
    // Fit the view height, but always show enough road ahead (phones in portrait).
    const baseZoom = Math.min(screen.height / CAMERA.viewHeight, screen.width / CAMERA.minViewWidth);
    this.zoom = baseZoom * (1 - CAMERA.speedZoomOut * this.speedFactor);

    this.updateShake(dt);
  }

  /** Short screen shake, e.g. on a crash or a hard landing. */
  shake(strength, seconds) {
    this.shakeStrength = Math.max(this.shakeStrength, strength);
    this.shakeTime = Math.max(this.shakeTime, seconds);
  }

  updateShake(dt) {
    if (this.shakeTime <= 0) {
      this.offset.x = this.offset.y = 0;
      return;
    }
    this.shakeTime -= dt;
    const strength = this.shakeStrength * clamp(this.shakeTime * 3, 0, 1);
    this.offset.x = (Math.random() * 2 - 1) * strength;
    this.offset.y = (Math.random() * 2 - 1) * strength;
    if (this.shakeTime <= 0) this.shakeStrength = 0;
  }

  /** Applies the world -> screen transform to a p5 instance. */
  apply(p) {
    p.translate(p.width / 2 + this.offset.x, p.height / 2 + this.offset.y);
    p.scale(this.zoom);
    p.translate(-this.x, -this.y);
  }

  /** World-space rectangle currently on screen (for culling). */
  visibleBounds(width, height) {
    const halfW = width / 2 / this.zoom;
    const halfH = height / 2 / this.zoom;
    return {
      left: this.x - halfW,
      right: this.x + halfW,
      top: this.y - halfH,
      bottom: this.y + halfH,
    };
  }
}
