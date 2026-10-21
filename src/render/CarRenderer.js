/**
 * Draws the vehicles from their sprites (body, two wheels, driver's head).
 *
 * Every sprite is drawn in the car's local frame: translate to the chassis
 * centre of mass, rotate by its angle, then move to the plate centre where
 * the sprite anchor sits (see data/cars.js).
 */
export class CarRenderer {
  /** @param {p5} p @param {Assets} assets */
  constructor(p, assets) {
    this.p = p;
    this.assets = assets;
  }

  /**
   * @param {Car} car
   * @param {number} alpha     interpolation factor between physics steps
   * @param {boolean} crashed  the driver was knocked out
   * @param {number} time      seconds, for small animations
   */
  draw(car, alpha, crashed, time) {
    const { p, assets } = this;
    const { spec } = car;
    const { sprite } = spec;
    const { chassis, rear, front } = car.interpolated(alpha);
    const offset = car.bodyOffset;

    // Nitro flame behind everything else.
    p.push();
    p.translate(chassis.x, chassis.y);
    p.rotate(chassis.angle);
    p.translate(offset.x, offset.y);
    if (car.isBoosting) this.drawFlame(car, time);

    // Body.
    const body = assets.get(`${sprite.folder}/body`);
    p.imageMode(p.CORNER);
    p.image(body, -sprite.anchor.x * sprite.scale, -sprite.anchor.y * sprite.scale, body.width * sprite.scale, body.height * sprite.scale);

    // Driver's head: bobs a little with the engine, droops after a crash.
    const head = assets.get(`${sprite.folder}/head`);
    const bob = crashed ? 0 : Math.sin(time * 18) * Math.min(1, Math.abs(car.wheelSpin) * 3) * 1.2;
    p.push();
    p.translate(sprite.head.x, sprite.head.y + bob);
    p.rotate(crashed ? 0.5 : -car.throttle * 0.06);
    p.imageMode(p.CENTER);
    p.image(head, 0, 0, head.width * sprite.head.scale, head.height * sprite.head.scale);
    p.pop();
    p.pop();

    this.drawWheel(spec, rear);
    this.drawWheel(spec, front);
  }

  drawWheel(spec, { x, y, angle }) {
    const { p } = this;
    const wheel = this.assets.get(`${spec.sprite.folder}/wheel`);
    const size = wheel.width * spec.sprite.wheelScale;
    p.push();
    p.translate(x, y);
    p.rotate(angle);
    p.imageMode(p.CENTER);
    p.image(wheel, 0, 0, size, size);
    p.pop();
  }

  /** Nitro flame: layered, flickering cones out of the back of the car. */
  drawFlame(car, time) {
    const { p } = this;
    const x = car.extent.rear + 4;
    const y = (car.extent.top + car.extent.bottom) / 2 + 4;
    const flicker = 0.8 + 0.3 * Math.sin(time * 60) + Math.random() * 0.15;
    p.noStroke();
    p.fill(255, 90, 30, 170);
    p.ellipse(x - 34 * flicker, y, 76 * flicker, 26);
    p.fill(255, 170, 40, 210);
    p.ellipse(x - 24 * flicker, y, 50 * flicker, 18);
    p.fill(255, 245, 200, 240);
    p.ellipse(x - 12, y, 24, 10);
  }
}
