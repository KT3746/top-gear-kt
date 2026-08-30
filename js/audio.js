export class AudioBus {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem("relampago-mute") === "1";
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.engine = null;
    this.timer = null;
    this.step = 0;
    this.theme = "menu";
  }

  unlock() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.musicGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.18;
    this.sfxGain.gain.value = 0.28;
    this.musicGain.connect(this.master);
    this.sfxGain.connect(this.master);
    this.master.connect(this.ctx.destination);
    this.applyMute();
    this.startMusic("menu");
  }

  applyMute() {
    if (this.master) this.master.gain.value = this.muted ? 0 : 1;
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem("relampago-mute", this.muted ? "1" : "0");
    this.applyMute();
    this.unlock();
    return this.muted;
  }

  beep(freq = 440, dur = 0.08, type = "square", vol = 0.2) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g);
    g.connect(this.sfxGain);
    o.start();
    o.stop(this.ctx.currentTime + dur);
  }

  noise(dur = 0.2, vol = 0.12) {
    if (!this.ctx) return;
    const n = this.ctx.createBufferSource();
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    n.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 900;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    n.connect(f);
    f.connect(g);
    g.connect(this.sfxGain);
    n.start();
  }

  ui() { this.beep(620, 0.06, "square", 0.12); }
  ok() { this.beep(740, 0.09, "triangle", 0.16); }
  go() { this.beep(220, 0.2, "sawtooth", 0.14); this.beep(440, 0.18, "square", 0.1); }
  count() { this.beep(330, 0.12, "square", 0.14); }
  bump() { this.noise(0.16, 0.16); this.beep(90, 0.1, "sawtooth", 0.1); }
  finish() {
    [523, 659, 784, 1046].forEach((f, i) => {
      setTimeout(() => this.beep(f, 0.18, "triangle", 0.14), i * 120);
    });
  }

  setEngine(speed01, nitro) {
    if (!this.ctx) return;
    if (!this.engine) {
      const o = this.ctx.createOscillator();
      const f = this.ctx.createBiquadFilter();
      const g = this.ctx.createGain();
      o.type = "sawtooth";
      o.frequency.value = 40;
      f.type = "lowpass";
      f.frequency.value = 400;
      g.gain.value = 0.0001;
      o.connect(f);
      f.connect(g);
      g.connect(this.sfxGain);
      o.start();
      this.engine = { o, f, g };
    }
    const now = this.ctx.currentTime;
    const freq = 55 + speed01 * 180 + (nitro ? 40 : 0);
    const gain = 0.02 + speed01 * 0.07;
    this.engine.o.frequency.setTargetAtTime(freq, now, 0.05);
    this.engine.f.frequency.setTargetAtTime(280 + speed01 * 900, now, 0.08);
    this.engine.g.gain.setTargetAtTime(this.theme === "race" ? gain : 0.0001, now, 0.08);
  }

  startMusic(theme) {
    this.theme = theme;
    if (!this.ctx) return;
    if (this.timer) clearInterval(this.timer);
    this.step = 0;
    const bpm = theme === "race" ? 142 : 96;
    const interval = (60 / bpm) * 1000 / 2;
    this.timer = setInterval(() => this.tick(), interval);
  }

  tick() {
    if (!this.ctx || this.muted) {
      this.step++;
      return;
    }
    const t = this.ctx.currentTime;
    const race = this.theme === "race";
    const bass = race ? [98, 98, 87, 110, 98, 73, 87, 110] : [82, 82, 98, 73, 82, 65, 73, 98];
    const lead = race ? [392, 0, 440, 392, 523, 0, 494, 440] : [246, 0, 294, 246, 330, 0, 294, 220];
    const i = this.step % 8;
    this.tone(bass[i], 0.16, "triangle", 0.11, t);
    if (lead[i]) this.tone(lead[i], 0.1, race ? "square" : "sine", 0.045, t);
    if (race && i % 2 === 0) this.tone(196, 0.04, "square", 0.03, t);
    this.step++;
  }

  tone(freq, dur, type, vol, time) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + dur);
    o.connect(g);
    g.connect(this.musicGain);
    o.start(time);
    o.stop(time + dur);
  }
}
