"use strict";
const $ = id => document.getElementById(id);
$("home").href = location.pathname; // same page, no hash = default settings (works for file:// too)

// ---------- keyboard mapping (physical keys, layout independent) ----------
const ROWS = [
  ["KeyZ","KeyX","KeyC","KeyV","KeyB","KeyN","KeyM","Comma","Period","Slash"],
  ["KeyA","KeyS","KeyD","KeyF","KeyG","KeyH","KeyJ","KeyK","KeyL","Semicolon","Quote"],
  ["KeyQ","KeyW","KeyE","KeyR","KeyT","KeyY","KeyU","KeyI","KeyO","KeyP","BracketLeft","BracketRight"],
  ["Digit1","Digit2","Digit3","Digit4","Digit5","Digit6","Digit7","Digit8","Digit9","Digit0","Minus","Equal"],
];
const CODES = ROWS.flat();
const SYM = {Comma:",",Period:".",Slash:"/",Semicolon:";",Quote:"'",BracketLeft:"[",BracketRight:"]",Minus:"-",Equal:"="};
const keyLabel = c => SYM[c] || c.replace(/^Key|^Digit/, "");

// ---------- state ----------
const state = { n: 15, base: 261.63, oct: 2, ratio: 2, wave: "piano", vol: 0.6, rel: 0.5 };
let offset = 0, total = 0, freqs = [], keyEls = [], counts = [];
let sustain = false;

function readHash() {
  try {
    const p = new URLSearchParams(location.hash.slice(1));
    const num = (k, d) => (p.has(k) && isFinite(+p.get(k))) ? +p.get(k) : d;
    state.n = num("n", state.n); state.base = num("f", state.base); state.oct = num("o", state.oct);
    state.ratio = num("r", state.ratio); state.vol = num("v", state.vol); state.rel = num("rel", state.rel);
    if (p.has("w")) state.wave = p.get("w");
  } catch (e) {}
}
function writeHash() {
  try {
    const old = new URLSearchParams(location.hash.slice(1));
    const p = new URLSearchParams({ n: state.n, f: +state.base.toFixed(4), o: state.oct, r: +state.ratio.toFixed(6), w: state.wave, v: state.vol, rel: state.rel });
    for (const k of ["s", "src"]) if (old.has(k)) p.set(k, old.get(k));
    history.replaceState(null, "", "#" + p.toString());
  } catch (e) {}
}
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
function sanitize() {
  state.n = clamp(Math.round(state.n) || 12, 1, 120);
  state.base = clamp(state.base || 261.63, 10, 5000);
  state.oct = clamp(Math.round(state.oct) || 1, 1, 10);
  state.ratio = clamp(state.ratio || 2, 1.01, 10);
  if (!["piano","organ","sine","triangle","sawtooth","square"].includes(state.wave)) state.wave = "piano";
  state.vol = clamp(state.vol, 0, 1); state.rel = clamp(state.rel, 0.05, 3);
}

// ---------- music helpers ----------
const NAMES = ["C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","B"];
function nearest12(f) {
  const m = 69 + 12 * Math.log2(f / 440), r = Math.round(m);
  return { name: NAMES[((r % 12) + 12) % 12] + (Math.floor(r / 12) - 1), cents: (m - r) * 100 };
}
const fmtC = c => (c >= 0 ? "+" : "−") + Math.abs(c).toFixed(Math.abs(c) < 10 ? 1 : 0);
const JUST = [["6/5", 6/5], ["5/4", 5/4], ["4/3", 4/3], ["7/5", 7/5], ["3/2", 3/2], ["5/3", 5/3], ["7/4", 7/4]];

// ---------- build ----------
function build() {
  sanitize(); stopAll();
  const { n, base, oct, ratio } = state;
  total = Math.min(n * oct + 1, 1201);
  freqs = Array.from({ length: total }, (_, i) => base * Math.pow(ratio, i / n));
  counts = new Array(total).fill(0);
  if (offset >= total) offset = 0;

  const kb = $("kb"); kb.innerHTML = ""; keyEls = [];
  const frag = document.createDocumentFragment();
  for (let i = 0; i < total; i++) {
    const el = document.createElement("div");
    el.className = "key" + (i % n === 0 ? " period" : "");
    el.dataset.i = i;
    el.style.setProperty("--h", Math.round((i % n) / n * 330));
    const nn = nearest12(freqs[i]);
    el.title = `${freqs[i].toFixed(2)} Гц · шаг ${i % n} · ≈ ${nn.name} ${fmtC(nn.cents)} ¢`;
    el.innerHTML = (Math.abs(nn.cents) < 5 ? '<span class="dot"></span>' : "") +
      `<span class="kl"></span><span class="st">${i % n}</span><span class="nt">${nn.name}</span><span class="ct">${fmtC(nn.cents)}</span>`;
    keyEls.push(el); frag.appendChild(el);
  }
  kb.appendChild(frag);
  updateMapping(); renderInfo(); renderRuler(); syncInputs(); writeHash();
}

function updateMapping() {
  keyEls.forEach((el, i) => {
    const j = i - offset, mapped = j >= 0 && j < CODES.length;
    el.classList.toggle("mapped", mapped);
    el.querySelector(".kl").textContent = mapped ? keyLabel(CODES[j]) : "";
  });
  const last = Math.min(total, offset + CODES.length) - 1;
  $("win").textContent = `клавиатура: ноты ${offset}–${last}`;
  $("left").disabled = offset === 0;
  $("right").disabled = offset + state.n >= total;
  const el = keyEls[offset];
  if (el) { const w = $("kbwrap"); w.scrollTo({ left: el.offsetLeft - w.offsetLeft - 8, behavior: "smooth" }); }
}
function shift(dir) {
  const next = offset + dir * state.n;
  if (next < 0 || next >= total) return;
  offset = next; updateMapping();
}

function renderInfo() {
  const { n, ratio } = state;
  const P = 1200 * Math.log2(ratio), step = P / n;
  const parts = [`Шаг: <b>${step.toFixed(2)} ¢</b> (×${Math.pow(ratio, 1 / n).toFixed(5)}), обычный полутон — 100 ¢.`,
    `Всего клавиш: <b>${total}</b>, от <b>${freqs[0].toFixed(2)}</b> до <b>${freqs[total - 1].toFixed(2)} Гц</b>.`];
  const best = [];
  for (const [name, r] of [["квинта 3/2", 3/2], ["б. терция 5/4", 5/4], ["м. терция 6/5", 6/5]]) {
    if (r >= ratio) continue;
    const c = 1200 * Math.log2(r), k = Math.round(c / step), err = k * step - c;
    best.push(`${name} ≈ шаг ${k} (<b>${fmtC(err)} ¢</b>)`);
  }
  if (best.length) parts.push("Ближайшие чистые интервалы: " + best.join(", ") + ".");
  $("info").innerHTML = parts.join(" ");
}

function renderRuler() {
  const { n, ratio } = state;
  const P = 1200 * Math.log2(ratio), r = $("ruler");
  r.innerHTML = "";
  const add = (cls, cents, text, color) => {
    const t = document.createElement("div");
    t.className = "tick " + cls; t.style.left = (cents / P * 100) + "%";
    if (color) t.style.background = color;
    if (text !== "") { const s = document.createElement("span"); s.textContent = text; t.appendChild(s); }
    r.appendChild(t);
  };
  for (let k = 0; k * 100 <= P + 1e-9; k++) add("t12", k * 100, P <= 2400 ? k : "");
  for (const [name, v] of JUST) { const c = 1200 * Math.log2(v); if (c < P) add("tj", c, name); }
  const showLabels = n <= 31;
  for (let k = 0; k <= n; k++) add("tn", k * P / n, showLabels ? k : "", `hsl(${Math.round((k % n) / n * 330)} 60% 50%)`);
}

function syncInputs() {
  $("n").value = state.n; $("base").value = state.base; $("oct").value = state.oct; $("ratio").value = state.ratio;
  $("wave").value = state.wave; $("vol").value = state.vol; $("rel").value = state.rel;
  const pv = `${state.n},${state.ratio}`;
  $("preset").value = [...$("preset").options].some(o => o.value === pv) ? pv : "";
}

// ---------- audio ----------
let ctx = null, master = null, waves = {};
function ensureAudio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    master = ctx.createGain(); master.gain.value = state.vol;
    master.connect(comp).connect(ctx.destination);
    const mk = amps => {
      const re = new Float32Array(amps.length + 1), im = new Float32Array(amps.length + 1);
      amps.forEach((a, k) => im[k + 1] = a);
      return ctx.createPeriodicWave(re, im);
    };
    waves.piano = mk([1, .55, .32, .22, .14, .1, .06, .045, .03, .02, .012, .008]);
    waves.organ = mk([1, .7, .45, .5, 0, .3, 0, .25, 0, 0, 0, .12]);
  }
  if (ctx.state === "suspended") ctx.resume();
}

function startVoice(i) {
  ensureAudio();
  return makeVoice(freqs[i], ctx.currentTime, state.wave, 1, master, i);
}
// One note: frequency f, start time t (AudioContext time), timbre w, velocity vel (0..1).
function makeVoice(f, t, w, vel, dest, i) {
  const g = ctx.createGain(); g.connect(dest);
  const harsh = w === "sawtooth" || w === "square";
  const peak = vel * (harsh ? 0.12 : 0.28) * clamp(Math.pow(300 / f, 0.25), 0.5, 1.4);
  const detunes = w === "piano" ? [-2, 2] : [0];
  const oscs = detunes.map(d => {
    const o = ctx.createOscillator();
    if (waves[w]) o.setPeriodicWave(waves[w]); else o.type = w;
    o.frequency.value = f; o.detune.value = d;
    o.connect(g); o.start(t); return o;
  });
  const lvl = peak / detunes.length, atk = 0.006;
  const env = w === "piano"
    ? { t, atk, lvl, target: 0, tau: clamp(1.6 * Math.sqrt(220 / f), 0.25, 3.5) }
    : { t, atk, lvl, target: lvl * 0.75, tau: 0.25 };
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(lvl, t + atk);
  g.gain.setTargetAtTime(env.target, t + atk, env.tau);
  return { oscs, g, i, env };
}
// Envelope level at time t, computed from the schedule above. Reading gain.value is not
// an option: for a release scheduled ahead (song playback) it returns the value *now*,
// and Firefox (no cancelAndHoldAtTime) then jumped to it, giving each note a second attack.
function envAt(e, t) {
  if (t <= e.t) return 0;
  if (t < e.t + e.atk) return e.lvl * (t - e.t) / e.atk;
  return e.target + (e.lvl - e.target) * Math.exp(-(t - e.t - e.atk) / e.tau);
}
function releaseVoice(v, at) {
  const t = at ?? ctx.currentTime, p = v.g.gain;
  p.cancelScheduledValues(t);
  p.setValueAtTime(envAt(v.env, t), t);
  p.setTargetAtTime(0, t, state.rel / 4);
  v.oscs.forEach(o => o.stop(t + state.rel + 0.3));
}

const voices = new Map(); // source id -> voice
let held = [];
function mark(i, d) {
  if (!keyEls[i]) return;
  counts[i] = Math.max(0, counts[i] + d);
  keyEls[i].classList.toggle("on", counts[i] > 0);
}
function press(src, i) {
  if (i < 0 || i >= total) return;
  release(src);
  voices.set(src, startVoice(i)); mark(i, 1);
  if (rec && (src[0] === "k" || src[0] === "p")) {
    const note = { i, on: performance.now() / 1000, off: null };
    rec.notes.push(note); rec.open.set(src, note); updateRecStatus();
  }
}
function release(src) {
  const v = voices.get(src); if (!v) return;
  voices.delete(src); mark(v.i, -1);
  if (rec && rec.open.has(src)) { rec.open.get(src).off = performance.now() / 1000; rec.open.delete(src); }
  if (sustain) held.push(v); else releaseVoice(v);
}
function setSustain(on) {
  sustain = on; $("sus").classList.toggle("on", on);
  if (!on) { held.forEach(v => releaseVoice(v)); held = []; }
}
function stopAll() {
  stopScale(); stopSong();
  [...voices.keys()].forEach(release);
  held.forEach(v => releaseVoice(v)); held = [];
}

// ---------- scale playback ----------
let scaleTimer = null;
function playScale() {
  stopScale();
  const start = offset, end = Math.min(total - 1, offset + state.n);
  const seq = [];
  for (let i = start; i <= end; i++) seq.push(i);
  for (let i = end - 1; i >= start; i--) seq.push(i);
  let k = 0;
  const stepMs = clamp(3600 / seq.length, 110, 280);
  const tick = () => {
    if (k >= seq.length) { release("scale"); scaleTimer = null; return; }
    press("scale", seq[k++]);
    scaleTimer = setTimeout(tick, stepMs);
  };
  tick();
}
function stopScale() {
  if (scaleTimer) { clearTimeout(scaleTimer); scaleTimer = null; }
  release("scale");
}

// ---------- events ----------
const isTyping = el => el && (el.tagName === "INPUT" && el.type !== "range" && el.type !== "checkbox" || el.tagName === "SELECT" || el.tagName === "TEXTAREA");
addEventListener("keydown", e => {
  if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code === "Space") { e.preventDefault(); if (!e.repeat) setSustain(true); return; }
  if (e.code === "ArrowLeft" || e.code === "ArrowRight") { e.preventDefault(); if (!e.repeat) shift(e.code === "ArrowLeft" ? -1 : 1); return; }
  const j = CODES.indexOf(e.code); if (j < 0) return;
  e.preventDefault(); if (e.repeat) return;
  // Shift: a period (octave) higher. Only new presses are affected; held notes keep their pitch.
  const i = offset + j + (e.shiftKey ? state.n : 0);
  if (i >= total) { setMsg("Shift: нота выше последней клавиши — добавьте октаву.", true); return; }
  press("k" + e.code, i);
});
addEventListener("keyup", e => {
  if (e.code === "Space") { setSustain(false); return; }
  release("k" + e.code);
});
addEventListener("blur", () => { setSustain(false); stopAll(); });

const ptr = new Map();
const kb = $("kb");
kb.addEventListener("pointerdown", e => {
  const el = e.target.closest(".key"); if (!el) return;
  e.preventDefault();
  try { kb.setPointerCapture(e.pointerId); } catch (_) {}
  ptr.set(e.pointerId, +el.dataset.i); press("p" + e.pointerId, +el.dataset.i);
});
kb.addEventListener("pointermove", e => {
  if (!ptr.has(e.pointerId)) return;
  const el = document.elementFromPoint(e.clientX, e.clientY)?.closest(".key");
  if (el && +el.dataset.i !== ptr.get(e.pointerId)) { ptr.set(e.pointerId, +el.dataset.i); press("p" + e.pointerId, +el.dataset.i); }
});
const up = e => { if (ptr.delete(e.pointerId)) release("p" + e.pointerId); };
kb.addEventListener("pointerup", up); kb.addEventListener("pointercancel", up);

const bindNum = (id, key) => $(id).addEventListener("input", e => {
  const v = parseFloat(e.target.value); if (!isFinite(v)) return;
  state[key] = v; offset = 0; build();
});
bindNum("n", "n"); bindNum("base", "base"); bindNum("oct", "oct"); bindNum("ratio", "ratio");
// keep a typed value even if it got clamped, but re-show the clamped one on blur
["n","base","oct","ratio"].forEach(id => $(id).addEventListener("change", syncInputs));
$("wave").addEventListener("change", e => { state.wave = e.target.value; writeHash(); e.target.blur(); });
$("vol").addEventListener("input", e => { state.vol = +e.target.value; if (master) master.gain.value = state.vol; writeHash(); });
$("rel").addEventListener("input", e => { state.rel = +e.target.value; writeHash(); });
$("preset").addEventListener("change", e => {
  if (e.target.value) { const [n, r] = e.target.value.split(",").map(Number); state.n = n; state.ratio = r; offset = 0; build(); }
  e.target.blur();
});
document.querySelectorAll("[data-base]").forEach(b => b.addEventListener("click", () => {
  state.base = +b.dataset.base; build(); b.blur();
}));
$("scale").addEventListener("click", e => { playScale(); e.currentTarget.blur(); });
$("stop").addEventListener("click", e => { stopAll(); e.currentTarget.blur(); });
$("left").addEventListener("click", e => { shift(-1); e.currentTarget.blur(); });
$("right").addEventListener("click", e => { shift(1); e.currentTarget.blur(); });
$("sus").addEventListener("click", () => setSustain(!sustain));


// ================= notation: playback, recording, import / export =================
const songText = $("song");
let dirty = false;      // the editor was changed by hand since the last load
let playing = null;     // { bus, timers, marks }
let songKeyOffset = 0;  // keyboard index of song step 0
let rec = null;         // { t0, notes, open, metro }
let metroTimer = null;

const tempo = () => clamp(+$("tempo").value || 100, 10, 400);
const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
function setMsg(text, isErr) { const m = $("songmsg"); m.textContent = text; m.classList.toggle("err", !!isErr); }
function errText(errors) {
  if (!errors.length) return "";
  return "Ошибки: " + errors.slice(0, 4).join("; ") + (errors.length > 4 ? ` … и ещё ${errors.length - 4}` : "");
}

// Retune the keyboard to the song. Returns the frequency of song step 0.
function applySong(song) {
  const m = song.meta;
  if (m.n) state.n = m.n;
  if (m.ratio) state.ratio = m.ratio; else if (m.n) state.ratio = 2; // @edo without @ratio means an ordinary octave
  if (m.wave) state.wave = m.wave;
  if (m.tempo) $("tempo").value = m.tempo;
  const n = state.n, steps = song.events.flatMap(e => e.steps);
  const songBase = m.base || state.base;
  // With an explicit @base the keyboard may start lower to show notes below step 0.
  const lowP = m.base && steps.length ? Math.min(0, Math.floor(Math.min(...steps) / n)) : 0;
  state.base = songBase * Math.pow(state.ratio, lowP);
  songKeyOffset = -lowP * n;
  const maxIdx = steps.length ? Math.max(...steps) + songKeyOffset : 0;
  state.oct = clamp(Math.max(m.octaves || 1, Math.ceil(maxIdx / n)), 1, 10);
  offset = 0;
  build();
  return songBase;
}

function songMark(pl, idx, d) {
  if (playing !== pl) return;
  mark(idx, d);
  pl.marks.set(idx, (pl.marks.get(idx) || 0) + d);
}

function playSong() {
  stopAll();
  const song = EPN.parse(songText.value, state.n);
  if (!song.events.length) { setMsg(errText(song.errors) || "Нет нот для проигрывания.", true); return; }
  const songBase = applySong(song);
  ensureAudio();
  const spw = 240 / tempo(); // seconds per whole note
  const bus = ctx.createGain(); bus.connect(master);
  const pl = { bus, timers: [], marks: new Map() };
  const t0 = ctx.currentTime + 0.15;
  const later = (t, fn) => pl.timers.push(setTimeout(fn, Math.max(0, (t - ctx.currentTime) * 1000)));
  for (const e of song.events) {
    const start = t0 + e.t * spw, end = start + e.len * spw * 0.92;
    for (const s of e.steps) {
      const f = songBase * Math.pow(state.ratio, s / state.n);
      if (f < 15 || f > 20000) continue;
      releaseVoice(makeVoice(f, start, e.wave || state.wave, e.vel, bus), end);
      const idx = s + songKeyOffset;
      if (idx >= 0 && idx < total) {
        later(start, () => songMark(pl, idx, 1));
        later(end, () => songMark(pl, idx, -1));
      }
    }
  }
  const dur = song.length * spw;
  later(t0 + dur + 0.3, () => { if (playing === pl) { playing = null; updatePlayBtn(); } });
  playing = pl; updatePlayBtn();
  setMsg(`${song.meta.title || "Без названия"} · ${fmtTime(dur)}` + (song.errors.length ? ". " + errText(song.errors) : ""), song.errors.length > 0);
}

function stopSong() {
  if (!playing) return;
  const pl = playing; playing = null;
  pl.timers.forEach(clearTimeout);
  for (const [idx, c] of pl.marks) if (c > 0) mark(idx, -c);
  pl.bus.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
  setTimeout(() => pl.bus.disconnect(), 300);
  updatePlayBtn();
}
function updatePlayBtn() { $("play").textContent = playing ? "■ Стоп" : "▶ Играть"; }

// ---------- recording ----------
function click(t, strong) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.value = strong ? 1600 : 1100;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(strong ? 0.4 : 0.22, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  o.connect(g).connect(master); o.start(t); o.stop(t + 0.06);
}
function startMetronome(t0) {
  const beat = 60 / tempo();
  let k = 0;
  const tick = () => { while (t0 + k * beat < ctx.currentTime + 0.25) { click(t0 + k * beat, k % 4 === 0); k++; } };
  tick(); metroTimer = setInterval(tick, 60);
}
function stopMetronome() { clearInterval(metroTimer); metroTimer = null; }

function startRec() {
  if (rec) return;
  stopSong(); ensureAudio();
  const metro = $("metro").checked;
  // Note times come from performance.now(): the audio clock may stand still while audio is suspended.
  rec = { t0: performance.now() / 1000 + 0.1, notes: [], open: new Map(), metro };
  if (metro) startMetronome(ctx.currentTime + 0.1);
  updateRecUI();
}
function stopRec() {
  if (!rec) return;
  const r = rec; rec = null; stopMetronome();
  const now = performance.now() / 1000;
  r.notes.forEach(x => { if (x.off == null) x.off = now; });
  updateRecUI();
  if (!r.notes.length) { setMsg("Ничего не записано.", true); return; }
  const text = EPN.fromRecording(r.notes, {
    n: state.n, ratio: state.ratio, base: state.base, octaves: state.oct, wave: state.wave,
    tempo: tempo(), q: +$("quant").value, t0: r.metro ? r.t0 : null,
    title: "Запись " + new Date().toLocaleString("ru-RU"),
  });
  if (dirty && songText.value.trim() && !confirm("Заменить текст в редакторе записью?\n(Отмена — сразу сохранить запись в файл.)")) {
    download(text, fileName(text));
    return;
  }
  songText.value = text; dirty = false; updateSongHash();
  setMsg(`Записано нот: ${r.notes.length}. Текст в редакторе — можно поправить, проиграть или экспортировать.`);
}
function updateRecStatus() {
  $("recstatus").textContent = rec ? `● идёт запись · нот: ${rec.notes.length}` : "";
}
function updateRecUI() {
  $("recstart").disabled = !!rec; $("recstop").disabled = !rec;
  $("recstatus").classList.toggle("live", !!rec);
  updateRecStatus();
}

// ---------- files, links ----------
function fileName(text) {
  const m = text.match(/^@title[ \t]+(.+)$/m);
  const name = (m ? m[1] : "").replace(/[\\/:*?"<>|]+/g, "").trim().slice(0, 60);
  return (name || "melody") + ".epn";
}
function download(text, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const b64u = bytes => {
  let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
async function pack(text) {
  const bytes = new TextEncoder().encode(text);
  try {
    const z = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer());
    return "z" + b64u(z);
  } catch (e) { return "p" + b64u(bytes); }
}
async function unpack(s) {
  const bytes = unb64u(s.slice(1));
  if (s[0] === "z") return await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();
  return new TextDecoder().decode(bytes);
}
function setHashSong(key, value) {
  try {
    const p = new URLSearchParams(location.hash.slice(1));
    p.delete("s"); p.delete("src");
    if (key) p.set(key, value);
    history.replaceState(null, "", "#" + p.toString());
  } catch (e) {}
}
async function updateSongHash() {
  const t = songText.value;
  if (!t.trim()) setHashSong(null); else setHashSong("s", await pack(t));
}

// Put a song into the editor and retune the keyboard to it.
function loadText(text, label, opts = {}) {
  if (dirty && songText.value.trim() && songText.value !== text && !confirm("Заменить текст в редакторе?")) return false;
  stopAll();
  songText.value = text; dirty = false;
  const song = EPN.parse(text, state.n);
  if (song.events.length) applySong(song);
  if (opts.src) setHashSong("src", opts.src); else if (!opts.keepHash) updateSongHash();
  const title = song.meta.title || label || "Мелодия";
  setMsg(song.errors.length ? `${title}: ${errText(song.errors)}` : `${title} — нажмите ▶ Играть (или Ctrl+Enter в редакторе).`, song.errors.length > 0);
  return true;
}
async function fetchSong(url) {
  setMsg("Загружаю " + url + " …");
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error("HTTP " + r.status);
    loadText(await r.text(), url, { src: url });
  } catch (e) {
    setMsg(`Не удалось загрузить ${url}: ${e.message}. Сервер должен разрешать CORS; файл с локального диска откройте кнопкой «Открыть файл».`, true);
  }
}

// ---------- wiring ----------
const songTitle = t => (t.match(/^@title[ \t]+(.+)$/m) || [, "Без названия"])[1];
(() => {
  const sel = $("songlist");
  const std = document.createElement("optgroup"); std.label = "Обычные 12 полутонов";
  const odd = document.createElement("optgroup"); odd.label = "Нестандартные строи";
  SONGS.forEach((t, i) => {
    const o = new Option(songTitle(t), i);
    (/^@edo 12\s*$/m.test(t) && !/^@ratio/m.test(t) ? std : odd).appendChild(o);
  });
  sel.append(std, odd);
  sel.addEventListener("change", () => {
    if (sel.value !== "") loadText(SONGS[+sel.value]);
    sel.value = ""; sel.blur();
  });
})();

$("play").addEventListener("click", e => { if (playing) stopSong(); else playSong(); e.currentTarget.blur(); });
songText.addEventListener("keydown", e => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); playing ? stopSong() : playSong(); }
});
let hashTimer = null;
songText.addEventListener("input", () => { dirty = true; clearTimeout(hashTimer); hashTimer = setTimeout(updateSongHash, 700); });

$("recstart").addEventListener("click", e => { startRec(); e.currentTarget.blur(); });
$("recstop").addEventListener("click", e => { stopRec(); e.currentTarget.blur(); });
$("export").addEventListener("click", e => {
  e.currentTarget.blur();
  if (!songText.value.trim()) { setMsg("Редактор пуст — экспортировать нечего.", true); return; }
  download(songText.value, fileName(songText.value));
});
$("open").addEventListener("click", () => $("file").click());
$("file").addEventListener("change", async e => {
  const f = e.target.files[0]; e.target.value = "";
  if (f) loadText(await f.text(), f.name);
});
document.addEventListener("dragover", e => { if (e.dataTransfer?.types.includes("Files")) e.preventDefault(); });
document.addEventListener("drop", async e => {
  const f = e.dataTransfer?.files[0]; if (!f) return;
  e.preventDefault(); loadText(await f.text(), f.name);
});
$("loadurl").addEventListener("click", () => { const u = $("songurl").value.trim(); if (u) fetchSong(u); });
$("songurl").addEventListener("keydown", e => { if (e.key === "Enter") { const u = e.target.value.trim(); if (u) fetchSong(u); } });
$("link").addEventListener("click", async e => {
  e.currentTarget.blur();
  if (!new URLSearchParams(location.hash.slice(1)).has("src")) await updateSongHash();
  try { await navigator.clipboard.writeText(location.href); setMsg("Ссылка с мелодией и настройками скопирована."); }
  catch (_) { prompt("Скопируйте ссылку:", location.href); }
});
addEventListener("keydown", e => { if (e.code === "Escape") { stopAll(); stopRec(); } });

// ---------- start ----------
readHash();
build();
updateRecUI();
(async () => {
  const p = new URLSearchParams(location.hash.slice(1));
  if (p.has("s")) {
    try { loadText(await unpack(p.get("s")), "Мелодия из ссылки", { keepHash: true }); }
    catch (e) { setMsg("Не удалось прочитать мелодию из ссылки.", true); }
  } else if (p.has("src")) fetchSong(p.get("src"));
  else {
    songText.value = SONGS[0];
    setMsg("Выберите композицию из списка, напишите свою или запишите с клавиатуры.");
  }
})();
