/**
 * Everything behind the road, drawn in screen space from back to front:
 *
 *   sky gradient   retained: rendered once into a buffer per screen size
 *   sun / moon     Kenney sprite with a soft glow
 *   backdrop       a Kenney landscape, tiled and scrolled very slowly
 *   colour grade   a MULTIPLY overlay gives each level its time of day
 *   clouds         Kenney sprites drifting with the wind
 *   skyline        dark silhouettes (towers, houses, dead trees)
 *   hills          a Perlin-noise band (fBm) in the level's colour
 *   near scenery   full-colour trees, fences and houses
 *
 * Each layer scrolls at its own speed (parallax), which sells the depth.
 */
import { PerlinNoise1D } from '../math/perlin.js';
import { createRandom } from '../math/random.js';

const BACKDROP_PARALLAX = 0.03;
const CLOUD_PARALLAX = 0.05;
const SKYLINE = { parallax: 0.14, spacing: [140, 300], scale: [0.45, 0.7], baseline: 0.72, vertical: 0.04 };
const NEAR = { parallax: 0.42, spacing: [260, 520], scale: [0.85, 1.25], baseline: 0.86, vertical: 0.14 };
const HILLS = { parallax: 0.26, frequency: 0.0035, amplitude: 70, baseline: 0.8, vertical: 0.09 };
const CLOUDS = ['cloud1', 'cloud2', 'cloud3', 'cloud5'];

export class BackgroundRenderer {
  /** @param {p5} p @param {Assets} assets */
  constructor(p, assets) {
    this.p = p;
    this.assets = assets;
    this.theme = null;
  }

  /** Prepares the layers for a level theme. */
  setTheme(theme, seed) {
    this.theme = theme;
    this.hillNoise = new PerlinNoise1D(seed + 101);
    const random = createRandom(seed ^ 0x5c1e);
    this.skylineItems = scatter(random, theme.far, SKYLINE);
    this.nearItems = scatter(random, theme.near, NEAR);
    this.clouds = Array.from({ length: 7 }, (_, i) => ({
      name: CLOUDS[i % CLOUDS.length],
      x: i * 330 + random.range(0, 160),
      y: random.range(0.04, 0.3),
      scale: random.range(0.6, 1.1),
      speed: random.range(5, 14),
    }));
    this.stars = Array.from({ length: 80 }, () => ({ x: random.next(), y: random.range(0, 0.5), size: random.range(1, 2.6), phase: random.range(0, 6) }));
    this.resize();
  }

  resize() {
    const { p } = this;
    if (!this.theme) return;
    this.sky?.remove();
    this.sky = p.createGraphics(Math.max(1, p.width), Math.max(1, p.height));
    const ctx = this.sky.drawingContext;
    const gradient = ctx.createLinearGradient(0, 0, 0, p.height);
    gradient.addColorStop(0, this.theme.skyTop);
    gradient.addColorStop(1, this.theme.skyBottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, p.width, p.height);
  }

  draw(camera, time) {
    const { p, theme } = this;
    p.imageMode(p.CORNER);
    p.image(this.sky, 0, 0);
    this.drawBackdrop(camera);
    if (theme.skyline === 'fence') this.drawStars(time);
    this.drawCelestial();
    this.drawClouds(camera, time);
    this.drawScenery(this.skylineItems, SKYLINE, camera, (name) => this.assets.silhouette(name, this.theme.hills[2]));
    this.drawHills(camera);
    this.drawScenery(this.nearItems, NEAR, camera, (name) => this.assets.get(name));
  }

  /** The Kenney landscape, tiled horizontally and colour graded. */
  drawBackdrop(camera) {
    const { p, theme } = this;
    const image = this.assets.get(theme.backdrop);
    const size = Math.max(p.height * 0.95, 520);
    const top = p.height * 0.78 - size - camera.y * 0.02 * camera.zoom;
    const offset = (((camera.x * BACKDROP_PARALLAX) % size) + size) % size;
    for (let x = -offset; x < p.width; x += size) p.image(image, x, top, size + 1, size);

    // Time-of-day colour grade over sky and backdrop.
    p.blendMode(p.MULTIPLY);
    p.noStroke();
    p.fill(theme.overlay);
    p.rect(0, 0, p.width, p.height);
    p.blendMode(p.BLEND);
    // Fade the backdrop into the sky colour near the top.
    const ctx = p.drawingContext;
    const fade = ctx.createLinearGradient(0, top, 0, top + size * 0.45);
    fade.addColorStop(0, theme.skyTop);
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, Math.max(0, top), p.width, size * 0.45);
  }

  drawStars(time) {
    const { p } = this;
    p.noStroke();
    for (const star of this.stars) {
      p.fill(255, 255, 255, 140 + 100 * Math.sin(time * 2 + star.phase));
      p.circle(star.x * p.width, star.y * p.height, star.size);
    }
  }

  drawCelestial() {
    const { p, theme } = this;
    const x = p.width * 0.8;
    const y = p.height * 0.18;
    const r = Math.min(p.width, p.height) * 0.06;
    p.noStroke();
    p.fill(theme.sunGlow);
    p.circle(x, y, r * 4);
    p.circle(x, y, r * 2.8);
    p.imageMode(p.CENTER);
    p.image(this.assets.get(theme.celestial), x, y, r * 2, r * 2);
    p.imageMode(p.CORNER);
  }

  drawClouds(camera, time) {
    const { p } = this;
    const wrap = p.width + 700;
    const ctx = p.drawingContext;
    ctx.globalAlpha = this.theme.skyline === 'fence' ? 0.35 : 0.85;
    for (const cloud of this.clouds) {
      const image = this.assets.get(`scenery/${cloud.name}`);
      const travel = cloud.x - camera.x * CLOUD_PARALLAX + time * cloud.speed;
      const x = (((travel % wrap) + wrap) % wrap) - 350;
      p.image(image, x, cloud.y * p.height, image.width * cloud.scale, image.height * cloud.scale);
    }
    ctx.globalAlpha = 1;
  }

  /** Repeating strip of scenery sprites standing on a baseline. */
  drawScenery(items, layer, camera, imageFor) {
    const { p } = this;
    const period = items.period;
    const offset = camera.x * layer.parallax;
    const baseY = p.height * layer.baseline - camera.y * layer.vertical * camera.zoom;
    const scale = Math.max(0.6, camera.zoom);
    p.imageMode(p.CORNER);
    const shift = ((offset % period) + period) % period;
    for (const item of items) {
      let x = item.x - shift;
      if (x < -300) x += period;
      if (x > p.width + 300) continue;
      const image = imageFor(`scenery/${item.name}`);
      const w = image.width * item.scale * scale;
      const h = image.height * item.scale * scale;
      p.image(image, x, baseY - h, w, h);
    }
  }

  /** A Perlin-noise hill band (fBm), filled to the bottom of the screen. */
  drawHills(camera) {
    const { p } = this;
    const step = 12;
    const offset = camera.x * HILLS.parallax;
    const baseY = p.height * HILLS.baseline - camera.y * HILLS.vertical * camera.zoom;
    p.noStroke();
    p.fill(this.theme.hills[1]);
    p.beginShape();
    p.vertex(0, p.height);
    for (let sx = 0; sx <= p.width + step; sx += step) {
      const h = this.hillNoise.fbm((offset + sx) * HILLS.frequency, 3, 0.5) * HILLS.amplitude;
      p.vertex(sx, baseY - h - HILLS.amplitude * 0.5);
    }
    p.vertex(p.width + step, p.height);
    p.endShape(p.CLOSE);
  }
}

/** Places sprites along a strip long enough to repeat without visible seams. */
function scatter(random, names, layer) {
  const items = [];
  let x = 0;
  while (x < 2600) {
    items.push({ name: names[random.int(0, names.length - 1)], x, scale: random.range(...layer.scale) });
    x += random.range(...layer.spacing);
  }
  items.period = x;
  return items;
}
