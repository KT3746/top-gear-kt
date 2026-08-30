import { CARS, DRIVERS, TRACKS, applyUpgrades } from "./data.js";

const SEG = 200;
const ROAD = 2100;
const LANES = 3;
const DRAW = 260;
const FOV = 100;
const CAM_H = 1000;
const CAM_DEPTH = 1 / Math.tan(((FOV / 2) * Math.PI) / 180);
const PLAYER_Z = CAM_H * CAM_DEPTH;
const CENTRIFUGAL = 0.09;
const SPRITE_SCALE = 0.38;

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function easeIn(a, b, p) { return a + (b - a) * p * p; }
function easeInOut(a, b, p) { return a + (b - a) * ((-Math.cos(p * Math.PI) / 2) + 0.5); }
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  const r = Math.round(lerp(A.r, B.r, t));
  const g = Math.round(lerp(A.g, B.g, t));
  const bl = Math.round(lerp(A.b, B.b, t));
  return `rgb(${r},${g},${bl})`;
}
function rumbleW(w) { return w / 7; }
function laneW(w) { return w / 28; }

function lastY(segs) {
  return segs.length ? segs[segs.length - 1].p2.y : 0;
}

function addSegment(segs, curve, y) {
  const n = segs.length;
  segs.push({
    index: n,
    p1: { x: 0, y: lastY(segs), z: n * SEG },
    p2: { x: 0, y, z: (n + 1) * SEG },
    curve,
    sprites: [],
    pickup: null,
    light: Math.floor(n / 3) % 2 === 0,
  });
}

function addRoad(segs, enter, hold, leave, curve, hill) {
  const startY = lastY(segs);
  const endY = startY + (hill || 0) * SEG;
  const total = enter + hold + leave;
  for (let n = 0; n < enter; n++) addSegment(segs, easeIn(0, curve, n / enter), easeInOut(startY, endY, n / total));
  for (let n = 0; n < hold; n++) addSegment(segs, curve, easeInOut(startY, endY, (enter + n) / total));
  for (let n = 0; n < leave; n++) addSegment(segs, easeInOut(curve, 0, n / leave), easeInOut(startY, endY, (enter + hold + n) / total));
}

function buildTrack(def) {
  const segs = [];
  for (const step of def.recipe()) {
    const kind = step[0];
    if (kind === "straight") addRoad(segs, 0, step[1], 0, 0, 0);
    else if (kind === "curve") addRoad(segs, step[1], step[1], step[1], step[2], step[3] || 0);
    else if (kind === "hill") addRoad(segs, step[1], step[1], step[1], 0, step[2]);
    else if (kind === "scurve") {
      addRoad(segs, step[1], step[1], step[1], step[2], 0);
      addRoad(segs, step[1], step[1], step[1], -step[2], 0);
    }
  }
  addRoad(segs, 10, 10, 10, 0, 0);

  const map = [];
  let x = 0, y = 0, ang = 0;
  for (const s of segs) {
    ang += s.curve * 0.018;
    x += Math.cos(ang);
    y += Math.sin(ang);
    map.push({ x, y });
  }

  const kinds = def.objects;
  for (let i = 4; i < segs.length; i += 3) {
    const side = (i % 6 === 0) ? -1 : 1;
    const kind = kinds[(i + (side > 0 ? 1 : 0)) % kinds.length];
    const offset = side * (1.28 + (i % 5) * 0.06);
    const big = kind === "building" ? 2.8 : kind === "palm" || kind === "pine" ? 2.2 : 1.35;
    segs[i].sprites.push({ kind, offset, scale: big });
    segs[i].sprites.push({
      kind: kinds[(i + 2) % kinds.length],
      offset: -offset * (1.05 + (i % 4) * 0.04),
      scale: big * 0.85,
    });
  }
  for (let i = 80; i < segs.length - 40; i += 140) {
    segs[i].pickup = { x: (i % 280 === 0) ? -0.35 : 0.35, taken: false };
  }
  return { segs, map, length: segs.length * SEG, def };
}

function project(p, camX, camY, camZ, w, h) {
  const cx = p.x - camX;
  const cy = p.y - camY;
  const cz = p.z - camZ;
  const scale = cz <= 1 ? 0 : CAM_DEPTH / cz;
  return {
    x: Math.round(w / 2 + scale * cx * w / 2),
    y: Math.round(h / 2 - scale * cy * h / 2),
    w: Math.round(scale * ROAD * w / 2),
    scale,
    cz,
  };
}

function poly(ctx, x1, y1, x2, y2, x3, y3, x4, y4, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.lineTo(x4, y4);
  ctx.closePath();
  ctx.fill();
}

function drawObject(ctx, kind, x, y, s, night) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  if (kind === "palm") {
    ctx.fillStyle = "#6b4423";
    ctx.fillRect(-6, -90, 12, 90);
    ctx.fillStyle = "#2f8a3a";
    for (let i = 0; i < 6; i++) {
      const a = (-90 + i * 36) * Math.PI / 180;
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * 38, -100 + Math.sin(a) * 10, 34, 10, a, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === "pine") {
    ctx.fillStyle = "#4a3422";
    ctx.fillRect(-5, -40, 10, 40);
    ctx.fillStyle = "#1f4d32";
    ctx.beginPath(); ctx.moveTo(0, -140); ctx.lineTo(38, -40); ctx.lineTo(-38, -40); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, -170); ctx.lineTo(28, -90); ctx.lineTo(-28, -90); ctx.fill();
  } else if (kind === "cactus") {
    ctx.fillStyle = "#2f7a3c";
    ctx.fillRect(-8, -80, 16, 80);
    ctx.fillRect(-28, -58, 20, 10);
    ctx.fillRect(-28, -58, 10, 28);
    ctx.fillRect(8, -48, 22, 10);
    ctx.fillRect(20, -48, 10, 22);
  } else if (kind === "rock") {
    ctx.fillStyle = "#6a6258";
    ctx.beginPath(); ctx.moveTo(-24, 0); ctx.lineTo(-10, -28); ctx.lineTo(8, -36); ctx.lineTo(26, -12); ctx.lineTo(18, 0); ctx.fill();
  } else if (kind === "bush") {
    ctx.fillStyle = night ? "#163322" : "#2d6b38";
    ctx.beginPath(); ctx.arc(-10, -10, 16, 0, Math.PI * 2); ctx.arc(10, -12, 18, 0, Math.PI * 2); ctx.arc(0, -20, 14, 0, Math.PI * 2); ctx.fill();
  } else if (kind === "building") {
    ctx.fillStyle = night ? "#14182a" : "#8a8f9c";
    ctx.fillRect(-30, -160, 60, 160);
    ctx.fillStyle = night ? "#ffd36a" : "#c9d3e0";
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 3; c++) {
        if ((r + c) % 2 === 0) ctx.fillRect(-22 + c * 16, -148 + r * 20, 10, 12);
      }
    }
  } else if (kind === "lamp") {
    ctx.fillStyle = "#2a2a30";
    ctx.fillRect(-3, -90, 6, 90);
    ctx.fillStyle = night ? "#fff2a8" : "#d8d8d8";
    ctx.beginPath(); ctx.arc(10, -92, 8, 0, Math.PI * 2); ctx.fill();
    if (night) {
      ctx.fillStyle = "rgba(255,230,140,0.18)";
      ctx.beginPath(); ctx.moveTo(10, -92); ctx.lineTo(-18, 0); ctx.lineTo(38, 0); ctx.fill();
    }
  } else if (kind === "sign") {
    ctx.fillStyle = "#555";
    ctx.fillRect(-3, -50, 6, 50);
    ctx.fillStyle = "#f0b429";
    ctx.fillRect(-22, -78, 44, 28);
    ctx.fillStyle = "#2a1b02";
    ctx.fillRect(-14, -68, 28, 6);
  } else if (kind === "fuel") {
    ctx.fillStyle = "#d3542f";
    ctx.fillRect(-10, -28, 20, 28);
    ctx.fillStyle = "#fff";
    ctx.fillRect(-6, -22, 12, 8);
    ctx.fillStyle = "#222";
    ctx.fillRect(6, -32, 8, 6);
  }
  ctx.restore();
}

function drawCar(ctx, x, y, scale, car, steer, nitro) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.rotate(steer * 0.28);
  const body = car.color;
  const accent = car.accent;
  const type = car.silhouette;
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath(); ctx.ellipse(0, 22, 58, 12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#0d0d10";
  ctx.fillRect(-46 + steer * 4, 6, 22, 14);
  ctx.fillRect(24 + steer * 4, 6, 22, 14);
  ctx.fillStyle = body;
  ctx.beginPath();
  if (type === "long") {
    ctx.moveTo(-50, 12); ctx.lineTo(-42, -10); ctx.lineTo(-10, -24); ctx.lineTo(40, -18); ctx.lineTo(56, 4); ctx.lineTo(46, 16);
  } else if (type === "wide") {
    ctx.moveTo(-56, 12); ctx.lineTo(-40, -12); ctx.lineTo(-6, -20); ctx.lineTo(34, -16); ctx.lineTo(54, 6); ctx.lineTo(44, 16);
  } else if (type === "box") {
    ctx.moveTo(-48, 14); ctx.lineTo(-44, -8); ctx.lineTo(-16, -22); ctx.lineTo(28, -22); ctx.lineTo(50, -4); ctx.lineTo(44, 16);
  } else {
    ctx.moveTo(-48, 12); ctx.lineTo(-36, -10); ctx.lineTo(-4, -22); ctx.lineTo(32, -18); ctx.lineTo(52, 4); ctx.lineTo(42, 16);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(-28, -2, 56, 8);
  ctx.fillStyle = "rgba(200, 235, 255, 0.8)";
  ctx.beginPath();
  ctx.moveTo(-10, -18); ctx.lineTo(18, -16); ctx.lineTo(12, -4); ctx.lineTo(-18, -5); ctx.closePath();
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.fillRect(-20, 4, 40, 5);
  ctx.fillStyle = nitro ? "#7cf6ff" : "#ffd36a";
  ctx.fillRect(-34, 10, 10, 5);
  ctx.fillRect(24, 10, 10, 5);
  if (nitro) {
    ctx.fillStyle = "rgba(80, 230, 255, 0.7)";
    ctx.beginPath(); ctx.moveTo(-16, 16); ctx.lineTo(0, 48); ctx.lineTo(16, 16); ctx.fill();
    ctx.fillStyle = "rgba(255, 200, 80, 0.55)";
    ctx.beginPath(); ctx.moveTo(-8, 16); ctx.lineTo(0, 36); ctx.lineTo(8, 16); ctx.fill();
  }
  ctx.restore();
}

function wrapDist(a, b, len) {
  let d = a - b;
  const half = len / 2;
  if (d > half) d -= len;
  if (d < -half) d += len;
  return d;
}

export class GameEngine {
  constructor(canvas, audio) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.audio = audio;
    this.keys = {};
    this.mode = "idle";
    this.track = null;
    this.cars = [];
    this.player = null;
    this.camX = 0;
    this.position = 0;
    this.playerX = 0;
    this.steer = 0;
    this.slip = 0;
    this.fovKick = 0;
    this.time = 0;
    this.lapTime = 0;
    this.bestLap = null;
    this.laps = 1;
    this.totalLaps = 2;
    this.countdown = 0;
    this.finished = false;
    this.results = null;
    this.onFinish = null;
    this.shake = 0;
    this.toast = "";
    this.toastT = 0;
    this.upgrades = { engine: 0, tires: 0, nitro: 0 };
    this.playerCarId = "fenix";
    this.resize();
    addEventListener("resize", () => this.resize());
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(640, innerWidth) * dpr;
    this.canvas.height = Math.max(360, innerHeight) * dpr;
  }

  findSeg(z) {
    const segs = this.track.segs;
    const i = Math.floor(z / SEG) % segs.length;
    return segs[(i + segs.length) % segs.length];
  }

  percent(z) {
    return (z % SEG) / SEG;
  }

  loadTrack(id) {
    const def = TRACKS.find((t) => t.id === id) || TRACKS[0];
    this.track = buildTrack(def);
  }

  setupField(playerCarId, upgrades, opponentCarIds) {
    this.upgrades = { ...upgrades };
    this.playerCarId = playerCarId;
    const playerBase = CARS.find((c) => c.id === playerCarId) || CARS[0];
    const playerSpec = applyUpgrades(playerBase, upgrades);
    const ids = opponentCarIds || CARS.filter((c) => c.id !== playerCarId).slice(0, 3).map((c) => c.id);
    this.cars = [];
    this.player = {
      human: true,
      name: "Você",
      spec: playerSpec,
      car: playerBase,
      x: 0,
      z: 0,
      speed: 0,
      nitro: 1,
      fuel: 1,
      laps: 0,
      finished: false,
      finishTime: 0,
      place: 1,
      steer: 0,
    };
    this.cars.push(this.player);
    DRIVERS.filter((d) => !d.human).forEach((d, i) => {
      const base = CARS.find((c) => c.id === ids[i % ids.length]) || CARS[(i + 1) % CARS.length];
      this.cars.push({
        human: false,
        name: d.name,
        skill: d.skill,
        nerve: d.nerve,
        spec: applyUpgrades(base, { engine: 0, tires: 0, nitro: 0 }),
        car: base,
        x: [-0.42, 0.38, -0.12][i] || 0.2,
        z: (i + 1) * SEG * 2.8,
        speed: 0,
        nitro: 1,
        fuel: 1,
        laps: 0,
        finished: false,
        finishTime: 0,
        place: i + 2,
        steer: 0,
        lane: [-0.4, 0.35, 0.05][i],
      });
    });
  }

  startRace(trackId, playerCarId, upgrades, laps) {
    this.loadTrack(trackId);
    this.setupField(playerCarId, upgrades);
    this.totalLaps = laps || this.track.def.laps;
    this.position = 0;
    this.playerX = 0;
    this.steer = 0;
    this.slip = 0;
    this.time = 0;
    this.lapTime = 0;
    this.bestLap = null;
    this.laps = 1;
    this.countdown = 3.15;
    this.finished = false;
    this.results = null;
    this.mode = "race";
    this.player.z = 0;
    this.player.speed = 0;
    this.player.nitro = 1;
    this.player.fuel = 1;
    this.player.laps = 0;
    this.cars.forEach((c) => { c._lastZ = c.z; c.laps = 0; c.finished = false; });
    this.audio.startMusic("race");
  }

  startAttract(trackId) {
    this.loadTrack(trackId || "praia");
    this.setupField("fenix", { engine: 0, tires: 0, nitro: 0 });
    this.mode = "attract";
    this.countdown = 0;
    this.player.speed = 210;
    this.cars.forEach((c, i) => { c.speed = 180 + i * 12; });
    this.audio.startMusic("menu");
  }

  restart() {
    this.startRace(this.track.def.id, this.playerCarId, this.upgrades, this.totalLaps);
  }

  setKeys(keys) { this.keys = keys; }

  maxSpeed(car) {
    const fuelCut = car.fuel <= 0 ? 0.42 : 1;
    return (car.spec.top * 22) * fuelCut;
  }

  update(dt) {
    if (!this.track || this.mode === "idle") return;
    if (this.mode === "attract") {
      this.autoDrive(dt);
      return;
    }
    if (this.mode !== "race" || this.finished) {
      if (this.finished) this.simulateWorld(dt, false, false);
      return;
    }
    if (this.countdown > 0) {
      this.countdown -= dt;
      this.simulateWorld(dt, true, true);
      return;
    }
    this.drivePlayer(dt);
    this.driveAI(dt);
    this.simulateWorld(dt, false);
    this.time += dt;
    this.lapTime += dt;
    this.collisions();
    this.pickups();
    this.rank();
    this.checkLaps();
  }

  drivePlayer(dt) {
    const p = this.player;
    const up = this.keys.up;
    const down = this.keys.down;
    const left = this.keys.left;
    const right = this.keys.right;
    const boost = this.keys.nitro && p.nitro > 0 && p.fuel > 0;
    const max = this.maxSpeed(p) * (boost ? 1.32 + (p.spec.nitro - 1) * 0.3 : 1);
    const accel = 3400 * p.spec.accel * (boost ? 1.85 : 1);
    if (up) p.speed += accel * dt;
    else p.speed -= 520 * dt;
    if (down) p.speed -= 3800 * dt;
    p.speed = clamp(p.speed, 0, max);
    const off = Math.abs(this.playerX) > 1;
    if (off) p.speed -= (720 / (p.spec.offroad || 1)) * dt;
    p.speed = Math.max(0, p.speed);

    const speedPct = p.speed / Math.max(1, this.maxSpeed(p));
    const grip = p.spec.grip;
    const want = (right ? 1 : 0) - (left ? 1 : 0);
    this.steer = lerp(this.steer, want, 7 * dt);
    this.playerX += this.steer * (0.92 + grip * 0.18) * (0.4 + 0.6 * speedPct) * dt;
    const look = this.findSeg(this.position + PLAYER_Z + 12 * SEG);
    this.playerX += (-look.curve * 0.034 * speedPct) * dt;
    if (!want) this.playerX = lerp(this.playerX, clamp(-look.curve * 0.03, -0.25, 0.25), 1.25 * dt);
    if (off) this.playerX -= Math.sign(this.playerX) * 0.85 * dt;
    this.slip = lerp(this.slip, this.steer * speedPct * 0.7, 6 * dt);
    p.steer = this.slip;

    if (boost) {
      p.nitro = Math.max(0, p.nitro - dt * 0.55 / p.spec.nitroTank);
      p.fuel = Math.max(0, p.fuel - dt * 0.05);
      this.fovKick = lerp(this.fovKick, 1, 6 * dt);
      this.toast = "NITRO";
      this.toastT = 0.7;
    } else {
      p.nitro = Math.min(1, p.nitro + dt * 0.08);
      this.fovKick = lerp(this.fovKick, 0, 4 * dt);
    }
    p.fuel = Math.max(0, p.fuel - dt * (0.0035 + speedPct * 0.0028) / p.spec.fuel);
    if (off) {
      this.shake = Math.max(this.shake, 5);
      if (this.toast !== "NITRO") {
        this.toast = "FORA DA PISTA";
        this.toastT = 0.3;
      }
    }
  }

  autoDrive(dt) {
    const len = this.track.length;
    const seg = this.findSeg(this.position + PLAYER_Z);
    this.playerX = lerp(this.playerX, -seg.curve * 0.04, 0.8 * dt);
    this.position += 4200 * dt;
    while (this.position >= len) this.position -= len;
    this.player.z = this.position;
    this.steer = lerp(this.steer, -seg.curve * 0.08, dt * 2);
    this.player.steer = this.steer;
    this.cars.forEach((c) => {
      if (c.human) return;
      c.z += c.speed * 18 * dt;
      while (c.z >= len) c.z -= len;
    });
  }

  driveAI(dt) {
    const len = this.track.length;
    const playerLead = this.progress(this.player);
    for (const c of this.cars) {
      if (c.human || c.finished) continue;
      const look = this.findSeg(c.z + PLAYER_Z + 18 * SEG);
      const here = this.findSeg(c.z + PLAYER_Z);
      const danger = Math.abs(look.curve) + Math.abs(here.curve);
      let target = this.maxSpeed(c) * (0.58 + c.skill * 0.2) * (1 - danger * 0.05);
      const gap = playerLead - this.progress(c);
      if (gap > len * 0.08) target *= 1.08;
      if (gap < -len * 0.1) target *= 0.94;
      const boost = danger < 1.2 && c.nitro > 0.3 && c.nerve > 0.6;
      if (boost) {
        target *= 1.1;
        c.nitro -= dt * 0.3;
      } else c.nitro = Math.min(1, c.nitro + dt * 0.05);
      if (c.speed < target) c.speed += 2400 * c.spec.accel * dt;
      else c.speed -= 1600 * dt;
      c.speed = clamp(c.speed, 0, this.maxSpeed(c) * 1.12);

      let lane = c.lane;
      for (const o of this.cars) {
        if (o === c) continue;
        const dz = wrapDist(o.z, c.z, len);
        if (dz > 0 && dz < SEG * 8 && Math.abs(o.x - c.x) < 0.28) {
          lane = c.x > o.x ? Math.min(0.7, c.x + 0.35) : Math.max(-0.7, c.x - 0.35);
        }
      }
      const hold = clamp(-here.curve * 0.05, -0.55, 0.55);
      const dest = clamp(lerp(lane, hold, 0.25), -0.85, 0.85);
      c.x = lerp(c.x, dest, (1.6 + c.skill) * dt);
      c.steer = (dest - c.x) * 4;
      if (Math.abs(c.x) > 1) c.speed *= 0.96;
      c.fuel = Math.max(0.2, c.fuel - dt * 0.01);
    }
  }

  simulateWorld(dt, freezePlayer, freezeAI) {
    const p = this.player;
    const len = this.track.length;
    if (!freezePlayer) {
      const seg = this.findSeg(this.position + PLAYER_Z);
      const speedPct = p.speed / Math.max(1, this.maxSpeed(p));
      this.playerX -= dt * speedPct * seg.curve * CENTRIFUGAL / p.spec.grip;
      this.position += p.speed * dt;
      p.z = this.position;
    }
    while (this.position >= len) this.position -= len;
    while (this.position < 0) this.position += len;
    this.playerX = clamp(this.playerX, -2.2, 2.2);
    p.x = this.playerX;
    if (!freezeAI) {
      for (const c of this.cars) {
        if (c.human) continue;
        c.z += c.speed * dt;
        while (c.z >= len) c.z -= len;
        while (c.z < 0) c.z += len;
      }
    }
    this.shake = Math.max(0, this.shake - 18 * dt);
    if (this.toastT > 0) this.toastT -= dt;
  }

  collisions() {
    const len = this.track.length;
    for (let i = 0; i < this.cars.length; i++) {
      for (let j = i + 1; j < this.cars.length; j++) {
        const a = this.cars[i];
        const b = this.cars[j];
        const dz = Math.abs(wrapDist(a.z, b.z, len));
        if (dz > SEG * 0.85) continue;
        if (Math.abs(a.x - b.x) > 0.34) continue;
        const dir = Math.sign(a.x - b.x) || 1;
        a.x += dir * 0.08;
        b.x -= dir * 0.08;
        const sa = a.speed, sb = b.speed;
        a.speed = lerp(sa, sb, 0.35);
        b.speed = lerp(sb, sa, 0.35);
        if (a.human || b.human) {
          this.shake = 7;
          this.audio.bump();
        }
      }
    }
  }

  pickups() {
    const seg = this.findSeg(this.player.z + PLAYER_Z);
    if (seg.pickup && !seg.pickup.taken && Math.abs(this.playerX - seg.pickup.x) < 0.28) {
      seg.pickup.taken = true;
      this.player.fuel = 1;
      this.toast = "COMBUSTÍVEL";
      this.toastT = 1.1;
      this.audio.ok();
    }
  }

  progress(car) {
    return car.laps * this.track.length + car.z;
  }

  rank() {
    const order = [...this.cars].sort((a, b) => this.progress(b) - this.progress(a));
    order.forEach((c, i) => { c.place = i + 1; });
  }

  checkLaps() {
    const len = this.track.length;
    for (const c of this.cars) {
      const prev = c._lastZ ?? c.z;
      const z = c.z;
      const crossed = prev > len * 0.72 && z < len * 0.28;
      if (crossed && this.countdown <= 0 && !c.finished) {
        c.laps += 1;
        if (c.human) {
          if (this.bestLap == null || this.lapTime < this.bestLap) this.bestLap = this.lapTime;
          this.laps = Math.min(this.totalLaps, c.laps + 1);
          this.lapTime = 0;
          this.toast = c.laps >= this.totalLaps ? "CHEGADA" : "VOLTA";
          this.toastT = 1.2;
        }
        if (c.laps >= this.totalLaps) {
          c.finished = true;
          c.finishTime = this.time;
          if (!c.human) c.speed *= 0.45;
        }
      }
      c._lastZ = z;
    }
    if (this.player.finished && !this.finished) {
      const allDone = this.cars.every((c) => c.finished);
      const timeout = this.time > this.player.finishTime + 6;
      if (allDone || timeout) this.endRace();
    }
  }

  endRace() {
    this.finished = true;
    this.rank();
    this.cars.forEach((c) => {
      if (!c.finished) {
        c.finished = true;
        c.finishTime = this.time + Math.abs(this.progress(this.player) - this.progress(c)) / 4000;
      }
    });
    const board = [...this.cars].sort((a, b) => a.place - b.place);
    this.results = board.map((c) => ({
      name: c.name,
      you: !!c.human,
      place: c.place,
      time: c.finishTime,
      car: c.car.name,
    }));
    this.audio.finish();
    this.audio.startMusic("menu");
    if (this.onFinish) this.onFinish(this.results);
  }

  hud() {
    const p = this.player;
    return {
      speed: Math.round((p?.speed || 0) / 22),
      place: p?.place || 1,
      field: this.cars.length,
      lap: this.laps,
      laps: this.totalLaps,
      time: this.time,
      nitro: p?.nitro || 0,
      fuel: p?.fuel || 0,
      toast: this.toastT > 0 ? this.toast : "",
      countdown: this.countdown,
      finished: this.finished,
    };
  }

  renderMinimap(mapCanvas) {
    if (!this.track || !mapCanvas) return;
    const m = mapCanvas.getContext("2d");
    const w = mapCanvas.width, h = mapCanvas.height;
    m.clearRect(0, 0, w, h);
    const pts = this.track.map;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    const pad = 16;
    const sx = (w - pad * 2) / Math.max(1, maxX - minX);
    const sy = (h - pad * 2) / Math.max(1, maxY - minY);
    const s = Math.min(sx, sy);
    const tx = (x) => pad + (x - minX) * s;
    const ty = (y) => pad + (y - minY) * s;
    m.strokeStyle = "rgba(255,255,255,0.35)";
    m.lineWidth = 6;
    m.lineJoin = "round";
    m.beginPath();
    pts.forEach((p, i) => i ? m.lineTo(tx(p.x), ty(p.y)) : m.moveTo(tx(p.x), ty(p.y)));
    m.stroke();
    m.strokeStyle = this.track.def.night ? "#2de2ff" : "#f0b429";
    m.lineWidth = 2;
    m.stroke();
    for (const c of this.cars) {
      const i = Math.floor(((c.z % this.track.length) + this.track.length) % this.track.length / SEG) % pts.length;
      const p = pts[i];
      m.fillStyle = c.human ? "#fff" : c.car.color;
      m.beginPath();
      m.arc(tx(p.x), ty(p.y), c.human ? 4.5 : 3, 0, Math.PI * 2);
      m.fill();
    }
  }

  render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.shake > 0) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    if (!this.track) {
      ctx.fillStyle = "#070b14";
      ctx.fillRect(0, 0, w, h);
      return;
    }
    const def = this.track.def;
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.62);
    sky.addColorStop(0, def.sky[0]);
    sky.addColorStop(1, def.sky[1]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    const sun = def.sun;
    const sg = ctx.createRadialGradient(w * sun.x, h * sun.y, 8, w * sun.x, h * sun.y, h * 0.35);
    sg.addColorStop(0, sun.color);
    sg.addColorStop(0.18, sun.glow);
    sg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, w, h * 0.62);

    this.drawHills(w, h, def);
    this.drawRoad(w, h, def);

    if (this.fovKick > 0.05) {
      ctx.fillStyle = `rgba(180, 230, 255, ${0.05 * this.fovKick})`;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = `rgba(255,255,255,${0.08 * this.fovKick})`;
      ctx.lineWidth = 2;
      for (let i = 0; i < 10; i++) {
        const y = h * 0.55 + i * 18;
        ctx.beginPath();
        ctx.moveTo(w * 0.5 - 40 - i * 40, y);
        ctx.lineTo(w * 0.5 - 80 - i * 70, y + 16);
        ctx.moveTo(w * 0.5 + 40 + i * 40, y);
        ctx.lineTo(w * 0.5 + 80 + i * 70, y + 16);
        ctx.stroke();
      }
    }
  }

  drawHills(w, h, def) {
    const ctx = this.ctx;
    const drift = this.playerX * 55 + (this.findSeg(this.position).curve || 0) * 28;
    const base = h * 0.545;
    ctx.fillStyle = mixHex(def.grass[1], def.sky[0], 0.4);
    ctx.beginPath();
    ctx.moveTo(-w * 0.1, base);
    for (let i = 0; i <= 14; i++) {
      const x = (i / 14) * w * 1.2 - drift - w * 0.1;
      const y = h * 0.36 + Math.sin(i * 0.7 + 0.4) * h * 0.08 + Math.sin(i * 1.6) * h * 0.03;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w * 1.1, base);
    ctx.fill();
    ctx.fillStyle = mixHex(def.grass[0], def.fogColor, 0.25);
    ctx.beginPath();
    ctx.moveTo(-w * 0.1, base);
    for (let i = 0; i <= 16; i++) {
      const x = (i / 16) * w * 1.2 - drift * 0.45 - w * 0.1;
      const y = h * 0.44 + Math.sin(i * 1.1 + 1.7) * h * 0.045;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w * 1.1, base);
    ctx.fill();
  }

  drawRoad(w, h, def) {
    const ctx = this.ctx;
    const segs = this.track.segs;
    const baseSeg = this.findSeg(this.position);
    const t = this.percent(this.position);
    const camY = CAM_H + lerp(baseSeg.p1.y, baseSeg.p2.y, t);
    const playerSegI = baseSeg.index;
    let maxY = h;
    const projected = [];
    let x = 0;
    let dx = -(t * baseSeg.curve);
    for (let n = 0; n < DRAW; n++) {
      const seg = segs[(playerSegI + n) % segs.length];
      const looped = (playerSegI + n) >= segs.length;
      const camZ = this.position - (looped ? this.track.length : 0);
      const p1 = project(seg.p1, this.playerX * ROAD - x, camY, camZ, w, h);
      const p2 = project(seg.p2, this.playerX * ROAD - x - dx, camY, camZ, w, h);
      projected.push({ seg, p1, p2, clip: maxY });
      x += dx;
      dx += seg.curve;
    }

    for (let n = 0; n < DRAW; n++) {
      const pack = projected[n];
      const { seg, p1, p2 } = pack;
      const hidden = p1.cz <= CAM_DEPTH || p2.y >= p1.y || p2.y >= maxY;
      pack.clip = maxY;
      if (hidden) continue;
      const fogT = Math.pow(n / DRAW, 1.15) * def.fog;
      const grass = mixHex(seg.light ? def.grass[0] : def.grass[1], def.fogColor, fogT);
      const road = mixHex(seg.light ? def.road[0] : def.road[1], def.fogColor, fogT);
      const rumble = mixHex(seg.light ? def.rumble[0] : def.rumble[1], def.fogColor, fogT);
      const lane = seg.light ? mixHex(def.lane, def.fogColor, fogT) : null;
      poly(ctx, 0, p1.y + 1, w, p1.y + 1, w, p2.y, 0, p2.y, grass);
      const r1 = rumbleW(p1.w), r2 = rumbleW(p2.w);
      poly(ctx, p1.x - p1.w - r1, p1.y, p1.x - p1.w, p1.y, p2.x - p2.w, p2.y, p2.x - p2.w - r2, p2.y, rumble);
      poly(ctx, p1.x + p1.w + r1, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x + p2.w + r2, p2.y, rumble);
      poly(ctx, p1.x - p1.w, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x - p2.w, p2.y, road);
      if (lane && p1.w > 12) {
        const lanew1 = p1.w * 2 / LANES;
        const lanew2 = p2.w * 2 / LANES;
        let lanex1 = p1.x - p1.w + lanew1;
        let lanex2 = p2.x - p2.w + lanew2;
        const l1 = laneW(p1.w), l2 = laneW(p2.w);
        for (let laneN = 1; laneN < LANES; laneN++, lanex1 += lanew1, lanex2 += lanew2) {
          poly(ctx, lanex1 - l1 / 2, p1.y, lanex1 + l1 / 2, p1.y, lanex2 + l2 / 2, p2.y, lanex2 - l2 / 2, p2.y, lane);
        }
      }
      if (seg.index < 6) {
        const stripe = seg.index % 2 === 0 ? "#f4f4f4" : "#d1242f";
        poly(ctx, p1.x - p1.w, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x - p2.w, p2.y, stripe);
      }
      maxY = p1.y;
    }

    for (let n = DRAW - 1; n >= 0; n--) {
      const { seg, p1, clip } = projected[n];
      if (!p1.scale) continue;
      for (const spr of seg.sprites) {
        const destX = p1.x + p1.scale * spr.offset * ROAD * w / 2;
        const destY = p1.y;
        const s = p1.scale * SPRITE_SCALE * ROAD * (w / 880) * spr.scale;
        if (destY > clip) continue;
        drawObject(ctx, spr.kind, destX, destY, s, def.night);
      }
      if (seg.pickup && !seg.pickup.taken) {
        const destX = p1.x + p1.scale * seg.pickup.x * ROAD * w / 2;
        const s = p1.scale * SPRITE_SCALE * ROAD * (w / 900) * 0.9;
        if (p1.y <= clip) drawObject(ctx, "fuel", destX, p1.y, s, def.night);
      }
    }

    const sprites = [];
    for (const c of this.cars) {
      if (c.human) continue;
      const dz = wrapDist(c.z, this.position, this.track.length);
      if (dz < -SEG || dz > DRAW * SEG) continue;
      const n = clamp(Math.floor(dz / SEG), 0, DRAW - 1);
      const pack = projected[n];
      if (!pack || pack.p1.scale <= 0) continue;
      const p1 = pack.p1;
      const destX = p1.x + p1.scale * c.x * ROAD * w / 2;
      const destY = p1.y;
      const s = clamp(p1.scale * SPRITE_SCALE * ROAD * (w / 560), 0.22, 2.4);
      sprites.push({ z: dz, destX, destY, s, c, clip: pack.clip });
    }
    sprites.sort((a, b) => b.z - a.z);
    for (const s of sprites) {
      if (s.destY > s.clip + 30) continue;
      drawCar(this.ctx, s.destX, s.destY, s.s, s.c.car, s.c.steer || 0, false);
    }
    if (this.player) {
      const scale = (h / 720) * 2.7;
      const bounce = Math.sin(this.position * 0.025) * (this.player.speed * 0.00035);
      drawCar(
        this.ctx,
        w / 2 + this.playerX * w * 0.07,
        h * 0.84 + bounce,
        scale,
        this.player.car,
        this.player.steer || 0,
        this.mode === "race" && this.keys.nitro && this.player.nitro > 0
      );
    }
  }
}
