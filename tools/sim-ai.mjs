/**
 * Headless race sim: AI pace, racing lines, HUD place.
 * Run: node tools/sim-ai.mjs
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
  width: 844,
  height: 390,
  parentElement: { clientWidth: 844, clientHeight: 390 },
  getContext: () => ctx,
};

if (!globalThis.addEventListener) globalThis.addEventListener = noop;
globalThis.visualViewport = {
  width: 844, height: 390, offsetTop: 0, offsetLeft: 0, addEventListener: noop,
};
globalThis.devicePixelRatio = 1;
globalThis.innerWidth = 844;
globalThis.innerHeight = 390;

const audio = {
  startMusic: noop, bump: noop, ok: noop, finish: noop, go: noop, count: noop, ui: noop,
  setEngine: noop,
};

function kmh(s) { return Math.round(s / 22); }

function makeEngine() {
  const engine = new GameEngine(canvas, audio);
  engine.setPhone(true);
  engine.startRace("praia", "fenix", { engine: 0, tires: 0, nitro: 0 }, 2);
  return engine;
}

function snapshot(engine) {
  const p = engine.player;
  const hud = engine.hud();
  const ai = engine.cars.filter((c) => !c.human).map((c) => {
    const dz = c.z - p.z;
    const fwd = ((c.z - p.z) % engine.track.length + engine.track.length) % engine.track.length;
    const vis = fwd > 80 && fwd < 2800;
    return {
      n: c.name.split(" ")[0],
      kmh: kmh(c.speed),
      z: Math.round(c.z),
      x: +c.x.toFixed(2),
      laps: c.laps,
      place: c.place,
      lead: Math.round(dz),
      vis,
      ahead: engine.aheadOf(c, p),
    };
  });
  return {
    t: engine.time,
    you: kmh(p.speed),
    youZ: Math.round(p.z),
    youLaps: p.laps,
    place: hud.place,
    field: hud.field,
    ai,
    visibleAhead: ai.filter((a) => a.vis).length,
  };
}

function printSnap(s, label) {
  console.log(`\n=== ${label} t=${s.t.toFixed(1)}s  YOU ${s.you} km/h  HUD ${s.place}/${s.field}  laps=${s.youLaps}  visAhead=${s.visibleAhead}`);
  for (const a of s.ai) {
    console.log(`  ${a.n.padEnd(8)} ${String(a.kmh).padStart(3)} km/h  x=${String(a.x).padStart(5)}  z=${a.z}  lead=${a.lead}  laps=${a.laps}  P${a.place}  ahead=${a.ahead}`);
  }
}

const fail = [];
function check(cond, msg) {
  if (!cond) {
    fail.push(msg);
    console.log("FAIL:", msg);
  } else {
    console.log("OK:  ", msg);
  }
}

const dt = 1 / 30;

// --- A: player full throttle from lights ---
{
  console.log("\n######## A: player full throttle ########");
  const engine = makeEngine();
  console.log("track.length", engine.track.length, "PLAYER_Z", engine.player.z.toFixed(0));
  engine.countdown = 0;
  engine.keys = { up: true, down: false, left: false, right: false, nitro: false };

  let straightFast = 0;
  let xSpread = 0;
  let swaps = 0;
  let lastOrder = "";
  const places = new Set();
  let hudLie = false;

  for (let i = 0; i < 900; i++) {
    if (engine.player.nitroBurst > 0.15) engine.keys.nitro = false;
    else if (engine.player.nitroCharges > 0 && engine.player.speed > 50) engine.keys.nitro = true;
    engine.update(dt, dt);
    const s = snapshot(engine);
    places.add(s.place);
    const here = engine.findSeg(engine.player.z);
    const onStraight = Math.abs(here.curve) < 0.8;
    const fastAI = s.ai.filter((a) => a.kmh >= s.you - 8 && a.kmh >= 270);
    if (onStraight && s.t > 2 && fastAI.length >= 3) straightFast++;
    const pack = s.ai.filter((a) => a.lead > -400 && a.lead < 1600);
    if (pack.length >= 3) {
      const xs = pack.map((a) => a.x);
      const spread = Math.max(...xs) - Math.min(...xs);
      if (spread >= 0.45) xSpread++;
    }
    const order = s.ai.slice().sort((a, b) => b.lead - a.lead).slice(0, 4).map((a) => a.n).join(",");
    if (lastOrder && order !== lastOrder) swaps++;
    lastOrder = order;
    if (s.visibleAhead >= 3 && s.place === 1) hudLie = true;
    if (i === 60 || i === 150 || i === 300 || i === 600 || i === 899) {
      printSnap(s, onStraight ? "straight" : "corner");
    }
  }

  check(straightFast >= 8, `3+ AI matching player on a straight (${straightFast} frames)`);
  check(xSpread >= 8, `pack not 3-wide clump, x-spread >= 0.45 (${xSpread} frames)`);
  check(swaps >= 4, `position swapping among AI (${swaps} order changes)`);
  check(places.size >= 2, `HUD place changes (${[...places].join(",")})`);
  check(!hudLie, `HUD never 1/8 while 3 rivals are visibly ahead`);
}

// --- B: player parked 27s like the live pad miss ---
{
  console.log("\n######## B: player at 0 km/h for 27s ########");
  const engine = makeEngine();
  engine.countdown = 0;
  engine.keys = { up: false, down: false, left: false, right: false, nitro: false };
  let sawNotFirst = false;
  let aiFast = 0;
  let hudWrong = false;
  for (let i = 0; i < 810; i++) {
    engine.update(dt, dt);
    const s = snapshot(engine);
    if (s.t > 1 && s.ai.filter((a) => a.ahead).length >= 3 && s.place === 1) hudWrong = true;
    if (s.t > 2 && s.place > 1) sawNotFirst = true;
    if (s.t > 3 && s.ai.filter((a) => a.kmh >= 270).length >= 3) aiFast++;
    if (i === 90 || i === 390 || i === 809) printSnap(s, "parked");
  }
  const end = snapshot(engine);
  check(end.you === 0, `player still 0 km/h (got ${end.you})`);
  check(sawNotFirst, `HUD is not stuck at 1/8 while AI pull away (last ${end.place}/${end.field})`);
  check(end.place >= 4, `parked player is mid/back of pack, not P1 (P${end.place})`);
  check(!hudWrong, `HUD never 1/8 while 3+ AI have more race progress`);
  check(aiFast >= 20, `AI still race-fast while player sits (${aiFast} frames with 3 at 270+)`);
}

// --- C: three rivals ahead must not report 1/8 ---
{
  console.log("\n######## C: rank with 3 AI ahead ########");
  const engine = makeEngine();
  engine.countdown = 0;
  engine.player.z = 5000;
  engine.player.laps = 0;
  const ai = engine.cars.filter((c) => !c.human);
  ai.forEach((c, i) => {
    c.laps = 0;
    c.z = i < 3 ? 6500 + i * 400 : 1200 + i * 50;
  });
  engine.rank();
  const h = engine.hud();
  printSnap(snapshot(engine), "forced pack");
  check(h.place === 4, `3 AI ahead => HUD 4/8 (got ${h.place}/${h.field})`);
  ai[0].z = 2000;
  engine.rank();
  check(engine.hud().place === 3, `after one drops behind => HUD 3/8 (got ${engine.hud().place})`);
}

if (fail.length) {
  console.log("\n" + fail.length + " checks failed");
  process.exit(1);
}
console.log("\nAll checks passed.");
