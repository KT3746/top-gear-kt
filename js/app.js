import { CARS, TRACKS, UPGRADES, PRIZE, POINTS, DRIVERS, QUALIFY } from "./data.js";
import { AudioBus } from "./audio.js";
import { GameEngine } from "./engine.js";
import { getModo } from "./modo.js";

const SAVE_KEY = "relampago-save";

function emptyUpgrades() {
  return { engine: 0, tires: 0, nitro: 0 };
}

function emptyPoints() {
  return Object.fromEntries(DRIVERS.map((d) => [d.name, 0]));
}

function normalizeCup(raw) {
  if (!raw || raw.done) return null;
  const points = { ...emptyPoints(), ...(raw.points || {}) };
  const completed = Math.max(0, Math.min(TRACKS.length, Number(raw.completed) || 0));
  if (completed <= 0 && raw.phase !== "racing" && raw.phase !== "standings" && raw.phase !== "failed" && !raw.active) {
    return null;
  }
  return {
    completed,
    index: Math.max(0, Math.min(TRACKS.length - 1, Number(raw.index) || 0)),
    points,
    lastResults: raw.lastResults || null,
    done: false,
    phase: raw.phase === "racing" || raw.phase === "failed" ? raw.phase : "standings",
  };
}

function loadSave() {
  const fallback = {
    money: 0,
    upgrades: emptyUpgrades(),
    carId: "fenix",
    cup: null,
  };
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!raw) return fallback;
    return {
      money: Number(raw.money) || 0,
      upgrades: { ...emptyUpgrades(), ...(raw.upgrades || {}) },
      carId: raw.carId || "fenix",
      cup: normalizeCup(raw.cup),
    };
  } catch {
    return fallback;
  }
}

function save(state) {
  localStorage.setItem(SAVE_KEY, JSON.stringify({
    money: state.money,
    upgrades: state.upgrades,
    carId: state.carId,
    cup: state.cup || null,
  }));
}

function countdownLabel(cd) {
  if (cd > 2) return "3";
  if (cd > 1) return "2";
  if (cd > 0.28) return "1";
  return "VAI";
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
    this.phone = getModo() === "celular";
    this.kb = { up: false, down: false, left: false, right: false, nitro: false };
    this.pad = { up: false, down: false, left: false, right: false, nitro: false };
    this.goLatch = false;
    this._touches = [];
    this._touchHold = { up: false, down: false, left: false, right: false, nitro: false };
    this.screen = "title";
    this.carId = this.save.carId;
    this.trackId = TRACKS[0].id;
    this.mode = "quick";
    this.cup = null;
    this.afterShop = "mode";
    this.menuIndex = 0;
    document.body.classList.add(this.phone ? "modo-celular" : "modo-pc");
    this.engine.setPhone(this.phone);
    this._immersive = false;
    this.bind();
    this.renderCars();
    this.renderTracks();
    this.renderShop();
    this.show("title");
    this.preview("praia");
    this.refreshCupButton();
    this.loop(performance.now());
    this.syncMute();
    addEventListener("blur", () => {
      if (this.screen === "race") return;
      this.clearInput();
    });
    try {
      if (new URLSearchParams(location.search).get("v")) window.__relampago = this;
    } catch (_) {}
  }

  bind() {
    if (!this.phone) {
      addEventListener("keydown", (e) => this.onKey(e, true), { capture: true });
      addEventListener("keyup", (e) => this.onKey(e, false), { capture: true });
    }
    document.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.audio.unlock();
        this.audio.ui();
        this.act(btn.dataset.action);
      });
    });
    $("btn-mute")?.addEventListener("click", () => {
      this.audio.unlock();
      this.audio.toggleMute();
      this.syncMute();
    });
    $("btn-full")?.addEventListener("click", () => {
      this.audio.unlock();
      this.toggleFull();
    });
    if (this.phone) {
      this.bindPads();
      const trackTouches = (e) => {
        this._touches = Array.from(e.touches || []).map((t) => ({ x: t.clientX, y: t.clientY }));
        if (this.screen === "race") this.applyTouchPads();
      };
      addEventListener("touchstart", trackTouches, { passive: false, capture: true });
      addEventListener("touchmove", (e) => {
        trackTouches(e);
        if (this.screen === "race" || !e.target.closest?.(".screen")) e.preventDefault();
      }, { passive: false });
      addEventListener("touchend", trackTouches, { passive: true, capture: true });
      addEventListener("touchcancel", trackTouches, { passive: true, capture: true });
      addEventListener("gesturestart", (e) => e.preventDefault());
      addEventListener("orientationchange", () => {
        this.syncRotate();
        this.hideSafariChrome();
        this.fillVisibleShell();
      });
      matchMedia("(orientation: portrait)").addEventListener?.("change", () => this.syncRotate());
    }
    addEventListener("fullscreenchange", () => this.syncFullBtn());
    addEventListener("webkitfullscreenchange", () => this.syncFullBtn());
    visualViewport?.addEventListener("resize", () => this.fillVisibleShell());
    visualViewport?.addEventListener("scroll", () => this.fillVisibleShell());
    this.syncFullBtn();
    this.fillVisibleShell();
  }

  bindPads() {
    document.querySelectorAll("[data-hold]").forEach((el) => {
      const key = el.dataset.hold;
      const press = (e) => {
        if (e.pointerType === "mouse" && e.button != null && e.button !== 0) return;
        if (e.cancelable) e.preventDefault();
        if (e.pointerType === "touch" || e.type === "touchstart") this._touchHold[key] = true;
        try { if (e.pointerId != null) el.setPointerCapture(e.pointerId); } catch (_) {}
        this.pad[key] = true;
        if (key === "up") this.goLatch = true;
        if (key === "down") this.goLatch = false;
        el.classList.add("held");
        this.engine.setKeys(this.driveKeys());
        queueMicrotask(() => this.audio.unlock());
      };
      const release = (e) => {
        if (this._touchHold[key] && (e.pointerType === "mouse" || e.type === "mouseup" || (e.type === "pointerup" && e.pointerType !== "touch"))) {
          return;
        }
        if (e.type === "pointerup" && e.pointerType === "touch") return;
        if (e.cancelable) e.preventDefault();
        if (e.type === "touchend" || e.type === "touchcancel") this._touchHold[key] = false;
        this.pad[key] = false;
        if (key === "up") this.goLatch = false;
        el.classList.remove("held");
        this.engine.setKeys(this.driveKeys());
      };
      el.addEventListener("pointerdown", press);
      el.addEventListener("touchstart", press, { passive: false });
      el.addEventListener("pointerup", release);
      el.addEventListener("touchend", release, { passive: false });
      el.addEventListener("pointercancel", (e) => {
        if (e.pointerType === "touch") {
          this.pad[key] = true;
          this._touchHold[key] = true;
          el.classList.add("held");
          this.engine.setKeys(this.driveKeys());
          return;
        }
        release(e);
      });
      el.addEventListener("touchcancel", (e) => {
        this._touchHold[key] = true;
        this.pad[key] = true;
        el.classList.add("held");
        this.engine.setKeys(this.driveKeys());
        if (e.cancelable) e.preventDefault();
      }, { passive: false });
      el.addEventListener("contextmenu", (e) => e.preventDefault());
    });
  }

  applyTouchPads() {
    if (!this.phone || this.screen !== "race") return;
    const touches = this._touches || [];
    if (!touches.length) return;
    document.querySelectorAll("[data-hold]").forEach((el) => {
      const key = el.dataset.hold;
      const r = el.getBoundingClientRect();
      const hit = touches.some((t) => t.x >= r.left && t.x <= r.right && t.y >= r.top && t.y <= r.bottom);
      this.pad[key] = hit;
      el.classList.toggle("held", hit);
      if (hit && key === "up") this.goLatch = true;
      if (hit && key === "down") this.goLatch = false;
    });
    this.engine.setKeys(this.driveKeys());
  }

  driveKeys() {
    const lights = this.goLatch && this.engine.countdown > 0;
    if (!this.phone) {
      return {
        up: !!(this.kb.up || lights),
        down: this.kb.down,
        left: this.kb.left,
        right: this.kb.right,
        nitro: this.kb.nitro,
      };
    }
    return {
      up: !!(this.pad.up || lights),
      down: this.pad.down,
      left: this.pad.left,
      right: this.pad.right,
      nitro: this.pad.nitro,
    };
  }

  clearInput() {
    this.kb.up = this.kb.down = this.kb.left = this.kb.right = this.kb.nitro = false;
    this.pad.up = this.pad.down = this.pad.left = this.pad.right = this.pad.nitro = false;
    this.goLatch = false;
    document.querySelectorAll(".pad.held").forEach((el) => el.classList.remove("held"));
  }

  onKey(e, down) {
    const k = e.key;
    const code = e.code;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(k)) e.preventDefault();
    if (k === "ArrowUp" || k === "w" || k === "W" || code === "ArrowUp" || code === "KeyW") {
      this.kb.up = down;
      if (down) this.goLatch = true;
      else if (this.engine.countdown <= 0) this.goLatch = false;
    }
    if (k === "ArrowDown" || k === "s" || k === "S" || code === "ArrowDown" || code === "KeyS") {
      this.kb.down = down;
      if (down) this.goLatch = false;
    }
    if (k === "ArrowLeft" || k === "a" || k === "A" || code === "ArrowLeft" || code === "KeyA") this.kb.left = down;
    if (k === "ArrowRight" || k === "d" || k === "D" || code === "ArrowRight" || code === "KeyD") this.kb.right = down;
    if (k === " " || k === "Spacebar" || code === "Space") {
      e.preventDefault();
      this.kb.nitro = down;
    }
    if (k === "Shift" || code === "ShiftLeft" || code === "ShiftRight") this.kb.nitro = down;
    this.engine.setKeys(this.driveKeys());
    if (!down) return;
    this.audio.unlock();
    if (k === "m" || k === "M") {
      this.audio.toggleMute();
      this.syncMute();
    }
    if (k === "f" || k === "F") {
      this.toggleFull();
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

  isIPhone() {
    return /iPhone|iPod/i.test(navigator.userAgent || "");
  }

  isStandalone() {
    return !!(navigator.standalone || matchMedia("(display-mode: standalone)").matches);
  }

  fsElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  canFullscreenApi() {
    if (this.isIPhone()) return false;
    const el = document.documentElement;
    return typeof (el.requestFullscreen || el.webkitRequestFullscreen || el.webkitRequestFullScreen) === "function";
  }

  hideSafariChrome() {
    try {
      window.scrollTo(0, 0);
      document.documentElement.scrollIntoView?.({ block: "start" });
      requestAnimationFrame(() => {
        window.scrollTo(0, 1);
        window.scrollTo(0, 0);
      });
    } catch (_) { /* Safari antigo */ }
  }

  fillVisibleShell() {
    const app = $("app");
    if (app) {
      app.style.position = "fixed";
      app.style.inset = "0";
      app.style.top = "0";
      app.style.left = "0";
      app.style.right = "0";
      app.style.bottom = "0";
      app.style.width = "100%";
      app.style.height = "100%";
      app.style.height = "100svh";
      app.style.height = "100dvh";
      app.style.minHeight = "-webkit-fill-available";
      app.style.padding = "0";
      app.style.margin = "0";
    }
    this.engine.resize();
  }

  syncFullBtn() {
    const btn = $("btn-full");
    if (!btn) return;
    const apiOn = !!this.fsElement();
    if (this.isStandalone()) {
      btn.textContent = "Tela preenchida";
      btn.title = "Aberto pela Tela de Início — já preenche a área visível.";
      return;
    }
    if (!this.canFullscreenApi()) {
      btn.textContent = this._immersive ? "Tela preenchida" : "Preencher tela";
      btn.title = this._immersive
        ? "Preenche a área visível. A barra do Safari não some por este botão."
        : "Preenche a área visível. No iPhone a barra do Safari não some por este botão.";
      return;
    }
    btn.textContent = apiOn ? "Sair da tela cheia" : "Tela cheia";
    btn.title = apiOn ? "Sair da tela cheia" : "Tela cheia";
  }

  async toggleFull() {
    const el = document.documentElement;
    if (this.isStandalone()) {
      this._immersive = true;
      document.documentElement.classList.add("immersive");
      document.body.classList.add("immersive");
      this.syncFullBtn();
      this.hideSafariChrome();
      this.fillVisibleShell();
      return;
    }
    if (this.canFullscreenApi()) {
      const req = el.requestFullscreen || el.webkitRequestFullscreen || el.webkitRequestFullScreen;
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (this.fsElement() && exit) {
        try { await exit.call(document); } catch (_) { /* ignore */ }
        this._immersive = false;
        document.documentElement.classList.remove("immersive");
        document.body.classList.remove("immersive");
        this.syncFullBtn();
        this.fillVisibleShell();
        return;
      }
      try {
        await req.call(el, { navigationUI: "hide" });
        this._immersive = true;
        document.documentElement.classList.add("immersive");
        document.body.classList.add("immersive");
        this.syncFullBtn();
        this.fillVisibleShell();
        return;
      } catch (_) { /* iPhone/iPad recusa — cai no fallback */ }
    }
    this._immersive = !this._immersive;
    document.documentElement.classList.toggle("immersive", this._immersive);
    document.body.classList.toggle("immersive", this._immersive);
    this.hideSafariChrome();
    this.syncFullBtn();
    this.fillVisibleShell();
  }

  preview(trackId) {
    this.engine.startAttract(trackId || this.trackId || "praia", this.carId);
  }

  resetScroll(el) {
    if (!el) return;
    el.scrollTop = 0;
    el.scrollLeft = 0;
    requestAnimationFrame(() => {
      el.scrollTop = 0;
      el.scrollLeft = 0;
    });
  }

  show(name) {
    this.screen = name;
    document.body.classList.toggle("racing", name === "race");
    document.querySelectorAll(".screen").forEach((el) => el.classList.add("hidden"));
    const hud = $("hud");
    const count = $("countdown");
    const pads = $("pads");
    if (name === "mode") this.refreshCupButton();
    if (name === "race") {
      hud?.classList.remove("hidden");
      if (this.phone) pads?.classList.remove("hidden");
      else pads?.classList.add("hidden");
      this.syncRotate();
      return;
    }
    hud?.classList.add("hidden");
    count?.classList.add("hidden");
    pads?.classList.add("hidden");
    this.pad.up = this.pad.down = this.pad.left = this.pad.right = this.pad.nitro = false;
    const el = $(`screen-${name}`);
    if (el) {
      el.classList.remove("hidden");
      this.resetScroll(el);
      if (name === "cars" || name === "tracks" || name === "shop") {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            el.querySelector("button.primary")?.scrollIntoView({ block: "nearest", inline: "nearest" });
          });
        });
      }
    }
    this.syncRotate();
  }

  isRotateBlocking() {
    return this.phone && this.screen === "race" && matchMedia("(orientation: portrait)").matches;
  }

  syncRotate() {
    const hint = $("rotate-hint");
    const block = this.isRotateBlocking();
    document.body.classList.toggle("rotate-block", block);
    if (hint) hint.classList.toggle("hidden", !block);
    if (block) {
      $("toast")?.classList.add("hidden");
      $("countdown")?.classList.add("hidden");
    }
  }

  act(name) {
    if (name === "play") {
      this.show("cars");
      this.preview("praia");
    }
    if (name === "howto") this.show("howto");
    if (name === "back-title") {
      this.show("title");
      this.preview("praia");
    }
    if (name === "cars-next") this.show("mode");
    if (name === "back-cars") {
      this.show("cars");
      this.preview("praia");
    }
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
    if (name === "quit-race") this.quitRace();
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
        this.preview(this.trackId || "praia");
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
    this.refreshCupButton();
  }

  hasCupInProgress() {
    const cup = this.save.cup;
    return !!(cup && !cup.done && (cup.completed > 0 || cup.phase === "racing" || cup.phase === "standings" || cup.phase === "failed"));
  }

  refreshCupButton() {
    const btn = $("btn-cup") || document.querySelector('[data-action="mode-cup"]');
    if (!btn) return;
    btn.textContent = this.hasCupInProgress() ? "Continuar campeonato" : "Campeonato";
  }

  persistCup() {
    this.save.cup = this.cup
      ? {
          completed: this.cup.completed,
          index: this.cup.index,
          points: { ...this.cup.points },
          lastResults: this.cup.lastResults,
          done: !!this.cup.done,
          phase: this.cup.phase,
          active: !this.cup.done,
        }
      : null;
    save(this.save);
  }

  cloneCup(src) {
    return {
      completed: src.completed || 0,
      index: src.index || 0,
      points: { ...emptyPoints(), ...(src.points || {}) },
      lastResults: src.lastResults || null,
      done: !!src.done,
      phase: src.phase === "racing" || src.phase === "failed" ? src.phase : "standings",
    };
  }

  startQuick() {
    this.mode = "quick";
    this.cup = null;
    this.goRace(this.trackId);
  }

  startCup() {
    this.mode = "cup";
    const saved = this.save.cup;
    if (saved && !saved.done) {
      this.cup = this.cloneCup(saved);
      if (this.cup.phase === "failed") {
        this.cup.phase = "racing";
        this.persistCup();
        this.goRace(TRACKS[Math.min(this.cup.completed, TRACKS.length - 1)].id);
        return;
      }
      if (this.cup.completed > 0 || this.cup.phase === "standings") {
        this.cup.phase = "standings";
        this.persistCup();
        this.renderStandings();
        this.show("standings");
        const previewId = TRACKS[Math.min(this.cup.completed, TRACKS.length - 1)].id;
        this.preview(previewId);
        return;
      }
      this.cup.phase = "racing";
      this.cup.index = 0;
      this.persistCup();
      this.goRace(TRACKS[0].id);
      return;
    }
    this.cup = {
      completed: 0,
      index: 0,
      points: emptyPoints(),
      lastResults: null,
      done: false,
      phase: "racing",
    };
    this.persistCup();
    this.goRace(TRACKS[0].id);
  }

  quitRace() {
    if (this.cup) {
      this.cup.phase = this.cup.completed > 0 ? "standings" : "racing";
      this.persistCup();
      if (this.cup.completed > 0) {
        this.renderStandings();
        this.show("standings");
        this.preview(TRACKS[Math.min(this.cup.completed, TRACKS.length - 1)].id);
        return;
      }
    }
    this.show("mode");
    this.preview(this.trackId);
  }

  goRace(trackId) {
    this.trackId = trackId;
    this.engine.onFinish = (results) => this.finish(results);
    this.engine.startRace(trackId, this.carId, this.save.upgrades, 2);
    this.show("race");
    this.audio.go();
    try { window.focus(); } catch (_) {}
    try { $("view")?.focus?.(); } catch (_) {}
  }

  finish(results) {
    const you = results.find((r) => r.you);
    const prize = PRIZE[(you.place - 1)] || 80;
    this.save.money += prize;
    const nextBtn = document.querySelector('[data-action="results-next"]');
    const qualified = you.place <= QUALIFY;
    if (this.cup) {
      this.cup.lastResults = results;
      if (!qualified) {
        this.cup.phase = "failed";
        this.persistCup();
        $("results-title").textContent = "Não se classificou";
        $("results-sub").textContent = `Você chegou em ${you.place}º. Precisa do ${QUALIFY}º ou melhor para avançar. +$${prize}`;
        $("results-table").innerHTML = `
          <tr><th>#</th><th>Piloto</th><th>Carro</th><th>Tempo</th></tr>
          ${results.map((r) => `<tr class="${r.you ? "you" : ""}"><td>${r.place}</td><td>${r.name}</td><td>${r.car}</td><td>${fmt(r.time)}</td></tr>`).join("")}
        `;
        if (nextBtn) nextBtn.textContent = "Tentar de novo";
        this.show("results");
        return;
      }
      results.forEach((r) => {
        this.cup.points[r.name] = (this.cup.points[r.name] || 0) + (POINTS[r.place - 1] || 0);
      });
      this.cup.completed += 1;
      this.cup.index = this.cup.completed - 1;
      this.cup.phase = "standings";
      this.cup.done = this.cup.completed >= TRACKS.length;
      this.persistCup();
    } else {
      save(this.save);
    }
    $("results-title").textContent = you.place === 1 ? "Vitória" : "Chegada";
    $("results-sub").textContent = `${you.place}º lugar · +$${prize} · ${fmt(you.time)}`;
    $("results-table").innerHTML = `
      <tr><th>#</th><th>Piloto</th><th>Carro</th><th>Tempo</th></tr>
      ${results.map((r) => `<tr class="${r.you ? "you" : ""}"><td>${r.place}</td><td>${r.name}</td><td>${r.car}</td><td>${fmt(r.time)}</td></tr>`).join("")}
    `;
    if (nextBtn) nextBtn.textContent = "Continuar";
    this.show("results");
  }

  afterResults() {
    if (this.mode === "cup" && this.cup) {
      if (this.cup.phase === "failed") {
        this.cup.phase = "racing";
        this.persistCup();
        this.goRace(TRACKS[Math.min(this.cup.completed, TRACKS.length - 1)].id);
        return;
      }
      this.renderStandings();
      this.show("standings");
      this.preview(this.trackId);
      return;
    }
    this.show("mode");
    this.preview(this.trackId);
  }

  renderStandings() {
    const last = !this.cup || this.cup.done || this.cup.completed >= TRACKS.length;
    const rows = Object.entries(this.cup.points).sort((a, b) => b[1] - a[1]);
    $("standings-title").textContent = last ? "Taça Relâmpago" : "Classificação";
    $("standings-sub").textContent = last
      ? `${rows[0][0]} levou o campeonato.`
      : `Próxima pista: ${TRACKS[this.cup.completed].name}`;
    $("standings-table").innerHTML = `
      <tr><th>#</th><th>Piloto</th><th>Pontos</th></tr>
      ${rows.map((r, i) => `<tr class="${r[0] === "Você" ? "you" : ""}"><td>${i + 1}</td><td>${r[0]}</td><td>${r[1]}</td></tr>`).join("")}
    `;
    const next = document.querySelector('[data-action="cup-next"]');
    next.textContent = last ? "Voltar ao menu" : "Próxima etapa";
  }

  nextCupRace() {
    if (!this.cup || this.cup.done || this.cup.completed >= TRACKS.length) {
      this.cup = null;
      this.save.cup = null;
      save(this.save);
      this.show("mode");
      this.preview("praia");
      return;
    }
    this.cup.index = this.cup.completed;
    this.cup.phase = "racing";
    this.persistCup();
    this.goRace(TRACKS[this.cup.completed].id);
  }

  loop(now) {
    const last = this._now || now;
    const rawDt = (now - last) / 1000;
    const dt = Math.min(this.phone ? 1 / 30 : 0.05, rawDt);
    this._now = now;
    const rotateBlock = this.isRotateBlocking();
    if (rotateBlock !== this._wasRotate) {
      this.syncRotate();
      this._wasRotate = rotateBlock;
    }
    if (this.phone && this.screen === "race") this.applyTouchPads();
    this.engine.setKeys(this.driveKeys());
    const liveMenu = this.screen === "title" || this.screen === "cars" || this.screen === "mode" || this.screen === "tracks" || this.screen === "howto" || this.screen === "shop" || this.screen === "standings" || this.screen === "results";
    if (!rotateBlock && (this.screen === "race" || liveMenu)) {
      this.engine.update(dt, rawDt);
    }
    this.engine.render();
    if (this.screen === "race") this.paintHud(rotateBlock);
    const p = this.engine.player;
    const max = p ? this.engine.maxSpeed(p) : 1;
    const boosting = !rotateBlock && (p?.nitroBurst || 0) > 0;
    this.audio.setEngine((p?.speed || 0) / max, boosting);
    requestAnimationFrame((t) => this.loop(t));
  }

  paintHud(rotateBlock = false) {
    const h = this.engine.hud();
    $("hud-speed").textContent = String(h.speed);
    $("hud-speed").classList.toggle("boost", !rotateBlock && h.boosting);
    $("hud-pos").innerHTML = `${h.place}<span>/${h.field}</span>`;
    $("hud-lap").innerHTML = `${h.lap}<span>/${h.laps}</span>`;
    $("hud-time").textContent = fmt(h.time);
    $("hud-nitro-pips")?.querySelectorAll("i").forEach((el, i) => {
      el.classList.toggle("on", i < (h.nitroCharges || 0));
    });
    $("hud-nitro-pips")?.classList.toggle("hot", !rotateBlock && h.boosting);
    $("hud-fuel").style.width = `${Math.round(h.fuel * 100)}%`;
    const toast = $("toast");
    const showToast = !rotateBlock && h.toast && (h.toast !== "NITRO" || h.boosting);
    if (showToast) {
      toast.textContent = h.toast;
      toast.classList.remove("hidden");
    } else toast.classList.add("hidden");
    const cd = $("countdown");
    if (!rotateBlock && h.countdown > 0) {
      cd.classList.remove("hidden");
      const label = countdownLabel(h.countdown);
      if (cd.textContent !== label) {
        cd.textContent = label;
        if (label === "VAI") this.audio.go();
        else this.audio.count();
      }
    } else {
      cd.classList.add("hidden");
    }
    if (!this.phone || this._frame % 2 === 0) this.engine.renderMinimap($("minimap"));
    this._frame = (this._frame || 0) + 1;
  }
}

addEventListener("pointerdown", () => {
  window.scrollTo(0, 0);
  document.documentElement.scrollIntoView?.({ block: "start" });
}, { once: true });

new App();
