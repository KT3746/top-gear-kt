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
let gapSnap = null;
const xHist = engine.cars.filter((c) => !c.human).map(() => []);

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

  const len = engine.track.length;
  const nearby = engine.cars.filter((c) => {
    if (c.human) return false;
    let d = c.z - engine.player.z;
    if (d > len / 2) d -= len;
    if (d < -len / 2) d += len;
    return d > -4000 && d < 8000;
  }).length;
  if (t > 6 && t < 25 && nearby >= 3) nearPack++;
  const aiK = engine.cars.filter((c) => !c.human).map((c) => kmh(c.speed));
  const med = aiK.slice().sort((a, b) => a - b)[3];
  if (t > 6 && t < 20 && med > you * 1.12) aiTooFast++;

  if (t > 8 && t < 18) {
    engine.cars.filter((c) => !c.human).forEach((c, idx) => xHist[idx].push(c.x));
  }
  if (i === 360) {
    const gaps = engine.cars.filter((c) => !c.human).map((c) => {
      let d = c.z - engine.player.z;
      if (d > len / 2) d -= len;
      if (d < -len / 2) d += len;
      return d;
    }).sort((a, b) => a - b);
    gapSnap = gaps;
  }

  if (i === 15 || i === 60 || i === 150 || i === 300 || i === 600) {
    console.log(`t=${t.toFixed(1)} YOU ${you} P${place}/8 nitroBurst=${engine.player.nitroBurst.toFixed(2)} nearby=${nearby} ai=${aiK.join(",")}`);
  }
}

check(speedAt05 >= 40, `accel in 0.5s (got ${speedAt05} km/h)`);
check(nitroPeak >= cruise + 20, `nitro goes above cruise ${cruise} (peak ${nitroPeak})`);
check(places.size >= 2, `HUD place changes (${[...places].join(",")})`);
check(nearPack >= 40, `pack stays with player (${nearPack} frames with 3+ nearby)`);
check(aiTooFast < 10, `AI not 12%+ faster than player (${aiTooFast} frames)`);

const span = gapSnap[gapSnap.length - 1] - gapSnap[0];
let minGap = Infinity;
for (let i = 1; i < gapSnap.length; i++) minGap = Math.min(minGap, gapSnap[i] - gapSnap[i - 1]);
check(span > 2800, `pack spreads along the road (span ${span.toFixed(0)})`);
check(minGap > 180, `rivals not glued (min gap ${minGap.toFixed(0)})`);
check(gapSnap[gapSnap.length - 1] < 9500, `lead AI still on camera (lead ${gapSnap[gapSnap.length - 1].toFixed(0)})`);

let maxFlip = 0;
let maxStep = 0;
for (const hist of xHist) {
  let flips = 0;
  for (let i = 2; i < hist.length; i++) {
    const d0 = hist[i - 1] - hist[i - 2];
    const d1 = hist[i] - hist[i - 1];
    maxStep = Math.max(maxStep, Math.abs(d1));
    if (d0 * d1 < 0 && Math.abs(d1) > 0.004 && Math.abs(d0) > 0.004) flips++;
  }
  maxFlip = Math.max(maxFlip, flips);
}
check(maxStep > 0.002 && maxStep < 0.09, `lane changes without shake (max Δx ${maxStep.toFixed(4)})`);
check(maxFlip < 40, `steer not vibrating (sign flips ${maxFlip})`);

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

const e3 = makeEngine();
e3.keys = { up: false, down: false, left: false, right: false, nitro: false };
let runaway = 0;
for (let i = 0; i < 360; i++) {
  e3.update(dt, dt);
  const len = e3.track.length;
  const far = e3.cars.filter((c) => {
    if (c.human) return false;
    let d = c.z - e3.player.z;
    if (d > len / 2) d -= len;
    if (d < -len / 2) d += len;
    return Math.abs(d) > 12000;
  }).length;
  if (i * dt > 3 && far) runaway++;
}
check(runaway === 0, `AI stays put when player is stopped (runaway frames ${runaway})`);
check(kmh(e3.player.speed) === 0, `no throttle stays 0 (got ${kmh(e3.player.speed)})`);

const e4 = new GameEngine(canvas, audio);
e4.setPhone(true);
e4.startRace("praia", "fenix", { engine: 1, tires: 0, nitro: 0 }, 2);
e4.keys = { up: true, down: false, left: false, right: false, nitro: false };
const cruiseUp = kmh(e4.maxSpeed(e4.player));
let peakUp = 0;
for (let i = 0; i < 200; i++) {
  const t = i * dt;
  e4.keys.nitro = t >= 4 && t < 4.08;
  e4.update(dt, dt);
  if (t >= 4 && t < 5.4) peakUp = Math.max(peakUp, kmh(e4.player.speed));
}
check(cruiseUp >= 300 && cruiseUp <= 320, `engine+1 cruise around 309 (got ${cruiseUp})`);
check(peakUp >= cruiseUp + 20, `nitro above engine+1 cruise ${cruiseUp} (peak ${peakUp})`);

const e5 = makeEngine();
e5.countdown = 0;
e5.keys = { up: true, down: false, left: false, right: false, nitro: false };
const prey = e5.cars.find((c) => !c.human);
e5.player.x = 0;
e5.playerX = 0;
e5.player.speed = 6200;
prey.x = 0;
prey.line = 0;
prey.lane = 0;
prey.z = e5.player.z + 90;
prey.speed = 4800;
const speedBefore = e5.player.speed;
const playerX0 = e5.playerX;
let overlapAfter = 0;
let minSpeed = speedBefore;
const xRam = [];
for (let i = 0; i < 45; i++) {
  e5.update(dt, dt);
  if (e5.overlapping(e5.player, prey)) overlapAfter++;
  minSpeed = Math.min(minSpeed, e5.player.speed);
  xRam.push(prey.x);
}
let ramFlips = 0;
for (let i = 2; i < xRam.length; i++) {
  const d0 = xRam[i - 1] - xRam[i - 2];
  const d1 = xRam[i] - xRam[i - 1];
  if (d0 * d1 < 0 && Math.abs(d0) > 0.02 && Math.abs(d1) > 0.02) ramFlips++;
}
check(overlapAfter === 0, `ram does not stay inside the other car (overlap frames ${overlapAfter})`);
check(minSpeed < speedBefore - 200, `ram loses a little speed (${kmh(speedBefore)} → ${kmh(minSpeed)})`);
check(Math.abs(e5.playerX - playerX0) < 0.08, `player body stays put on hit (dx ${Math.abs(e5.playerX - playerX0).toFixed(3)})`);
check(ramFlips < 8, `unstick does not gelatin (sign flips ${ramFlips})`);
check(Math.abs(prey.x) > 0.40, `rival steers aside after hit (x ${prey.x.toFixed(2)})`);

if (fail.length) {
  console.log(fail.length + " gates failed");
  process.exit(1);
}
console.log("All publish gates passed.");
