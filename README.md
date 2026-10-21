# Spline Rider: Dead Road 🧟🚗

A physics driving game about escaping a zombie outbreak, made with **p5.js** and **Matter.js** for *Visual Computing (UNAL)*.
It's inspired by *Earn to Die*: three levels, three cars, and one way out.

**▶ Play:** https://danidiaztech.github.io/spline-rider/

## How to play

| Key | Action |
| --- | --- |
| `→` / `D` | Gas · in the air: tilt back |
| `←` / `A` | Brake / reverse · in the air: tilt forward |
| `Space` / `Shift` | Nitro (levels 2 and 3) |
| `P` / `Esc` | Pause |
| `R` | Restart level |
| `M` | Mute |
| `V` | Physics view (shows the Matter.js bodies under the art) |

On phones, use the on-screen **GAS**, **BRAKE** and **NITRO** buttons.

- 🏁 Reach the finish line to unlock the next level and its car.
- 🧟 Hit zombies fast and they go flying. Every hit also costs you some speed.
- ⛽ Fuel drains over time. Grab the red cans (they also refill your nitro).
- 💥 Yellow explosive boxes blow up, and the blast takes nearby zombies with it.
- 🪵 Crates and barricades break. Ramps let you jump wrecks and concrete blocks.
- ☠️ You fail if the driver's head hits the ground, you run out of fuel, or the car gets stuck upside down.

## Levels

| # | Level | Car | Length | What's new |
| --- | --- | --- | --- | --- |
| 1 | The Outskirts | Cherry Bomb (roadster) | 550 m | Autumn, a few zombies, crates, explosive boxes |
| 2 | Dead Highway | Big Blue (monster truck + nitro) | 800 m | Dusk, burnt-out wrecks, bigger hordes |
| 3 | Quarantine Zone | Orc War Wagon (battering ram + nitro) | 1050 m | Night, barricades, concrete, huge hordes |

## Physics

| Mechanic | How it works |
| --- | --- |
| Car | A compound rigid body fitted to the sprite (body, cabin, driver's head, and a ram on the wagon) plus two circle wheels |
| Suspension | Two springs per wheel in a "V", with a custom damper that uses the real mount velocity (`v + ω × r`) |
| Engine | All-wheel drive on wheel spin. The reaction torque gives wheelies. |
| Air control | Spins the whole car as one rigid body around its centre of mass. Control strength ramps up with air time. |
| Nitro | A forward push along the chassis, applied equally to every body of the car |
| Zombies | An upright "weeble" body while alive. Killed zombies are swapped for a 6-part ragdoll joined by pin constraints. |
| Impacts | Hits are detected *before* each step with a swept bounds test. The car loses momentum `m/(M+m)`, as in an inelastic collision. |
| Explosions | A radial velocity kick that falls off with distance and is stronger for lighter bodies. Barrels caught in a blast also explode (chain reactions). |
| Pickups | Matter.js **sensors** (they detect the car without pushing it) |
| Simulation | Fixed 60 Hz timestep, with rendering interpolated between steps |

## Course topics used

| Topic | Where |
| --- | --- |
| Physics engines | Matter.js bodies, compound bodies, constraints, sensors, collision filtering |
| Perlin noise | Road heights and parallax hills (`src/math/perlin.js`) |
| Catmull-Rom splines | Smooth road through the noise points (`src/world/Terrain.js`) |
| De Casteljau / Bézier | Curved kicker ramps, for both physics and drawing (`src/entities/Obstacles.js`) |
| `QUAD_STRIP` | Grass along the road (`src/render/TerrainRenderer.js`) |
| Retained mode | Sky gradient, tinted zombie skins, the wreck sprite, skyline silhouettes and the soil texture are generated once (`src/render/Assets.js`) |

## Art

All art is **CC0** (public domain):

- Cars: [pzUH](https://opengameart.org/content/hill-climb-racing-car-sprites)
- Zombie, props, scenery and smoke: [Kenney](https://kenney.nl)

[`assets/CREDITS.md`](assets/CREDITS.md) lists every pack.

## Run locally

It's a static site with no build step:

```bash
npx http-server .     # or: python3 -m http.server
```

Then open http://localhost:8080.

## Code map

```
src/
  config.js          shared tuning numbers
  data/              cars.js and levels.js (everything that differs per car or level)
  main.js            p5 sketch → Game
  core/              Game (screens, flow), GameSession (rules of one attempt), EventBus
  physics/           Matter.js engine wrapper (fixed timestep)
  world/             Terrain (noise → spline → ground), LevelContent (zombies, obstacles, fuel)
  entities/          Car, Zombie, Obstacles
  systems/           Camera, Input, Audio (WebAudio synth), Storage
  render/            Assets (loading + retained images), Background, Terrain, Car, Zombies,
                     Obstacles, Particles, physics debug view, palette
  ui/                HUD and screens (DOM)
assets/              sprites (CC0, see assets/CREDITS.md)
lib/                 p5.min.js, matter.min.js (vendored)
```

Made by Daniel Díaz · Visual Computing 2026-2 · Universidad Nacional de Colombia
