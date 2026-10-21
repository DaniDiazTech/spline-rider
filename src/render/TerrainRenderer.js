/**
 * Draws the road in world space from the terrain's spline samples.
 *
 * The soil is the area under the spline filled with a tiled dirt texture and
 * darker translucent bands deeper down. A thin QUAD_STRIP along the surface
 * draws the grass, and bushes, distance signs and the finish gate sit on top.
 */
import { EFFECTS } from './palette.js';
import { PIXELS_PER_METER } from '../config.js';

const GRASS_DEPTH = 16;
/** Distance signs every this many meters. */
const SIGN_EVERY = 100;

/** Darker bands deeper in the ground (drawn over the dirt texture). */
const DEPTH_BANDS = [
  { depth: 90, alpha: 0.18 },
  { depth: 210, alpha: 0.3 },
];
const TEXTURE_SCALE = 1;

export class TerrainRenderer {
  /** @param {p5} p @param {Assets} assets */
  constructor(p, assets) {
    this.p = p;
    this.assets = assets;
    this.theme = null;
  }

  setTheme(theme) {
    this.theme = theme;
  }

  /**
   * @param {Terrain} terrain
   * @param {{left,right,top,bottom}} bounds  visible world rectangle
   * @param {object} level                    for the finish gate label
   */
  draw(terrain, bounds, level) {
    const samples = terrain.visibleSamples(bounds.left - 40, bounds.right + 40);
    if (samples.length < 2) return;

    const bottom = bounds.bottom + 40;
    this.drawSoil(samples, bottom);
    this.drawGrass(samples);
    this.drawRoadside(samples);

    this.drawSigns(terrain, bounds, level);
    this.drawFinishGate(terrain, bounds, level);
  }

  /**
   * Soil: the area under the road filled with a tiled, procedurally generated
   * soil texture
   * (a canvas pattern anchored in world space, so it scrolls with the road),
   * then darkened with depth by translucent bands.
   *
   * These are plain canvas paths: p5's TRIANGLE_STRIP re-applies a flat fill
   * colour per vertex (which would replace the pattern), and translucent
   * triangles would overlap at their shared edges.
   */
  drawSoil(samples, bottom) {
    const { p } = this;
    const ctx = p.drawingContext;
    const pattern = this.assets.soilPattern(this.theme, ctx);
    pattern.setTransform(new DOMMatrix().scale(TEXTURE_SCALE));

    ctx.beginPath();
    ctx.moveTo(samples[0].x, bottom);
    for (const point of samples) ctx.lineTo(point.x, point.y);
    ctx.lineTo(samples[samples.length - 1].x, bottom);
    ctx.closePath();
    ctx.fillStyle = pattern;
    ctx.fill();

    for (const band of DEPTH_BANDS) this.strip(samples, band.depth, bottom, [0, 0, 0, 255 * band.alpha]);
    if (this.theme.soilShade > 0) this.strip(samples, 0, bottom, [10, 10, 30, 255 * this.theme.soilShade]);
  }

  /**
   * A translucent band from (surface + depth) down to `bottom`, drawn as one
   * path: overlapping triangle edges would show as darker seams.
   */
  strip(samples, depth, bottom, [r, g, b, a]) {
    const ctx = this.p.drawingContext;
    ctx.beginPath();
    ctx.moveTo(samples[0].x, bottom);
    for (const point of samples) ctx.lineTo(point.x, Math.min(point.y + depth, bottom));
    ctx.lineTo(samples[samples.length - 1].x, bottom);
    ctx.closePath();
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a / 255})`;
    ctx.fill();
  }

  /** Bushes along the road; positions come from a hash of x (stable). */
  drawRoadside(samples) {
    const { p } = this;
    const names = this.theme.roadside;
    p.imageMode(p.CORNER);
    for (const point of samples) {
      const h = hash(Math.round(point.x));
      if (h > 0.16) continue;
      const image = this.assets.get(`scenery/${names[Math.floor(h * 100) % names.length]}`);
      const scale = 0.45 + h * 2;
      const w = image.width * scale;
      const height = image.height * scale;
      p.image(image, point.x - w / 2, point.y - height + 10, w, height);
    }
  }

  drawGrass(samples) {
    const { p } = this;
    p.stroke(this.theme.grassDark);
    p.strokeWeight(1);
    p.fill(this.theme.grassDark);
    p.beginShape(p.QUAD_STRIP);
    for (const point of samples) {
      p.vertex(point.x, point.y - 1);
      p.vertex(point.x, point.y + GRASS_DEPTH);
    }
    p.endShape();

    p.stroke(this.theme.grass);
    p.fill(this.theme.grass);
    p.beginShape(p.QUAD_STRIP);
    for (const point of samples) {
      p.vertex(point.x, point.y - 2);
      p.vertex(point.x, point.y + GRASS_DEPTH * 0.55);
    }
    p.endShape();
  }

  /** Distance signs along the road (not past the finish line). */
  drawSigns(terrain, bounds, level) {
    const every = SIGN_EVERY * PIXELS_PER_METER;
    const first = Math.max(1, Math.ceil((bounds.left - 100) / every));
    for (let i = first; i * every < Math.min(bounds.right + 100, terrain.finishX - every / 2); i++) {
      const left = level.length - i * SIGN_EVERY;
      this.drawSign(terrain, i * every, `${left} m`);
    }
  }

  drawSign(terrain, x, label) {
    const { p } = this;
    const ground = terrain.heightAt(x);
    p.stroke(EFFECTS.signPost);
    p.strokeWeight(6);
    p.line(x, ground + 4, x, ground - 70);
    p.noStroke();
    p.fill(EFFECTS.signPost);
    p.rect(x - 40, ground - 104, 80, 38, 6);
    p.fill(EFFECTS.signBoard);
    p.rect(x - 37, ground - 101, 74, 32, 5);
    p.fill(EFFECTS.signText);
    p.textAlign(p.CENTER, p.CENTER);
    p.textStyle(p.BOLD);
    p.textSize(16);
    p.text(label, x, ground - 85);
  }

  /** Checkered arch over the finish line. */
  drawFinishGate(terrain, bounds, level) {
    const x = terrain.finishX;
    if (x < bounds.left - 300 || x > bounds.right + 300) return;
    const { p } = this;
    const ground = terrain.heightAt(x);
    const height = 230;

    p.stroke('#3d4048');
    p.strokeWeight(10);
    p.line(x - 120, ground + 4, x - 120, ground - height);
    p.line(x + 120, ground + 4, x + 120, ground - height);

    p.noStroke();
    p.fill('#2f6f3e');
    p.rect(x - 140, ground - height - 50, 280, 56, 10);
    for (let i = 0; i < 28; i++) {
      p.fill(i % 2 ? '#ffffff' : '#1e1e1e');
      p.rect(x - 140 + i * 10, ground - height + 6, 10, 8);
    }
    p.fill('#ffffff');
    p.textAlign(p.CENTER, p.CENTER);
    p.textStyle(p.BOLD);
    p.textSize(26);
    p.text(level.id === 3 ? 'EVAC POINT' : 'SAFE ZONE', x, ground - height - 22);

    // Checkered stripe painted on the road.
    for (let i = 0; i < 6; i++) {
      p.fill(i % 2 ? '#ffffff' : '#1e1e1e');
      p.rect(x - 6, ground - 2 + i * 6, 12, 6);
    }
  }
}

/** Deterministic pseudo-random value in [0, 1) from an integer. */
function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
