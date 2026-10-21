/**
 * Loads every image the game uses and prepares derived images.
 *
 * Retained mode in practice: anything that would be expensive to compute
 * every frame (tinted zombie skins, the burnt-out wreck, sprite trim boxes,
 * tiling patterns) is built ONCE here, right after loading.
 *
 * Art: Kenney (kenney.nl) and pzUH (opengameart.org), all CC0 — see
 * assets/CREDITS.md.
 */
const BASE = 'assets/';

/** name -> file (relative to assets/) */
const MANIFEST = {
  // Cars (pzUH, "Hill Climb Racing - Car Sprites")
  'roadster/body': 'cars/roadster/body.png',
  'roadster/head': 'cars/roadster/head.png',
  'roadster/wheel': 'cars/roadster/wheel.png',
  'monster/body': 'cars/monster/body.png',
  'monster/head': 'cars/monster/head.png',
  'monster/wheel': 'cars/monster/wheel.png',
  'orc/body': 'cars/orc/body.png',
  'orc/head': 'cars/orc/head.png',
  'orc/wheel': 'cars/orc/wheel.png',

  // Zombie (Kenney, "Toon Characters")
  ...Object.fromEntries(['head', 'headShock', 'body', 'arm', 'hand', 'leg'].map((n) => [`zombie/${n}`, `zombie/${n}.png`])),
  ...Object.fromEntries([0, 1, 2, 3, 4, 5, 6, 7].map((i) => [`zombie/walk${i}`, `zombie/walk${i}.png`])),

  // Props and debris (Kenney, "Physics Assets")
  'props/crate': 'props/crate.png',
  'props/plank': 'props/plank.png',
  'props/explosive': 'props/explosive.png',
  'props/block': 'props/block.png',
  ...Object.fromEntries([1, 2, 3].flatMap((i) => [[`debris/wood${i}`, `debris/wood${i}.png`], [`debris/stone${i}`, `debris/stone${i}.png`]])),

  // Scenery (Kenney, "Background Elements Remastered")
  ...Object.fromEntries(
    ['treeDead', 'treePine', 'treeLong', 'house1', 'house2', 'houseAlt1', 'houseAlt2', 'towerAlt', 'tower', 'castleWall',
      'fence', 'fenceIron', 'bush1', 'bush2', 'bush3', 'bush4', 'bushOrange1', 'bushOrange2', 'bushOrange3',
      'cloud1', 'cloud2', 'cloud3', 'cloud5', 'moon', 'moonFull', 'sun'].map((n) => [`scenery/${n}`, `scenery/${n}.png`]),
  ),
  'bg/fall': 'backgrounds/fall.png',
  'bg/desert': 'backgrounds/desert.png',
  'bg/forest': 'backgrounds/forest.png',

  // Effects (Kenney, "Smoke Particles")
  ...Object.fromEntries([0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => [`fx/explosion${i}`, `fx/explosion${i}.png`])),
  ...Object.fromEntries(['00', '04', '08', '12'].flatMap((i) => [[`fx/smoke${i}`, `fx/smoke${i}.png`], [`fx/puff${i}`, `fx/puff${i}.png`]])),
};

/** Skin tints for zombie variety (multiplied over the original art). */
const ZOMBIE_TINTS = [null, 'rgba(120, 170, 255, 0.35)', 'rgba(150, 90, 40, 0.35)'];

export class Assets {
  constructor(p) {
    this.p = p;
    this.images = {};
    this.trims = {};
    this.zombieSkins = [];
  }

  get(name) {
    const image = this.images[name];
    if (!image) throw new Error(`Unknown image: ${name}`);
    return image;
  }

  /**
   * Loads everything. `onProgress(fraction)` is called after each file.
   * @returns {Promise<Assets>}
   */
  async load(onProgress = () => {}) {
    const entries = Object.entries(MANIFEST);
    let done = 0;
    await Promise.all(
      entries.map(
        ([name, file]) =>
          new Promise((resolve, reject) => {
            this.p.loadImage(
              BASE + file,
              (image) => {
                this.images[name] = image;
                onProgress(++done / entries.length);
                resolve();
              },
              () => reject(new Error(`Could not load ${file}`)),
            );
          }),
      ),
    );
    this.prepare();
    return this;
  }

  /** Builds the derived (retained) images. */
  prepare() {
    // Union of the visible pixels of the walk cycle, to anchor the feet.
    const frames = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => this.get(`zombie/walk${i}`));
    this.trims.zombieWalk = unionBox(frames.map((image) => trimBox(image)));

    // Zombie skin variants: every part and walk frame, tinted once.
    const parts = ['head', 'headShock', 'body', 'arm', 'hand', 'leg', ...frames.map((_, i) => `walk${i}`)];
    this.zombieSkins = ZOMBIE_TINTS.map((tint) =>
      Object.fromEntries(parts.map((part) => [part, tint ? tinted(this.p, this.get(`zombie/${part}`), tint) : this.get(`zombie/${part}`)])),
    );

    // A burnt-out wreck made from the roadster body.
    this.images['props/wreck'] = tinted(this.p, this.get('roadster/body'), 'rgba(60, 40, 30, 0.72)');

  }

  /**
   * Scenery tinted towards a colour (the far skyline is drawn in the colour of
   * the distant hills: aerial perspective). Built once per colour.
   */
  silhouette(name, color) {
    const key = `${name}:${color}`;
    this.images[key] ??= tinted(this.p, this.get(name), color);
    return this.images[key];
  }

  /**
   * A seamless soil texture for a theme, generated once: base colour, darker
   * blotches, pebbles and specks. Everything that crosses an edge is also
   * drawn on the opposite edge, so the tile repeats without seams.
   */
  soilPattern(theme, ctx) {
    this.soil ??= {};
    if (!this.soil[theme.dirt]) {
      const size = 256;
      const g = this.p.createGraphics(size, size);
      g.pixelDensity(1);
      g.background(theme.dirt);
      g.noStroke();
      const random = mulberry(theme.dirt.length * 977 + 13);
      const wrapped = (draw) => {
        for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) draw(dx, dy);
      };
      const shade = this.p.color(theme.dirtDark);
      for (let i = 0; i < 26; i++) {
        const x = random() * size, y = random() * size, w = 30 + random() * 60, h = 12 + random() * 24;
        shade.setAlpha(70);
        g.fill(shade);
        wrapped((dx, dy) => g.ellipse(x + dx, y + dy, w, h));
      }
      const pebble = this.p.color(theme.rock);
      for (let i = 0; i < 34; i++) {
        const x = random() * size, y = random() * size, r = 3 + random() * 7;
        wrapped((dx, dy) => {
          g.fill(0, 0, 0, 50);
          g.ellipse(x + dx + 1, y + dy + 2, r * 2.2, r * 1.6);
          g.fill(pebble);
          g.ellipse(x + dx, y + dy, r * 2.2, r * 1.6);
          g.fill(255, 255, 255, 40);
          g.ellipse(x + dx - r * 0.4, y + dy - r * 0.3, r * 0.9, r * 0.6);
        });
      }
      for (let i = 0; i < 260; i++) {
        g.fill(0, 0, 0, 25 + random() * 35);
        g.rect(random() * size, random() * size, 2, 2);
      }
      this.soil[theme.dirt] = ctx.createPattern(g.elt, 'repeat');
      g.remove();
    }
    return this.soil[theme.dirt];
  }
}

/** Tiny seeded random generator (so textures look the same every visit). */
function mulberry(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bounding box of the non-transparent pixels of a p5.Image. */
function trimBox(image) {
  image.loadPixels();
  const { width, height, pixels } = image;
  const density = Math.round(Math.sqrt(pixels.length / 4 / (width * height))) || 1;
  const w = width * density;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let y = 0; y < height * density; y++) {
    for (let x = 0; x < w; x++) {
      if (pixels[(y * w + x) * 4 + 3] > 20) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { x: minX / density, y: minY / density, w: (maxX - minX + 1) / density, h: (maxY - minY + 1) / density };
}

function unionBox(boxes) {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.w));
  const bottom = Math.max(...boxes.map((b) => b.y + b.h));
  return { x, y, w: right - x, h: bottom - y };
}

/**
 * Returns a copy of `image` with `color` painted over its visible pixels
 * ('source-atop' keeps the transparency of the original).
 */
function tinted(p, image, color) {
  const g = p.createGraphics(image.width, image.height);
  g.pixelDensity(1);
  g.image(image, 0, 0);
  const ctx = g.drawingContext;
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, image.width, image.height);
  ctx.globalCompositeOperation = 'source-over';
  return g;
}
