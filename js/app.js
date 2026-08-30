import { CARS, TRACKS, UPGRADES, PRIZE, POINTS, DRIVERS } from "./data.js";
import { AudioBus } from "./audio.js";
import { GameEngine } from "./engine.js";

const SAVE_KEY = "relampago-save";

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    money: 0,
    upgrades: { engine: 0, tires: 0, nitro: 0 },
    carId: "fenix",
  };
}

function save(state) {
  localStorage.setItem(SAVE_KEY, JSON.stringify({
    money: state.money,
    upgrades: state.upgrades,
    carId: state.carId,
  }));
}

function fmt(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
}

function $(id) { return document.getElementById(id); }

class App {
  constructor() {
    this.save = loadSave();
    this.audio = new AudioBus();
    this.engine = new GameEngine($("view"), this.audio);
    this.keys = { up: false, down: false, left: false, right: false, nitro: false };
    this.screen = "title";
    this.carId = this.save.carId;
    this.trackId = TRACKS[0].id;
    this.mode = "quick";
    this.cup = null;
    this.afterShop = "mode";
    this.menuIndex = 0;
    this.bind();
    this.renderCars();
    this.renderTracks();
    this.renderShop();
    this.show("title");
    this.engine.startAttract("praia");
    this.loop(performance.now());
    this.syncMute();
  }

  bind() {
    addEventListener("keydown", (e) => this.onKey(e, true));
    addEventListener("keyup", (e) => this.onKey(e, false));
    document.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.audio.unlock();
        this.audio.ui();
        this.act(btn.dataset.action);
      });
    });
    $("btn-mute").addEventListener("click", () => {
      this.audio.unlock();
      this.audio.toggleMute();
      this.syncMute();
    });
    $("btn-full").addEventListener("click", () => {
      this.audio.unlock();
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
      else document.exitFullscreen?.();
    });
  }

  onKey(e, down) {
    const k = e.key;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(k)) e.preventDefault();
    if (k === "ArrowUp" || k === "w" || k === "W") this.keys.up = down;
    if (k === "ArrowDown" || k === "s" || k === "S") this.keys.down = down;
    if (k === "ArrowLeft" || k === "a" || k === "A") this.keys.left = down;
    if (k === "ArrowRight" || k === "d" || k === "D") this.keys.right = down;
    if (k === "Shift" || e.code === "ShiftLeft" || e.code === "ShiftRight") this.keys.nitro = down;
    if (!down) return;
    this.audio.unlock();
    if (k === "m" || k === "M") {
      this.audio.toggleMute();
      this.syncMute();
    }
    if (k === "f" || k === "F") {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
      else document.exitFullscreen?.();
    }
    if (k === "Escape") {
      if (this.screen === "race") this.act("pause");
      else if (this.screen === "pause") this.act("resume");
    }
    if (k === "Enter") {
      const screen = document.querySelector(".screen:not(.hidden)");
      const primary = screen?.querySelector("button.primary");
      if (primary && this.screen !== "race") {
        this.audio.ui();
        this.act(primary.dataset.action);
      }
    }
  }

  syncMute() {
    $("btn-mute").textContent = this.audio.muted ? "Som off" : "Som";
  }

  show(name) {
    this.screen = name;
    document.querySelectorAll(".screen").forEach((el) => el.classList.add("hidden"));
    const hud = $("hud");
    const count = $("countdown");
    if (name === "race") {
      hud.classList.remove("hidden");
      return;
    }
    hud.classList.add("hidden");
    count.classList.add("hidden");
    const el = $(`screen-${name}`);
    if (el) el.classList.remove("hidden");
  }

  act(name) {
    if (name === "play") this.show("cars");
    if (name === "howto") this.show("howto");
    if (name === "back-title") {
      this.show("title");
      this.engine.startAttract("praia");
    }
    if (name === "cars-next") this.show("mode");
    if (name === "back-cars") this.show("cars");
    if (name === "back-mode") this.show("mode");
    if (name === "mode-cup") this.startCup();
    if (name === "mode-quick") this.show("tracks");
    if (name === "open-shop") {
      this.afterShop = this.screen === "standings" ? "standings" : "mode";
      this.renderShop();
      this.show("shop");
    }
    if (name === "shop-back") {
      this.show(this.afterShop);
      if (this.afterShop === "standings") this.renderStandings();
    }
    if (name === "track-go") this.startQuick();
    if (name === "pause") {
      if (this.engine.finished) return;
      this.engine.mode = "idle";
      this.show("pause");
    }
    if (name === "resume") {
      this.engine.mode = "race";
      this.show("race");
    }
    if (name === "restart") {
      this.engine.restart();
      this.show("race");
    }
    if (name === "quit-race") {
      this.cup = null;
      this.show("mode");
      this.engine.startAttract(this.trackId);
    }
    if (name === "results-next") this.afterResults();
    if (name === "cup-next") this.nextCupRace();
    this.refreshMoney();
  }

  renderCars() {
    const grid = $("car-grid");
    grid.innerHTML = "";
    CARS.forEach((car) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "pick" + (car.id === this.carId ? " selected" : "");
      el.innerHTML = `
        <div class="swatch" style="background:${car.color}"></div>
        <h3>${car.name}</h3>
        <p>${car.tag}</p>
        ${this.stat("Velocidade", car.top, 330)}
        ${this.stat("Arranque", car.accel, 1.4)}
        ${this.stat("Aderência", car.grip, 1.4)}
        ${this.stat("Nitro", car.nitro, 1.5)}
        ${this.stat("Tanque", car.fuel, 1.2)}
      `;
      el.addEventListener("click", () => {
        this.audio.unlock();
        this.audio.ui();
        this.carId = car.id;
        this.save.carId = car.id;
        save(this.save);
        this.renderCars();
      });
      grid.appendChild(el);
    });
  }

  stat(label, value, max) {
    const pct = Math.round((value / max) * 100);
    return `<div class="stat"><b>${label}</b><i style="--v:${pct}%"></i></div>`;
  }

  renderTracks() {
    const grid = $("track-grid");
    grid.innerHTML = "";
    TRACKS.forEach((t) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "pick" + (t.id === this.trackId ? " selected" : "");
      el.innerHTML = `
        <div class="swatch" style="background:linear-gradient(90deg,${t.sky[0]},${t.sky[1]})"></div>
        <h3>${t.name}</h3>
        <p>${t.place} · ${t.laps} voltas</p>
        <p>${t.mood}</p>
      `;
      el.addEventListener("click", () => {
        this.audio.unlock();
        this.audio.ui();
        this.trackId = t.id;
        this.renderTracks();
      });
      grid.appendChild(el);
    });
  }

  renderShop() {
    $("shop-money").textContent = `Dinheiro: $${this.save.money}`;
    const grid = $("shop-grid");
    grid.innerHTML = "";
    Object.entries(UPGRADES).forEach(([key, item]) => {
      const level = this.save.upgrades[key] || 0;
      const maxed = level >= item.max;
      const cost = maxed ? 0 : item.costs[level];
      const el = document.createElement("div");
      el.className = "shop-card";
      el.innerHTML = `
        <h3>${item.name}</h3>
        <p>${item.blurb}</p>
        <p>Nível ${level}/${item.max}</p>
        ${this.stat("Força", 0.35 + level * 0.22, 1)}
        <div class="menu">
          <button type="button" ${maxed || this.save.money < cost ? "disabled" : ""}>
            ${maxed ? "No máximo" : `Comprar · $${cost}`}
          </button>
        </div>
      `;
      const btn = el.querySelector("button");
      btn.addEventListener("click", () => {
        if (maxed || this.save.money < cost) return;
        this.save.money -= cost;
        this.save.upgrades[key] = level + 1;
        save(this.save);
        this.audio.ok();
        this.renderShop();
        this.refreshMoney();
      });
      grid.appendChild(el);
    });
  }

  refreshMoney() {
    $("money-hint").textContent = `Seu dinheiro: $${this.save.money}`;
  }

  startQuick() {
    this.mode = "quick";
    this.cup = null;
    this.goRace(this.trackId);
  }

  startCup() {
    this.mode = "cup";
    this.cup = {
      index: 0,
      points: Object.fromEntries(DRIVERS.map((d) => [d.name, 0])),
      lastResults: null,
    };
    this.goRace(TRACKS[0].id);
  }

  goRace(trackId) {
    this.trackId = trackId;
    this.engine.onFinish = (results) => this.finish(results);
    this.engine.startRace(trackId, this.carId, this.save.upgrades, 2);
    this.show("race");
    this.audio.go();
  }

  finish(results) {
    const you = results.find((r) => r.you);
    const prize = PRIZE[(you.place - 1)] || 80;
    this.save.money += prize;
    save(this.save);
    if (this.cup) {
      results.forEach((r) => {
        this.cup.points[r.name] = (this.cup.points[r.name] || 0) + (POINTS[r.place - 1] || 0);
      });
      this.cup.lastResults = results;
    }
    $("results-title").textContent = you.place === 1 ? "Vitória" : "Chegada";
    $("results-sub").textContent = `${you.place}º lugar · +$${prize} · ${fmt(you.time)}`;
    $("results-table").innerHTML = `
      <tr><th>#</th><th>Piloto</th><th>Carro</th><th>Tempo</th></tr>
      ${results.map((r) => `<tr class="${r.you ? "you" : ""}"><td>${r.place}</td><td>${r.name}</td><td>${r.car}</td><td>${fmt(r.time)}</td></tr>`).join("")}
    `;
    this.show("results");
  }

  afterResults() {
    if (this.mode === "cup") {
      this.renderStandings();
      this.show("standings");
      return;
    }
    this.show("mode");
    this.engine.startAttract(this.trackId);
  }

  renderStandings() {
    const last = this.cup.index >= TRACKS.length - 1;
    const rows = Object.entries(this.cup.points).sort((a, b) => b[1] - a[1]);
    $("standings-title").textContent = last ? "Taça Relâmpago" : "Classificação";
    $("standings-sub").textContent = last
      ? `${rows[0][0]} levou o campeonato.`
      : `Próxima pista: ${TRACKS[this.cup.index + 1].name}`;
    $("standings-table").innerHTML = `
      <tr><th>#</th><th>Piloto</th><th>Pontos</th></tr>
      ${rows.map((r, i) => `<tr class="${r[0] === "Você" ? "you" : ""}"><td>${i + 1}</td><td>${r[0]}</td><td>${r[1]}</td></tr>`).join("")}
    `;
    const next = document.querySelector('[data-action="cup-next"]');
    next.textContent = last ? "Voltar ao menu" : "Próxima etapa";
  }

  nextCupRace() {
    if (this.cup.index >= TRACKS.length - 1) {
      this.cup = null;
      this.show("mode");
      this.engine.startAttract("praia");
      return;
    }
    this.cup.index += 1;
    this.goRace(TRACKS[this.cup.index].id);
  }

  loop(now) {
    const last = this._now || now;
    const dt = Math.min(0.05, (now - last) / 1000);
    this._now = now;
    this.engine.setKeys(this.keys);
    if (this.screen === "race" || this.screen === "title" || this.screen === "cars" || this.screen === "mode" || this.screen === "tracks" || this.screen === "howto" || this.screen === "shop") {
      this.engine.update(dt);
    }
    this.engine.render();
    if (this.screen === "race") this.paintHud();
    const p = this.engine.player;
    const max = p ? this.engine.maxSpeed(p) : 1;
    this.audio.setEngine((p?.speed || 0) / max, this.keys.nitro && (p?.nitro || 0) > 0);
    requestAnimationFrame((t) => this.loop(t));
  }

  paintHud() {
    const h = this.engine.hud();
    $("hud-speed").textContent = String(h.speed);
    $("hud-speed").classList.toggle("boost", this.keys.nitro && h.nitro > 0);
    $("hud-pos").innerHTML = `${h.place}<span>/${h.field}</span>`;
    $("hud-lap").innerHTML = `${h.lap}<span>/${h.laps}</span>`;
    $("hud-time").textContent = fmt(h.time);
    $("hud-nitro").style.width = `${Math.round(h.nitro * 100)}%`;
    $("hud-fuel").style.width = `${Math.round(h.fuel * 100)}%`;
    $("hud-nitro").parentElement.classList.toggle("hot", this.keys.nitro && h.nitro > 0);
    const toast = $("toast");
    if (h.toast) {
      toast.textContent = h.toast;
      toast.classList.remove("hidden");
    } else toast.classList.add("hidden");
    const cd = $("countdown");
    if (h.countdown > 0) {
      cd.classList.remove("hidden");
      const n = Math.ceil(h.countdown);
      const label = n <= 0 || h.countdown < 0.2 ? "VAI" : String(n);
      if (cd.textContent !== label) {
        cd.textContent = label;
        if (label === "VAI") this.audio.go();
        else this.audio.count();
      }
    } else {
      cd.classList.add("hidden");
    }
    this.engine.renderMinimap($("minimap"));
  }
}

addEventListener("pointerdown", () => {
  // libera o som no primeiro toque/clique
}, { once: true });

new App();
