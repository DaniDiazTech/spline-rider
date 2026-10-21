/**
 * Optional wireframe of the Matter.js world (press V in game).
 * Shows what the physics engine actually simulates under the artwork:
 * every convex part, sensors (dashed) and constraints (springs, joints).
 */
import { Matter } from '../lib/matter.js';

const { Composite } = Matter;

const COLORS = {
  terrain: 'rgba(80, 255, 120, 0.9)',
  sensor: 'rgba(255, 230, 80, 0.9)',
  sleeping: 'rgba(150, 150, 150, 0.8)',
  dynamic: 'rgba(80, 200, 255, 0.95)',
  constraint: 'rgba(255, 90, 200, 0.9)',
};

export class PhysicsDebugRenderer {
  constructor(p) {
    this.p = p;
  }

  draw(world, bounds) {
    const ctx = this.p.drawingContext;
    ctx.save();
    ctx.lineWidth = 1.5;

    for (const body of Composite.allBodies(world)) {
      if (body.bounds.max.x < bounds.left || body.bounds.min.x > bounds.right) continue;
      ctx.strokeStyle = body.isSensor ? COLORS.sensor : body.isStatic ? COLORS.terrain : COLORS.dynamic;
      ctx.setLineDash(body.isSensor ? [5, 4] : []);
      // Compound bodies: draw each convex part, not the outer hull.
      const parts = body.parts.length > 1 ? body.parts.slice(1) : body.parts;
      for (const part of parts) {
        ctx.beginPath();
        part.vertices.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)));
        ctx.closePath();
        ctx.stroke();
      }
      // Orientation tick from the centre of mass.
      ctx.beginPath();
      ctx.moveTo(body.position.x, body.position.y);
      ctx.lineTo(body.position.x + Math.cos(body.angle) * 12, body.position.y + Math.sin(body.angle) * 12);
      ctx.stroke();
    }

    ctx.setLineDash([]);
    ctx.strokeStyle = COLORS.constraint;
    for (const constraint of Composite.allConstraints(world)) {
      const a = endpoint(constraint.bodyA, constraint.pointA);
      const b = endpoint(constraint.bodyB, constraint.pointB);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function endpoint(body, point) {
  return body ? { x: body.position.x + point.x, y: body.position.y + point.y } : point;
}
