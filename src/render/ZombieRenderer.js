/**
 * Draws zombies with the Kenney "Toon Characters" zombie.
 *  - Alive: an 8-frame walk cycle, anchored on the feet of the physics body
 *    and rotated with it (so shoves and wobbles show).
 *  - Dead: every ragdoll part is drawn with its own sprite (head, body,
 *    arms with hands, legs) at its simulated transform, fading out at the end.
 *
 * Opacity uses the canvas globalAlpha instead of p5's tint(), which would
 * re-tint the image on every draw call.
 */
import { ZOMBIE } from '../config.js';
import { ZOMBIE_LIMBS as LIMB } from '../entities/Zombie.js';

const WALK_FRAMES = 8;
const FADE_SECONDS = 1.5;

export class ZombieRenderer {
  /** @param {p5} p @param {Assets} assets */
  constructor(p, assets) {
    this.p = p;
    this.assets = assets;
  }

  draw(zombies, bounds, time) {
    const { p } = this;
    p.imageMode(p.CENTER);
    for (const zombie of zombies) {
      const { x } = zombie.position;
      if (x < bounds.left - 80 || x > bounds.right + 80) continue;
      if (zombie.alive) this.drawAlive(zombie, time);
      else this.drawRagdoll(zombie);
    }
    p.imageMode(p.CORNER);
  }

  skin(zombie) {
    const skins = this.assets.zombieSkins;
    return skins[zombie.skinTone % skins.length];
  }

  drawAlive(zombie, time) {
    const { p } = this;
    const pose = zombie.pose;
    const skin = this.skin(zombie);
    const trim = this.assets.trims.zombieWalk;
    const scale = ZOMBIE.spriteScale;

    // Walk cycle speed follows the zombie's own pace.
    const cycle = time * (6 + zombie.walkSpeed * 8) + zombie.phase * 3;
    const frame = Math.floor(cycle) % WALK_FRAMES;
    const image = skin[`walk${frame}`];
    const facingLeft = pose.vx < 0.05;

    p.push();
    p.translate(pose.x, pose.y);
    p.rotate(pose.angle);
    if (facingLeft) p.scale(-1, 1);
    // Anchor: bottom-centre of the visible walk-cycle pixels on the feet.
    const cx = (trim.x + trim.w / 2 - image.width / 2) * scale;
    const bottom = (trim.y + trim.h - image.height / 2) * scale;
    p.image(image, -cx, -bottom, image.width * scale, image.height * scale);
    p.pop();
  }

  drawRagdoll(zombie) {
    const { p } = this;
    const pose = zombie.pose;
    const skin = this.skin(zombie);
    const scale = ZOMBIE.spriteScale;
    const fade = Math.max(0, Math.min(1, (ZOMBIE.corpseLifetime - zombie.deadTime) / FADE_SECONDS));
    const ctx = p.drawingContext;
    ctx.globalAlpha = fade;

    const part = ({ x, y, angle }, image, flip = false, extra = null) => {
      p.push();
      p.translate(x, y);
      p.rotate(angle);
      if (flip) p.scale(-1, 1);
      p.image(image, 0, 0, image.width * scale, image.height * scale);
      if (extra) extra();
      p.pop();
    };

    // A hand at the end of each arm.
    const hand = () => p.image(skin.hand, 0, LIMB.armLength / 2, skin.hand.width * scale, skin.hand.height * scale);

    part(pose.legL, skin.leg, true);
    part(pose.armL, skin.arm, true, hand);
    part(pose.torso, skin.body);
    part(pose.legR, skin.leg);
    part(pose.armR, skin.arm, false, hand);
    part(pose.head, skin.headShock);

    ctx.globalAlpha = 1;
  }
}
