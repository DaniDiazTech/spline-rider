/**
 * Draws obstacles with Kenney "Physics Assets" sprites (crates, planks,
 * explosive boxes, stone blocks), the burnt-out wreck, the wooden kicker
 * ramps and the fuel cans. Each sprite is stretched over its physics body
 * and rotated with it.
 */
import { FUEL } from '../config.js';

const SPRITES = {
  crate: 'props/crate',
  plank: 'props/plank',
  barrel: 'props/explosive',
  block: 'props/block',
};

/** The wreck sprite is a little larger than its physics box (bumpers). */
const WRECK_DRAW = { scale: 0.27, offsetY: -6 };

export class ObstacleRenderer {
  /** @param {p5} p @param {Assets} assets */
  constructor(p, assets) {
    this.p = p;
    this.assets = assets;
  }

  draw(content, bounds, time) {
    const { p } = this;
    for (const obstacle of content.obstacles) {
      if (obstacle.x < bounds.left - 320 || obstacle.x > bounds.right + 320) continue;
      if (obstacle.type === 'ramp') this.drawRamp(obstacle);
      else for (const body of obstacle.bodies) this.drawBody(body, time);
    }
    for (const can of content.fuelCans) {
      if (can.x > bounds.left - 40 && can.x < bounds.right + 40) this.drawFuelCan(can, time);
    }
    p.imageMode(p.CORNER);
  }

  drawBody(body, time) {
    const { p, assets } = this;
    // Size of the body in its own frame (rotation removed).
    body.plugin.size ??= localSize(body); // shapes never change: measure once
    const size = body.plugin.size;

    p.push();
    p.translate(body.position.x, body.position.y);
    p.rotate(body.angle);
    p.imageMode(p.CENTER);
    if (body.label === 'wreck') {
      const image = assets.get('props/wreck');
      p.scale(-1, 1); // facing the player, abandoned on the road
      p.image(image, 0, WRECK_DRAW.offsetY, image.width * WRECK_DRAW.scale, image.height * WRECK_DRAW.scale);
    } else {
      p.image(assets.get(SPRITES[body.label]), 0, 0, size.w + 2, size.h + 2);
      if (body.label === 'barrel') {
        // A blinking warning light on explosive boxes.
        const on = Math.sin(time * 8 + body.id) > 0;
        p.noStroke();
        p.fill(on ? 'rgba(255, 60, 40, 0.9)' : 'rgba(120, 20, 10, 0.6)');
        p.circle(0, -size.h / 2 - 3, 7);
      }
    }
    p.pop();
  }

  /** Wooden kicker: planked deck along the Bezier curve, beams underneath. */
  drawRamp(ramp) {
    const { p } = this;
    const { deck, base } = ramp;

    // Support frame.
    p.stroke('#5b3a1f');
    p.strokeWeight(6);
    for (let i = 2; i < deck.length; i += 3) p.line(deck[i].x, deck[i].y + 8, base[i].x, base[i].y);
    p.strokeWeight(4);
    for (let i = 2; i < deck.length - 3; i += 3) p.line(deck[i].x, deck[i].y + 10, base[i + 3].x, base[i + 3].y - 6);

    // Deck: thick plank band following the curve.
    p.stroke('#4a2e17');
    p.strokeWeight(3);
    p.fill('#b4773f');
    p.beginShape();
    for (const point of deck) p.vertex(point.x, point.y);
    for (let i = deck.length - 1; i >= 0; i--) p.vertex(deck[i].x, deck[i].y + 14);
    p.endShape(p.CLOSE);
    p.stroke('#d9a066');
    p.strokeWeight(2);
    for (let i = 1; i < deck.length - 1; i++) p.line(deck[i].x, deck[i].y + 2, deck[i].x, deck[i].y + 12);
    // Metal lip at the top end.
    const lip = deck[ramp.lipIndex];
    p.noStroke();
    p.fill('#8d939e');
    p.rect(lip.x - 6, lip.y - 2, 8, 18, 2);
  }

  drawFuelCan(can, time) {
    const { p } = this;
    const s = FUEL.canSize;
    const bob = Math.sin(time * 2.5 + can.phase) * 4;
    p.push();
    p.translate(can.x, can.y + bob);
    p.rotate(Math.sin(time * 1.7 + can.phase) * 0.08);
    // Soft glow.
    p.noStroke();
    p.fill(255, 240, 150, 50 + 30 * Math.sin(time * 5));
    p.circle(0, 0, s * 2.4);
    p.fill(255, 240, 150, 60);
    p.circle(0, 0, s * 1.7);
    // Jerrycan body.
    p.stroke('#5c1010');
    p.strokeWeight(2.5);
    p.fill('#d92b2b');
    p.rect(-s / 2, -s / 2, s, s * 1.05, 4);
    p.noStroke();
    p.fill('#ff6b5a');
    p.rect(-s / 2 + 3, -s / 2 + 3, s * 0.22, s * 0.95, 2);
    // Embossed X and the cap.
    p.stroke('#a51d1d');
    p.strokeWeight(3);
    p.line(-s * 0.25, -s * 0.2, s * 0.25, s * 0.35);
    p.line(s * 0.25, -s * 0.2, -s * 0.25, s * 0.35);
    p.noStroke();
    p.fill('#3d4048');
    p.rect(s * 0.12, -s * 0.78, s * 0.24, s * 0.3, 2);
    p.fill('#5c1010');
    p.rect(-s * 0.4, -s * 0.72, s * 0.4, s * 0.16, 3);
    p.pop();
  }
}

/** Width and height of a (convex, box-like) body in its local frame. */
function localSize(body) {
  const cos = Math.cos(-body.angle);
  const sin = Math.sin(-body.angle);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const v of body.vertices) {
    const dx = v.x - body.position.x;
    const dy = v.y - body.position.y;
    const x = dx * cos - dy * sin;
    const y = dx * sin + dy * cos;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { w: maxX - minX, h: maxY - minY };
}
