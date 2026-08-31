import { CARS, DRIVERS, TRACKS, applyUpgrades } from "./data.js";

const SEG = 200;
const ROAD = 2100;
const LANES = 3;
const FOV = 100;
const CAM_H = 1000;
const CAM_DEPTH = 1 / Math.tan(((FOV / 2) * Math.PI) / 180);
const PLAYER_Z = CAM_H * CAM_DEPTH;
const CENTRIFUGAL = 0.09;
const SPRITE_SCALE = 0.38;
const CAR_SCALE_AT_PLAYER = 4.05;
const CAR_HALF_W = 0.15;
const CAR_HALF_L = 175;

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

function isIOSLike() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function project(p, camX, camY, camZ, w, h) {
  const cx = p.x - camX;
  const cy = p.y - camY;
  const cz = p.z - camZ;
  const scale = cz <= 1 ? 0 : CAM_DEPTH / cz;
  return {
    x: w / 2 + scale * cx * w / 2,
    y: h / 2 - scale * cy * h / 2,
    w: scale * ROAD * w / 2,
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
  ctx.scale(scale, scale * 1.28);
  ctx.rotate(steer * 0.22);
  const body = car.color;
  const accent = car.accent;
  const type = car.silhouette;
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath(); ctx.ellipse(0, 24, 64, 13, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#0d0d10";
  ctx.fillRect(-50 + steer * 4, 8, 26, 16);
  ctx.fillRect(24 + steer * 4, 8, 26, 16);
  ctx.fillStyle = "#2a2a30";
  ctx.fillRect(-48 + steer * 4, 6, 22, 6);
  ctx.fillRect(26 + steer * 4, 6, 22, 6);
  ctx.fillStyle = body;
  ctx.beginPath();
  if (type === "long") {
    ctx.moveTo(-54, 14); ctx.lineTo(-44, -16); ctx.lineTo(-8, -34); ctx.lineTo(38, -26); ctx.lineTo(58, 6); ctx.lineTo(48, 18);
  } else if (type === "wide") {
    ctx.moveTo(-60, 14); ctx.lineTo(-42, -18); ctx.lineTo(-4, -30); ctx.lineTo(36, -24); ctx.lineTo(58, 8); ctx.lineTo(46, 18);
  } else if (type === "box") {
    ctx.moveTo(-52, 16); ctx.lineTo(-46, -14); ctx.lineTo(-14, -32); ctx.lineTo(30, -32); ctx.lineTo(54, -2); ctx.lineTo(46, 18);
  } else {
    ctx.moveTo(-52, 14); ctx.lineTo(-38, -16); ctx.lineTo(-2, -32); ctx.lineTo(34, -26); ctx.lineTo(56, 6); ctx.lineTo(44, 18);
  }
  ctx.closePath();
  ctx.fill();
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(0,0,0,0.62)";
  ctx.lineWidth = 3.4;
  ctx.stroke();
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(-30, -6, 60, 12);
  ctx.fillStyle = "rgba(180, 220, 255, 0.85)";
  ctx.beginPath();
  ctx.moveTo(-12, -26); ctx.lineTo(20, -22); ctx.lineTo(14, -6); ctx.lineTo(-20, -8); ctx.closePath();
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.fillRect(-22, 4, 44, 6);
  ctx.fillStyle = nitro ? "#7cf6ff" : "#ffd36a";
  ctx.fillRect(-38, 12, 12, 6);
  ctx.fillRect(26, 12, 12, 6);
  if (nitro) {
    ctx.fillStyle = "rgba(80, 230, 255, 0.7)";
    ctx.beginPath(); ctx.moveTo(-16, 18); ctx.lineTo(0, 52); ctx.lineTo(16, 18); ctx.fill();
    ctx.fillStyle = "rgba(255, 200, 80, 0.55)";
    ctx.beginPath(); ctx.moveTo(-8, 18); ctx.lineTo(0, 40); ctx.lineTo(8, 18); ctx.fill();
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

function wrapZ(z, len) {
  z %= len;
  if (z < 0) z += len;
  return z;
}

function carScreenScale(projScale, h) {
  return projScale * CAM_H * (h / 720) * CAR_SCALE_AT_PLAYER;
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
    this.camY = CAM_H;
    this.camZ = 0;
    this.position = 0;
    this.playerX = 0;
    this._ios = isIOSLike();
    this._phone = false;
    this._skyKey = "";
    this._proj = [];
    this._lut = null;
    this._frame = 0;
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
    this.bumpCool = 0;
    this.upgrades = { engine: 0, tires: 0, nitro: 0 };
    this.playerCarId = "fenix";
    this.resize();
    addEventListener("resize", () => this.resize());
    visualViewport?.addEventListener("resize", () => this.resize());
    visualViewport?.addEventListener("scroll", () => this.resize());
  }

  setPhone(on) {
    this._phone = !!on;
  }

  resize() {
    const box = this.canvas.parentElement || this.canvas;
    const vv = visualViewport;
    const iw = Math.max(1, box.clientWidth || vv?.width || innerWidth);
    const ih = Math.max(1, box.clientHeight || vv?.height || innerHeight);
    const dprCap = this._ios || this._phone ? 1.5 : 2;
    const dpr = Math.min(devicePixelRatio || 1, dprCap);
    const bw = Math.round(iw * dpr);
    const bh = Math.round(ih * dpr);
    if (this.canvas.width === bw && this.canvas.height === bh) return;
    this.canvas.width = bw;
    this.canvas.height = bh;
    this._skyKey = "";
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
    const lut = [];
    for (let i = 0; i < 32; i++) {
      const fogT = Math.pow(i / 31, 1.15) * def.fog;
      lut.push({
        grass0: mixHex(def.grass[0], def.fogColor, fogT),
        grass1: mixHex(def.grass[1], def.fogColor, fogT),
        road0: mixHex(def.road[0], def.fogColor, fogT),
        road1: mixHex(def.road[1], def.fogColor, fogT),
        rumble0: mixHex(def.rumble[0], def.fogColor, fogT),
        rumble1: mixHex(def.rumble[1], def.fogColor, fogT),
        lane: mixHex(def.lane, def.fogColor, fogT),
      });
    }
    this._lut = lut;
    this._skyKey = "";
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
      z: PLAYER_Z,
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
        x: [-0.33, 0.33, 0][i] || 0.3,
        z: PLAYER_Z + [55, 125, 400][i],
        speed: 0,
        nitro: 1,
        fuel: 1,
        laps: 0,
        finished: false,
        finishTime: 0,
        place: i + 2,
        steer: 0,
        lane: [-0.33, 0.33, 0][i],
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
    this.countdown = 3;
    this.finished = false;
    this.results = null;
    this.mode = "race";
    this.player.z = PLAYER_Z;
    this.player.speed = 0;
    this.player.nitro = 1;
    this.player.fuel = 1;
    this.player.laps = 0;
    this.keys = { up: false, down: false, left: false, right: false, nitro: false };
    this.cars.forEach((c) => { c._lastZ = c.z; c._prevZ = c.z; c.laps = 0; c.finished = false; });
    this.position = wrapZ(this.player.z - PLAYER_Z, this.track.length);
    this.camZ = this.position;
    this.camX = this.playerX;
    const seg0 = this.findSeg(this.position);
    this.camY = CAM_H + lerp(seg0.p1.y, seg0.p2.y, this.percent(this.position));
    this.audio.startMusic("race");
  }

  startAttract(trackId, playerCarId) {
    this.loadTrack(trackId || "praia");
    this.setupField(playerCarId || this.playerCarId || "fenix", { engine: 0, tires: 0, nitro: 0 });
    this.mode = "attract";
    this.countdown = 0;
    this.player.speed = 210;
    this.player.z = PLAYER_Z;
    this.position = 0;
    this.camZ = 0;
    this.camX = this.playerX || 0;
    const segA = this.findSeg(0);
    this.camY = CAM_H + lerp(segA.p1.y, segA.p2.y, 0);
    this.cars.forEach((c, i) => {
      if (!c.human) {
        c.speed = 180 + i * 12;
        c.z = PLAYER_Z + (i + 1) * SEG * 8;
      }
    });
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

  update(dt, rawDt = dt) {
    if (!this.track || this.mode === "idle") return;
    if (this.mode === "attract") {
      this.autoDrive(dt);
      this.followCamera(dt);
      return;
    }
    if (this.mode !== "race" || this.finished) {
      if (this.finished) {
        this.simulateWorld(dt, false, false);
        this.followCamera(dt);
      }
      return;
    }
    if (this.countdown > 0) {
      // Tempo de parede (não o dt da física, que é limitado) para o 3-2-1 não “grudar”.
      this.countdown = Math.max(0, this.countdown - Math.min(0.25, rawDt > 0 ? rawDt : dt));
      this.simulateWorld(dt, true, true);
      this.followCamera(dt);
      return;
    }
    this.drivePlayer(dt);
    this.driveAI(dt);
    this.simulateWorld(dt, false);
    this.time += dt;
    this.lapTime += dt;
    this.collisions();
    this.position = wrapZ(this.player.z - PLAYER_Z, this.track.length);
    this.followCamera(dt);
    this.pickups();
    this.rank();
    this.checkLaps();
    if (this.bumpCool > 0) this.bumpCool -= dt;
  }

  drivePlayer(dt) {
    const p = this.player;
    const up = this.keys.up;
    const down = this.keys.down;
    const left = this.keys.left;
    const right = this.keys.right;
    const offAmt = Math.max(0, Math.abs(this.playerX) - 1);
    const off = offAmt > 0.012;
    const moving = p.speed > 40;
    const boost = !!(this.keys.nitro && p.nitro > 0 && p.fuel > 0 && moving && !off);

    let max = this.maxSpeed(p);
    if (boost) max *= 1.32 + (p.spec.nitro - 1) * 0.3;
    if (off) {
      const dirt = 0.36 + ((p.spec.offroad || 1) - 1) * 0.12;
      max *= dirt / (1 + offAmt * 1.15);
    }

    const accel = 3400 * p.spec.accel * (boost ? 1.85 : 1) * (off ? 0.42 : 1);
    if (up) p.speed += accel * dt;
    else p.speed -= (off ? 780 : 520) * dt;
    if (down) p.speed -= 3800 * dt;
    if (off && p.speed > max) {
      p.speed -= (1600 + (p.speed - max) * 2.4) * dt;
      if (p.speed < max) p.speed = max;
    } else {
      p.speed = clamp(p.speed, 0, max);
    }
    p.speed = Math.max(0, p.speed);

    const speedPct = p.speed / Math.max(1, this.maxSpeed(p));
    const grip = p.spec.grip * (off ? 0.32 : 1);
    const want = (right ? 1 : 0) - (left ? 1 : 0);
    this.steer = lerp(this.steer, want, (off ? 3.2 : 7) * dt);
    this.playerX += this.steer * (0.92 + grip * 0.18) * (0.4 + 0.6 * speedPct) * dt;
    const look = this.findSeg(p.z + 12 * SEG);
    this.playerX += (-look.curve * (off ? 0.07 : 0.034) * speedPct) * dt;
    if (!want) this.playerX = lerp(this.playerX, clamp(-look.curve * 0.03, -0.25, 0.25), (off ? 0.35 : 1.25) * dt);
    if (off) this.playerX -= Math.sign(this.playerX) * 0.55 * dt;
    this.slip = lerp(this.slip, this.steer * speedPct * (off ? 1.35 : 0.7), 6 * dt);
    p.steer = this.slip;

    if (boost) {
      p.nitro = Math.max(0, p.nitro - dt * 0.55 / p.spec.nitroTank);
      p.fuel = Math.max(0, p.fuel - dt * 0.05);
      this.fovKick = lerp(this.fovKick, 1, 6 * dt);
      if (p.nitro > 0) {
        this.toast = "NITRO";
        this.toastT = 0.2;
      } else if (this.toast === "NITRO") {
        this.toast = "";
        this.toastT = 0;
      }
    } else {
      p.nitro = Math.min(1, p.nitro + dt * 0.08);
      this.fovKick = lerp(this.fovKick, 0, 4 * dt);
      if (this.toast === "NITRO") {
        this.toast = "";
        this.toastT = 0;
      }
    }
    p.fuel = Math.max(0, p.fuel - dt * (0.0035 + speedPct * 0.0028) / p.spec.fuel);
    if (off) {
      if (this.toast !== "NITRO") {
        this.toast = "FORA DA PISTA";
        this.toastT = 0.3;
      }
    }
  }

  autoDrive(dt) {
    const len = this.track.length;
    const p = this.player;
    p.z += 4200 * dt;
    p.z = wrapZ(p.z, len);
    this.position = wrapZ(p.z - PLAYER_Z, len);
    const seg = this.findSeg(p.z);
    this.playerX = lerp(this.playerX, -seg.curve * 0.04, 0.8 * dt);
    p.x = this.playerX;
    this.steer = lerp(this.steer, -seg.curve * 0.08, dt * 2);
    this.player.steer = this.steer;
    this.cars.forEach((c) => {
      if (c.human) return;
      c.z += c.speed * 18 * dt;
      c.z = wrapZ(c.z, len);
    });
  }

  driveAI(dt) {
    const len = this.track.length;
    const playerLead = this.progress(this.player);
    for (const c of this.cars) {
      if (c.human || c.finished) continue;
      const look = this.findSeg(c.z + 18 * SEG);
      const here = this.findSeg(c.z);
      const danger = Math.abs(look.curve) + Math.abs(here.curve);
      let target = this.maxSpeed(c) * (0.5 + c.skill * 0.16) * (1 - danger * 0.055);
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
        if (dz > 0 && dz < SEG * 10 && Math.abs(o.x - c.x) < CAR_HALF_W * 2.4) {
          lane = c.x >= o.x ? Math.min(0.72, o.x + 0.42) : Math.max(-0.72, o.x - 0.42);
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
      const seg = this.findSeg(p.z);
      const speedPct = p.speed / Math.max(1, this.maxSpeed(p));
      this.playerX -= dt * speedPct * seg.curve * CENTRIFUGAL / (p.spec.grip * (Math.abs(this.playerX) > 1 ? 0.4 : 1));
      p._prevZ = p.z;
      p.z += p.speed * dt;
      p.z = wrapZ(p.z, len);
    } else {
      p._prevZ = p.z;
    }
    this.playerX = clamp(this.playerX, -2.2, 2.2);
    p.x = this.playerX;
    this.position = wrapZ(p.z - PLAYER_Z, len);
    if (!freezeAI) {
      for (const c of this.cars) {
        if (c.human) continue;
        c._prevZ = c.z;
        c.z += c.speed * dt;
        c.z = wrapZ(c.z, len);
      }
    } else {
      for (const c of this.cars) {
        if (!c.human) c._prevZ = c.z;
      }
    }
    this.shake = Math.max(0, this.shake - 18 * dt);
    if (this.toastT > 0) this.toastT -= dt;
  }

  followCamera(dt) {
    if (!this.track) return;
    const len = this.track.length;
    const follow = 1 - Math.exp(-(this._phone || this._ios ? 12 : 18) * dt);
    this.camX = lerp(this.camX, this.playerX, follow);
    const seg = this.findSeg(this.position);
    const t = this.percent(this.position);
    const wantY = CAM_H + lerp(seg.p1.y, seg.p2.y, t);
    this.camY = lerp(this.camY, wantY, 1 - Math.exp(-10 * dt));
    let zStep = wrapDist(this.position, this.camZ, len);
    const zCap = SEG * 1.25;
    this.camZ = wrapZ(this.camZ + clamp(zStep, -zCap, zCap), len);
  }

  collisions() {
    const len = this.track.length;
    const halfW = CAR_HALF_W;
    const minZ = CAR_HALF_L * 2;
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i < this.cars.length; i++) {
        for (let j = i + 1; j < this.cars.length; j++) {
          const a = this.cars[i];
          const b = this.cars[j];
          const dz = wrapDist(a.z, b.z, len);
          const adz = Math.abs(dz);
          const dx = a.x - b.x;
          const adx = Math.abs(dx);
          if (adz >= minZ || adx >= halfW * 2) continue;

          const hitSpeed = Math.abs(a.speed - b.speed);
          const sameLane = adx < halfW * 1.55;
          const prevDz = wrapDist(a._prevZ ?? a.z, b._prevZ ?? b.z, len);
          const aAhead = prevDz !== 0 ? prevDz > 0 : dz >= 0;
          const ahead = aAhead ? a : b;
          const behind = aAhead ? b : a;

          if (sameLane) {
            const dNow = wrapDist(ahead.z, behind.z, len);
            const push = minZ - dNow;
            if (push > 0 && !behind.human) behind.z = wrapZ(behind.z - push, len);
            const side = Math.sign(behind.x - ahead.x) || 1;
            behind.x = clamp(ahead.x + side * Math.max(halfW * 1.65, adx), -1.65, 1.65);
            behind.speed = Math.min(behind.speed, Math.max(0, ahead.speed * 0.42));
            ahead.speed *= 0.97;
          } else {
            const overlapX = halfW * 2 - adx;
            const side = Math.sign(dx) || 1;
            a.x = clamp(a.x + side * Math.max(overlapX * 0.5, 0.06), -1.65, 1.65);
            b.x = clamp(b.x - side * Math.max(overlapX * 0.5, 0.06), -1.65, 1.65);
            a.speed *= 0.82;
            b.speed *= 0.82;
          }

          if (a.human) this.playerX = a.x;
          if (b.human) this.playerX = b.x;

          if ((a.human || b.human) && hitSpeed > 120) {
            this.shake = Math.max(this.shake, 12);
            if (this.bumpCool <= 0) {
              this.audio.bump();
              this.bumpCool = 0.22;
            }
          }
        }
      }
    }
  }

  pickups() {
    const seg = this.findSeg(this.player.z);
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
    this.cars.forEach((c) => {
      if (!c.finished) {
        c.finished = true;
        const behind = Math.max(0, this.progress(this.player) - this.progress(c));
        c.finishTime = this.time + behind / 4000;
      }
    });
    const board = [...this.cars].sort((a, b) => a.finishTime - b.finishTime);
    board.forEach((c, i) => { c.place = i + 1; });
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
      toast: this.toastT > 0 && this.toast ? this.toast : "",
      countdown: this.countdown,
      boosting: !!(this.keys.nitro && p?.nitro > 0 && p?.fuel > 0 && (p?.speed || 0) > 40 && Math.abs(this.playerX) <= 1),
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
    this._frame += 1;
    if (!this.track) {
      ctx.fillStyle = "#070b14";
      ctx.fillRect(0, 0, w, h);
      return;
    }
    const def = this.track.def;
    const skyKey = `${w}x${h}:${def.id}`;
    if (this._skyKey !== skyKey) {
      const sky = ctx.createLinearGradient(0, 0, 0, h * 0.62);
      sky.addColorStop(0, def.sky[0]);
      sky.addColorStop(1, def.sky[1]);
      this._skyGrad = sky;
      const sun = def.sun;
      const sg = ctx.createRadialGradient(w * sun.x, h * sun.y, 8, w * sun.x, h * sun.y, h * 0.35);
      sg.addColorStop(0, sun.color);
      sg.addColorStop(0.18, sun.glow);
      sg.addColorStop(1, "rgba(0,0,0,0)");
      this._sunGrad = sg;
      this._skyKey = skyKey;
    }
    ctx.fillStyle = this._skyGrad;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = this._sunGrad;
    ctx.fillRect(0, 0, w, h * 0.62);

    this.drawHills(w, h, def);
    this.drawRoad(w, h, def);

    if (this.fovKick > 0.05) {
      ctx.fillStyle = `rgba(180, 230, 255, ${0.05 * this.fovKick})`;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = `rgba(255,255,255,${0.08 * this.fovKick})`;
      ctx.lineWidth = 2;
      const lines = this._phone || this._ios ? 6 : 10;
      for (let i = 0; i < lines; i++) {
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
    const drift = this.camX * 55 + (this.findSeg(this.camZ).curve || 0) * 28;
    const base = h * 0.545;
    ctx.fillStyle = mixHex(def.grass[1], def.sky[0], 0.4);
    ctx.beginPath();
    ctx.moveTo(-w * 0.1, base);
    const steps = this._phone || this._ios ? 10 : 14;
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * w * 1.2 - drift - w * 0.1;
      const y = h * 0.36 + Math.sin(i * 0.7 + 0.4) * h * 0.08 + Math.sin(i * 1.6) * h * 0.03;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w * 1.1, base);
    ctx.fill();
    ctx.fillStyle = mixHex(def.grass[0], def.fogColor, 0.25);
    ctx.beginPath();
    ctx.moveTo(-w * 0.1, base);
    const steps2 = this._phone || this._ios ? 10 : 16;
    for (let i = 0; i <= steps2; i++) {
      const x = (i / steps2) * w * 1.2 - drift * 0.45 - w * 0.1;
      const y = h * 0.44 + Math.sin(i * 1.1 + 1.7) * h * 0.045;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w * 1.1, base);
    ctx.fill();
  }

  drawDistance() {
    if (this._phone || this._ios) return 200;
    return 230;
  }

  drawRoad(w, h, def) {
    const ctx = this.ctx;
    const segs = this.track.segs;
    const drawN = this.drawDistance();
    const camZ = this.camZ;
    const baseSeg = this.findSeg(camZ);
    const t = this.percent(camZ);
    const camY = this.camY;
    const playerSegI = baseSeg.index;
    const camXWorld = this.camX * ROAD;
    let maxY = h;
    if (this._proj.length !== drawN) {
      this._proj = Array.from({ length: drawN }, () => ({ seg: null, p1: null, p2: null, clip: 0 }));
    }
    const projected = this._proj;
    let x = 0;
    let dx = -(t * baseSeg.curve);
    let prevP2 = null;
    const spriteUntil = Math.floor(drawN * 0.52);
    for (let n = 0; n < drawN; n++) {
      const seg = segs[(playerSegI + n) % segs.length];
      const looped = (playerSegI + n) >= segs.length;
      const cz = camZ - (looped ? this.track.length : 0);
      const p1 = prevP2 || project(seg.p1, camXWorld - x, camY, cz, w, h);
      const p2 = project(seg.p2, camXWorld - x - dx, camY, cz, w, h);
      const pack = projected[n];
      pack.seg = seg;
      pack.p1 = p1;
      pack.p2 = p2;
      pack.clip = maxY;
      prevP2 = p2;
      x += dx;
      dx += seg.curve;
    }

    const lut = this._lut;
    const lutMax = lut ? lut.length - 1 : 0;
    for (let n = 0; n < drawN; n++) {
      const pack = projected[n];
      const { seg, p1, p2 } = pack;
      pack.clip = maxY;
      if (p1.cz <= 1 && p2.cz <= 1) continue;
      if (p1.y < p2.y - 6) continue;
      if (p2.y >= maxY && p1.y >= maxY) continue;
      const pal = lut[Math.min(lutMax, (n / drawN * lutMax) | 0)];
      const grass = seg.light ? pal.grass0 : pal.grass1;
      const road = seg.light ? pal.road0 : pal.road1;
      const rumble = seg.light ? pal.rumble0 : pal.rumble1;
      poly(ctx, 0, p1.y, w, p1.y, w, p2.y, 0, p2.y, grass);
      const r1 = rumbleW(p1.w), r2 = rumbleW(p2.w);
      poly(ctx, p1.x - p1.w - r1, p1.y, p1.x - p1.w, p1.y, p2.x - p2.w, p2.y, p2.x - p2.w - r2, p2.y, rumble);
      poly(ctx, p1.x + p1.w + r1, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x + p2.w + r2, p2.y, rumble);
      poly(ctx, p1.x - p1.w, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x - p2.w, p2.y, road);
      if (seg.light && p1.w > 18) {
        const lanew1 = p1.w * 2 / LANES;
        const lanew2 = p2.w * 2 / LANES;
        let lanex1 = p1.x - p1.w + lanew1;
        let lanex2 = p2.x - p2.w + lanew2;
        const l1 = laneW(p1.w), l2 = laneW(p2.w);
        for (let laneN = 1; laneN < LANES; laneN++, lanex1 += lanew1, lanex2 += lanew2) {
          poly(ctx, lanex1 - l1 / 2, p1.y, lanex1 + l1 / 2, p1.y, lanex2 + l2 / 2, p2.y, lanex2 - l2 / 2, p2.y, pal.lane);
        }
      }
      if (seg.index < 6) {
        const stripe = seg.index % 2 === 0 ? "#f4f4f4" : "#d1242f";
        poly(ctx, p1.x - p1.w, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x - p2.w, p2.y, stripe);
      }
      if (p1.y < maxY) maxY = p1.y;
    }
    if (maxY > h * 0.5) {
      const pal = lut[lutMax];
      ctx.fillStyle = pal.grass1;
      ctx.fillRect(0, h * 0.48, w, maxY - h * 0.48);
    }

    for (let n = spriteUntil; n >= 0; n--) {
      const { seg, p1, clip } = projected[n];
      if (!p1?.scale || p1.scale < 0.018) continue;
      for (const spr of seg.sprites) {
        const destY = p1.y;
        if (destY > clip) continue;
        const destX = p1.x + p1.scale * spr.offset * ROAD * w / 2;
        const s = p1.scale * SPRITE_SCALE * ROAD * (w / 880) * spr.scale;
        if (s < 0.14) continue;
        drawObject(ctx, spr.kind, destX, destY, s, def.night);
      }
      if (seg.pickup && !seg.pickup.taken) {
        if (p1.y > clip) continue;
        const destX = p1.x + p1.scale * seg.pickup.x * ROAD * w / 2;
        const s = p1.scale * SPRITE_SCALE * ROAD * (w / 900) * 0.9;
        drawObject(ctx, "fuel", destX, p1.y, s, def.night);
      }
    }

    const sprites = [];
    for (const c of this.cars) {
      const spr = this.projectCar(c, projected, w, h, drawN);
      if (spr) sprites.push(spr);
    }
    sprites.sort((a, b) => b.z - a.z);
    for (const s of sprites) {
      if (!s.human && s.destY > s.clip + 24) continue;
      const nitro = s.human && this.mode === "race" && this.keys.nitro && s.c.nitro > 0;
      drawCar(this.ctx, s.destX, s.destY, s.s, s.c.car, s.c.steer || 0, nitro);
    }
  }

  projectCar(c, projected, w, h, drawN) {
    if (c.human) {
      return {
        z: PLAYER_Z,
        destX: w / 2,
        destY: h * 0.835,
        s: CAR_SCALE_AT_PLAYER * (h / 720),
        c,
        clip: h,
        human: true,
      };
    }
    const len = this.track.length;
    const camZ = this.camZ;
    const dz = wrapDist(c.z, camZ, len);
    if (dz < 70 || dz > (drawN - 2) * SEG) return null;
    const n = clamp(Math.floor(dz / SEG), 0, drawN - 2);
    const pack = projected[n];
    const nxt = projected[n + 1] || pack;
    if (!pack?.p1?.scale) return null;
    const pct = clamp((dz - n * SEG) / SEG, 0, 1);
    const p1 = pack.p1;
    const p2 = nxt.p1?.scale ? nxt.p1 : pack.p2;
    const sc = lerp(p1.scale, p2.scale, pct);
    if (sc <= 0) return null;
    const destY = lerp(p1.y, p2.y, pct);
    let s = carScreenScale(sc, h);
    s = clamp(s, 0.14, (h / 720) * 8);
    const ground = destY - s * 18;
    return {
      z: dz,
      destX: lerp(p1.x, p2.x, pct) + sc * c.x * ROAD * w / 2,
      destY: ground,
      s,
      c,
      clip: pack.clip,
      human: false,
    };
  }
}
