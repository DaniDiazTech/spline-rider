/**
 * Entry point: creates the p5 sketch (instance mode), loads the artwork
 * (showing a progress bar), then hands every frame to the Game controller.
 */
import { Game } from './core/Game.js';
import { Assets } from './render/Assets.js';

new window.p5((p) => {
  let game;

  p.setup = async () => {
    const canvas = p.createCanvas(window.innerWidth, window.innerHeight);
    canvas.parent('stage');
    p.pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
    // No spaces: p5 would wrap the whole list in quotes as a single family name.
    p.textFont('Fredoka,sans-serif');

    const bar = document.getElementById('loading-fill');
    const assets = await new Assets(p).load((progress) => (bar.style.transform = `scaleX(${progress})`));
    document.getElementById('loading-screen').hidden = true;
    game = new Game(p, assets);

    // Read-only hook for automated tests and the browser console.
    window.splineRider = { snapshot: () => game.debugSnapshot() };
    // Extra controls for testing, only with ?debug=1 in the URL.
    if (new URLSearchParams(window.location.search).has('debug')) {
      window.splineRider.debug = {
        setFuel: (value) => (game.session.fuel = value),
        unlockAll: () => {
          game.storage.data.unlocked = 3;
          game.storage.save();
        },
        /** Moves the car to x (px), resting on the road, with a forward speed. */
        teleport: (x, speed = 0) => {
          const { session } = game;
          session.terrain.update(x);
          const { car } = session;
          const dx = x - car.position.x;
          const dy = session.terrain.heightAt(x) - car.spec.wheels.offsetY - car.spec.wheels.radius - 8 - car.position.y;
          for (const body of car.bodies) {
            window.Matter.Body.setPosition(body, { x: body.position.x + dx, y: body.position.y + dy });
            window.Matter.Body.setVelocity(body, { x: speed, y: 0 });
          }
          session.terrain.update(x);
        },
        get session() {
          return game.session;
        },
        get game() {
          return game;
        },
      };
    }
    document.body.classList.add('is-ready');
  };

  p.draw = () => {
    if (game) game.frame(p.deltaTime);
    else p.background('#1d1a24');
  };

  p.windowResized = () => {
    p.resizeCanvas(window.innerWidth, window.innerHeight);
    game?.resize();
  };
});
