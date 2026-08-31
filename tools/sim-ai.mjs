/**
 * Publish-gate sim. Run: node tools/sim-ai.mjs
 */
import { GameEngine } from "../js/engine.js";

const noop = () => {};
const ctx = new Proxy({}, {
  get: (_t, prop) => {
    if (prop === "canvas") return canvas;
    if (prop === "measureText") return () => ({ width: 0 });
    if (prop === "createLinearGradient" || prop === "createRadialGradient") {
      return () => ({ addColorStop: noop });
    }
    return noop;
  },
});
const canvas = {
  width: 844, height: 390,
  parentElement: { clientWidth: 844, clientHeight: 390 },
  getContext: () => ctx,
};
if (!globalThis.addEventListener) globalThis.addEventListener = noop;
globalThis.visualViewport = { width: 844, height: 390, offsetTop: 0, offsetLeft: 0, addEventListener: noop };
globalThis.devicePixelRatio = 1;
globalThis.innerWidth = 844;
globalThis.innerHeight = 390;

const audio = {
  startMusic: noop, bump: noop, ok: noop, finish: noop, go: noop, count: noop, ui: noop, setEngine: noop,
};

function kmh(s) { return Math.round(s / 22); }
function makeEngine() {
  const engine = new GameEngine(canvas, audio);
  engine.setPhone(true);
  engine.startRace("praia", "fenix", { engine: 0, tires: 0, nitro: 0 }, 2);
  return engine;
}

const fail = [];
function check(cond, msg) {
  if (!cond) { fail.push(msg); console.log("FAIL:", msg); }
  else console.log("OK:  ", msg);
}

const dt = 1 / 30;
const engine = makeEngine();
const cruise = kmh(engine.maxSpeed(engine.player));
console.log("cruise cap", cruise, "km/h  track", engine.track.length);

engine.keys = { up: true, down: false, left: false, right: false, nitro: false };

let speedAt05 = 0;
let nitroPeak = 0;
const places = new Set();
let nearPack = 0;
let aiTooFast = 0;

for (let i = 0; i < 900; i++) {
  const t = i * dt;
  if (t >= 4 && t < 4.05) {
    engine.keys.nitro = true;
  }
  if (t >= 4.2) engine.keys.nitro = false;

  engine.update(dt, dt);
  const you = kmh(engine.player.speed);
  const place = engine.hud().place;
  places.add(place);
  if (Math.abs(t - 0.5) < dt) speedAt05 = you;
  if (t >= 4 && t < 5.3) nitroPeak = Math.max(nitroPeak, you);

  const leads = engine.cars.filter((c) => !c.human).map((c) => c.z - engine.player.z);
  const nearby = leads.filter((d) => d > -2000 && d < 8000).length;
  if (t > 6 && t < 25 && nearby >= 3) nearPack++;
  const aiK = engine.cars.filter((c) => !c.human).map((c) => kmh(c.speed));
  const med = aiK.slice().sort((a, b) => a - b)[3];
  if (t > 6 && t < 20 && med > you * 1.12) aiTooFast++;

  if (i === 15 || i === 60 || i === 150 || i === 300 || i === 600) {
    console.log(`t=${t.toFixed(1)} YOU ${you} P${place}/8 nitroBurst=${engine.player.nitroBurst.toFixed(2)} nearby=${nearby} ai=${aiK.join(",")}`);
  }
}

check(speedAt05 >= 40, `accel in 0.5s (got ${speedAt05} km/h)`);
check(nitroPeak >= cruise + 20, `nitro goes above cruise ${cruise} (peak ${nitroPeak})`);
check(places.size >= 2, `HUD place changes (${[...places].join(",")})`);
check(nearPack >= 40, `pack stays with player (${nearPack} frames with 3+ nearby)`);
check(aiTooFast < 10, `AI not 12%+ faster than player (${aiTooFast} frames)`);

const e2 = makeEngine();
e2.countdown = 0;
e2.keys = { up: true, down: false, left: false, right: false, nitro: false };
for (let i = 0; i < 90; i++) e2.update(dt, dt);
const times = [];
for (const c of e2.cars) {
  c.laps = 2;
  c.finished = true;
  c.finishTime = e2.time - c.z / Math.max(280, c.speed);
  times.push(+c.finishTime.toFixed(2));
}
const uniq = new Set(times);
check(uniq.size >= 6, `finish times not glued (${[...uniq].join(", ")})`);

if (fail.length) {
  console.log(fail.length + " gates failed");
  process.exit(1);
}
console.log("All publish gates passed.");
