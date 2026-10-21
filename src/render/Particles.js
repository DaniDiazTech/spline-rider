/**
 * A small particle system for dust, smoke, sparks, blood, splinters and
 * explosions.
 *
 * Particles are point masses with their own (cheap) Euler integration; they
 * are purely cosmetic and never touch Matter.js. A particle is drawn either
 * as a shape ('circle' / 'star') or as a sprite:
 *   image   one image name (smoke puff, wood splinter...)
 *   frames  several image names played over the lifetime (explosion)
 * Sprites can spin and grow, and fade out with the canvas globalAlpha.
 */
import { EFFECTS } from './palette.js';

const MAX_PARTICLES = 700;

export class Particles {
  /** @param {p5} p @param {Assets} assets */
  constructor(p, assets) {
    this.p = p;
    this.assets = assets;
    this.list = [];
  }

  /**
   * @param {object} options
   *  x, y, vx, vy   position (world px) and velocity (px/s)
   *  life           seconds
   *  size           diameter (px)
   *  color          css colour (shapes only)
   *  gravity        px/s^2 (negative = floats up)
   *  drag           fraction of velocity lost per second
   *  shape          'circle' | 'star' | 'image'
   *  image, frames  sprite name(s) for shape 'image'
   *  spin           rad/s;  grow: size multiplier reached at the end of life
   *  alpha          starting opacity (0..1)
   */
  emit({
    x, y, vx = 0, vy = 0, life = 0.6, size = 8, color = EFFECTS.dust, gravity = 600, drag = 1.5,
    shape = 'circle', image = null, frames = null, spin = 0, grow = 0.4, alpha = 1,
  }) {
    if (this.list.length >= MAX_PARTICLES) this.list.shift();
    const angle = shape === 'image' ? Math.random() * Math.PI * 2 : 0;
    this.list.push({ x, y, vx, vy, life, maxLife: life, size, color, gravity, drag, shape, image, frames, spin, grow, alpha, angle });
  }

  /** Several particles in random directions (explosions, pickups). */
  burst(x, y, count, { speed = 200, ...options } = {}) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const magnitude = speed * (0.4 + Math.random() * 0.6);
      this.emit({ x, y, vx: Math.cos(angle) * magnitude, vy: Math.sin(angle) * magnitude, ...options });
    }
  }

  update(dt) {
    for (const particle of this.list) {
      particle.life -= dt;
      particle.vy += particle.gravity * dt;
      const friction = Math.max(0, 1 - particle.drag * dt);
      particle.vx *= friction;
      particle.vy *= friction;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.angle += particle.spin * dt;
    }
    this.list = this.list.filter((particle) => particle.life > 0);
  }

  draw() {
    const { p } = this;
    const ctx = p.drawingContext;
    p.noStroke();
    p.imageMode(p.CENTER);
    for (const particle of this.list) {
      const t = particle.life / particle.maxLife; // 1 -> 0 over the lifetime
      if (particle.shape === 'image') {
        const progress = 1 - t;
        const name = particle.frames
          ? particle.frames[Math.min(particle.frames.length - 1, Math.floor(progress * particle.frames.length))]
          : particle.image;
        const image = this.assets.get(name);
        const size = particle.size * (1 + (particle.grow - 1) * progress);
        ctx.globalAlpha = particle.alpha * Math.min(1, t * 2.5);
        p.push();
        p.translate(particle.x, particle.y);
        p.rotate(particle.angle);
        p.image(image, 0, 0, size, (size * image.height) / image.width);
        p.pop();
        continue;
      }
      ctx.globalAlpha = Math.min(1, t * 1.5);
      p.fill(particle.color);
      const size = particle.size * (0.4 + 0.6 * t);
      if (particle.shape === 'star') drawStar(p, particle.x, particle.y, size);
      else p.circle(particle.x, particle.y, size);
    }
    ctx.globalAlpha = 1;
    p.imageMode(p.CORNER);
  }

  clear() {
    this.list = [];
  }
}

function drawStar(p, x, y, size) {
  const outer = size / 2;
  const inner = outer * 0.45;
  p.beginShape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : outer;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    p.vertex(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  p.endShape(p.CLOSE);
}
