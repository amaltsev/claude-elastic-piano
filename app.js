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
  if (src[0] !== "k" && src[0] !== "p") return; // only the player's keys are recorded
  if (playing?.session) sessionPress(src, i);
}
function release(src) {
  const v = voices.get(src); if (!v) return;
  voices.delete(src); mark(v.i, -1);
  if (playing?.session) sessionRelease(src);
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
  if (e.code === "Backspace" && playing?.session && !playing.session.take) { e.preventDefault(); if (!e.repeat) undoPass(); return; }
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
let playing = null;     // see startPlayback()
let songKeyOffset = 0;  // keyboard index of song step 0
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

// ---------- playback engine: plain playback, loops and loop recording ----------
// Notes are scheduled a little ahead (LOOK seconds) from a timer, pass by pass, so that a
// loop can run forever and voices can be muted or added while it plays.
const LOOK = 0.3;
const muted = new Set(); // voice ids silenced in playback; not saved anywhere

// AudioContext time of the sound that is reaching the speakers right now. The player reacts
// to what they hear, so loop recording measures key presses against this, not currentTime.
function audibleTime() {
  try {
    const ts = ctx.getOutputTimestamp && ctx.getOutputTimestamp();
    if (ts && ts.performanceTime > 0) {
      const t = ts.contextTime + (performance.now() - ts.performanceTime) / 1000;
      if (isFinite(t)) return Math.min(t, ctx.currentTime);
    }
  } catch (_) {}
  return ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0);
}

// song: parsed EPN; L: loop/pass length in whole notes; session: loop recording state or null
function startPlayback({ song, songBase, events, L, loop, session = null, leadIn = 0 }) {
  ensureAudio();
  const spw = 240 / tempo(); // seconds per whole note
  const bus = ctx.createGain(); bus.connect(master);
  const pl = {
    bus, marks: new Map(), events, songBase, session, loop, spw,
    L, Lsec: L * spw, t0: ctx.currentTime + 0.15 + leadIn, leadIn,
    j: 0, from: 0, // next pass to schedule and position in it (whole notes)
  };
  playing = pl;
  pl.timer = setInterval(() => tickPlayback(pl), 25);
  tickPlayback(pl);
  updatePlayBtn(); drawLoopBar(pl); requestAnimationFrame(progress);
  return pl;
}
// Start of pass j relative to t0. A first take has an endless pass, and 0 * Infinity is NaN.
const passOffset = (pl, j) => j ? j * pl.Lsec : 0;
const looping = pl => pl.session ? !pl.session.take : $("loop").checked;

function passEvents(pl, j) {
  const out = pl.events.filter(e => !muted.has(e.voice));
  const s = pl.session;
  if (s) for (const ly of s.layers) {
    if (ly.from > j || muted.has(ly.id)) continue;
    for (const x of ly.notes)
      out.push({ t: x.on / s.q, len: ((x.off ?? s.Ltk) - x.on) / s.q, steps: [x.step], vel: 0.8, wave: null, voice: ly.id });
  }
  return out;
}

function playEvent(pl, e, start) {
  const end = start + e.len * pl.spw * 0.92;
  for (const s of e.steps) {
    const f = pl.songBase * Math.pow(state.ratio, s / state.n);
    if (f < 15 || f > 20000) continue;
    releaseVoice(makeVoice(f, start, e.wave || state.wave, e.vel, pl.bus), end);
    if (pl.session) continue; // while recording only the player's own keys light up
    const idx = s + songKeyOffset;
    if (idx >= 0 && idx < total) {
      setTimeout(() => songMark(pl, idx, 1), Math.max(0, (start - ctx.currentTime) * 1000));
      setTimeout(() => songMark(pl, idx, -1), Math.max(0, (end - ctx.currentTime) * 1000));
    }
  }
}

function tickPlayback(pl) {
  if (playing !== pl) return;
  if (pl.session) sessionTick(pl);
  if (playing !== pl) return;
  const horizon = ctx.currentTime + LOOK;
  for (;;) {
    if (pl.j > 0 && pl.from === 0 && !looping(pl)) break; // finish the pass, don't start another
    const ps = pl.t0 + passOffset(pl, pl.j);
    const to = Math.min(pl.L, (horizon - ps) / pl.spw);
    if (to <= pl.from) break;
    for (const e of passEvents(pl, pl.j)) if (e.t >= pl.from && e.t < to) playEvent(pl, e, ps + e.t * pl.spw);
    if (to < pl.L) { pl.from = to; break; }
    pl.j++; pl.from = 0;
  }
  // Not looping (any more): finish once the last scheduled pass has played out.
  // (A recording is stopped by sessionTick instead, so that the take gets written.)
  if (!pl.session && !looping(pl) && pl.j > 0 && pl.from === 0 && ctx.currentTime > pl.t0 + passOffset(pl, pl.j) + 0.3) {
    clearInterval(pl.timer); playing = null; updatePlayBtn();
  }
}

function playSong() {
  stopAll();
  const song = EPN.parse(songText.value, state.n);
  if (!song.events.length) { setMsg(errText(song.errors) || "Нет нот для проигрывания.", true); return; }
  const songBase = applySong(song);
  startPlayback({ song, songBase, events: song.events, L: song.length });
  const dur = song.length * playing.spw;
  setMsg(`${song.meta.title || "Без названия"} · ${fmtTime(dur)}` + ($("loop").checked ? " · по кругу" : "") +
    (song.errors.length ? ". " + errText(song.errors) : ""), song.errors.length > 0);
}

function stopSong() {
  if (!playing) return;
  const pl = playing;
  if (pl.session) endSession(pl);
  playing = null;
  clearInterval(pl.timer);
  for (const [idx, c] of pl.marks) if (c > 0) mark(idx, -c);
  pl.bus.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
  setTimeout(() => pl.bus.disconnect(), 300);
  updatePlayBtn(); updateRecUI();
}
function updatePlayBtn() { $("play").textContent = playing ? "■ Стоп" : "▶ Играть"; }

// Thin bar above the keyboard: position in the pass (or the count-in), with bar lines.
function drawLoopBar(pl) {
  const bar = $("loopbar");
  bar.querySelectorAll("i").forEach(x => x.remove());
  if (!isFinite(pl.L)) { bar.hidden = true; return; } // first voice: no length yet
  if (pl.L <= 64) for (let k = 1; k < pl.L - 1e-9; k++) {
    const i = document.createElement("i"); i.style.left = (k / pl.L * 100) + "%"; bar.appendChild(i);
  }
  bar.classList.toggle("rec", !!pl.session);
  bar.hidden = false;
}
function progress() {
  const pl = playing, bar = $("loopbar"), fill = $("loopfill");
  if (!pl) { bar.hidden = true; return; }
  const pos = audibleTime() - pl.t0;
  bar.classList.toggle("count", pos < 0);
  let x;
  if (pos < 0) x = pl.leadIn ? 1 + pos / pl.leadIn : 0;
  else x = looping(pl) || pos < pl.Lsec ? (pos % pl.Lsec) / pl.Lsec : 1;
  fill.style.width = (clamp(x, 0, 1) * 100) + "%";
  requestAnimationFrame(progress);
}

// ---------- metronome ----------
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

// ---------- recording ----------
// One recording = one voice: target "+new" adds a voice, "v:ID" re-records voice ID (it is silent
// meanwhile). Without "по кругу" (a take) the piece plays once and recording stops at its end;
// with an empty editor it runs until stopped. With "по кругу" (looper) the piece repeats: in
// "+new" every pass with key presses becomes a new voice heard from the next pass on; in "v:ID"
// a pass with presses replaces the voice and a silent pass keeps it.
function startRec() {
  if (playing?.session) return;
  const target = $("rectarget").value, loop = $("loop").checked;
  stopAll();
  const song = EPN.parse(songText.value, state.n);
  const mode = target === "+new" ? "new" : "voice", id = mode === "voice" ? target.slice(2) : null;
  if (mode === "voice" && !(id in song.voiceLengths)) { setMsg(`В тексте нет голоса «${id}».`, true); refreshVoices(); return; }
  let songBase = state.base;
  if (songText.value.trim()) songBase = applySong(song); else songKeyOffset = 0;
  const empty = !(song.length > 1e-9);
  const L = !empty ? song.length : loop ? clamp(Math.round(+$("loopbars").value) || 4, 1, 64) : Infinity;
  const q = +$("quant").value, spw = 240 / tempo();
  const leadIn = $("metro").checked ? spw : 0; // one bar of 4/4
  const session = {
    take: !loop, metro: leadIn > 0, mode, id, q, Ltk: L * q, grid: spw / q,
    // tuning as it was at the start: changing it stops the recording, and the last pass
    // must still be written in the old one
    hdr: { n: state.n, ratio: state.ratio, base: state.base, octaves: state.oct, wave: state.wave, tempo: tempo() },
    passes: new Map(), open: new Map(), layers: [], undo: [], cur: 0, added: 0, replaced: 0,
  };
  const events = mode === "voice" ? song.events.filter(e => e.voice !== id) : song.events;
  const pl = startPlayback({ song, songBase, events, L, session, leadIn });
  if (leadIn) startMetronome(pl.t0 - leadIn);
  updateRecUI();
  const what = mode === "new" ? "Запись нового голоса" : `Голос «${id}» заглушён и записывается заново`;
  if (!loop) setMsg(empty ? "Запись первого голоса: играйте сколько нужно. «■ Закончить запись» или Esc — остановить." :
    what + ": пьеса проиграет один раз, и запись остановится сама. «■ Закончить запись» или Esc — раньше.");
  else setMsg((mode === "new" ? "Каждый круг, в котором вы играли, станет новым голосом." :
    `Голос «${id}» заглушён; круг, в котором вы играли, заменит его, тихий круг оставит как было.`) +
    " Backspace — отменить последний круг. «■ Закончить запись» или Esc — остановить.");
}
function stopRec() { if (playing?.session) stopSong(); }

function sessionPress(src, i) {
  const pl = playing, s = pl.session;
  const pos = audibleTime() - pl.t0;
  // A note up to half a grid step early belongs to the next pass (playing "on the one").
  if (pos < -s.grid / 2) return; // count-in
  const j = Math.floor((pos + s.grid / 2) / pl.Lsec);
  if (j < s.cur) return;
  if (!s.passes.has(j)) s.passes.set(j, { notes: [], layer: null });
  const p = s.passes.get(j);
  const note = { step: i - songKeyOffset, j, on: Math.max(0, Math.round((pos - passOffset(pl, j)) / s.grid)), off: null };
  p.notes.push(note); s.open.set(src, note);
  if (!s.take && s.mode === "new" && !p.layer) { p.layer = { id: null, from: j + 1, notes: p.notes }; s.layers.push(p.layer); }
}
function sessionRelease(src) {
  const pl = playing, s = pl.session, note = s.open.get(src);
  if (!note) return;
  s.open.delete(src);
  if (note.off != null) return; // its pass is already closed
  const x = Math.round((audibleTime() - pl.t0 - passOffset(pl, note.j)) / s.grid);
  note.off = Math.min(s.Ltk, Math.max(note.on + 1, x));
}

function sessionTick(pl) {
  const s = pl.session, now = audibleTime();
  if (s.take) { if (now >= pl.t0 + pl.Lsec) { stopSong(); return; } } // the piece has played once
  else while (now >= pl.t0 + (s.cur + 1) * pl.Lsec) closePass(pl, s.cur++);
  updateRecStatus();
}

function nextVoiceId(text, n) {
  const ids = new Set(Object.keys(EPN.parse(text, n).voiceLengths));
  let k = 1; while (ids.has(String(k))) k++;
  return String(k);
}
// notes: [{ i: step, on, off }] in ticks; returns the id of the voice written.
function writeVoice(s, notes, total) {
  const body = EPN.ticksToText(notes, s.hdr.n, s.q, total);
  let text = songText.value, id = s.id;
  if (s.mode === "voice") text = EPN.replaceVoice(text, id, body);
  else {
    if (!text.trim()) text = EPN.header({ ...s.hdr, title: "Запись " + new Date().toLocaleString("ru-RU") });
    id = nextVoiceId(text, s.hdr.n);
    text = EPN.appendVoice(text, id, body);
  }
  setRecordedText(text);
  return id;
}
function closePass(pl, j) {
  const s = pl.session, p = s.passes.get(j);
  s.passes.delete(j);
  if (!p || !p.notes.length) return; // nothing played: keep what is there
  for (const x of p.notes) if (x.off == null) x.off = s.Ltk; // still held: cut at the loop end
  s.undo.push({ text: songText.value, layer: p.layer });
  const id = writeVoice(s, p.notes.map(x => ({ i: x.step, on: x.on, off: x.off })), s.Ltk);
  if (p.layer) { p.layer.id = id; s.added++; } else s.replaced++;
}
// End of a take (stopped by hand or at the end of the piece): whatever was played is kept.
function closeTake(pl) {
  const s = pl.session, p = s.passes.get(0);
  if (!p || !p.notes.length) return "Ничего не сыграно — голоса не изменились.";
  const now = Math.round((audibleTime() - pl.t0) / s.grid);
  const notes = p.notes.map(x => ({ i: x.step, on: x.on, off: Math.min(s.Ltk, x.off ?? Math.max(x.on + 1, now)) }));
  let total = s.Ltk;
  if (!isFinite(total)) { // first voice: as long as the take, in whole bars
    const first = Math.min(...notes.map(x => x.on));
    const lead = s.metro ? Math.floor(first / s.q) * s.q : first; // no metronome: start at the first note
    notes.forEach(x => { x.on -= lead; x.off -= lead; });
    total = Math.max(1, Math.ceil(Math.max(...notes.map(x => x.off)) / s.q)) * s.q;
  }
  const id = writeVoice(s, notes, total);
  preferTarget = "v:" + id;
  return `Голос «${id}» записан. ▶ Играть — послушать всё вместе; «● Начать запись» ещё раз — переписать этот голос; ` +
    "чтобы добавить следующий, выберите «новый голос».";
}
function undoPass() {
  const s = playing.session, u = s.undo.pop();
  if (!u) { setMsg("Отменять нечего.", true); return; }
  if (u.layer) { s.layers = s.layers.filter(l => l !== u.layer); s.added--; } else s.replaced--;
  setRecordedText(u.text);
  setMsg(u.layer ? `Голос «${u.layer.id}» убран.` : `Голос «${s.id}» возвращён к предыдущему варианту.`);
}
function setRecordedText(text) {
  songText.value = text; dirty = true; // not saved anywhere yet: ask before replacing it
  updateSongHash(); refreshVoices();
}

// Stopping a looper: an unfinished pass is kept only if it was stopped within its last beat.
function endSession(pl) {
  const s = pl.session;
  stopMetronome();
  let msg;
  if (s.take) msg = closeTake(pl);
  else {
    const p = s.passes.get(s.cur);
    let lost = false;
    if (p && p.notes.length) {
      const pos = audibleTime() - pl.t0 - s.cur * pl.Lsec;
      if (pos >= pl.Lsec - pl.spw / 4) closePass(pl, s.cur); else lost = true;
    }
    msg = (s.mode === "new" ? `Добавлено голосов: ${s.added}.` :
      s.replaced ? `Голос «${s.id}» записан заново.` : `Голос «${s.id}» не изменился.`) +
      (lost ? " Незаконченный круг не сохранён." : "") + " Нажмите ▶ Играть, чтобы послушать всё вместе.";
  }
  pl.session = null; // the rest of the teardown is plain playback
  setMsg(msg);
}

function updateRecStatus() {
  const s = playing?.session, el = $("recstatus");
  if (!s) { el.textContent = ""; return; }
  const pos = audibleTime() - playing.t0;
  const who = s.mode === "new" ? "новый голос" : `голос «${s.id}»`;
  el.textContent = pos < 0 ? "● отсчёт…" : s.take
    ? `● запись · ${who} · ${fmtTime(pos)}` + (isFinite(playing.Lsec) ? ` из ${fmtTime(playing.Lsec)}` : "")
    : `● запись по кругу · круг ${s.cur + 1} · ` + (s.mode === "new" ? `новых голосов: ${s.added}` : who);
}
function updateRecUI() {
  const on = !!playing?.session;
  $("recstart").disabled = on; $("recstop").disabled = !on;
  for (const id of ["rectarget", "loopbars", "quant", "tempo", "loop"]) $(id).disabled = on;
  songText.readOnly = on;
  $("recstatus").classList.toggle("live", on);
  updateRecStatus(); refreshVoices();
}

// Voice chips (click = mute) and the list of recording targets, from the editor text.
let preferTarget = null; // select this target on the next refresh (the voice just recorded)
function refreshVoices() {
  const song = EPN.parse(songText.value, state.n);
  const ids = Object.keys(song.voiceLengths);
  const recId = playing?.session?.id;
  const box = $("voices");
  box.innerHTML = "";
  for (const id of ids) {
    const b = document.createElement("button");
    b.className = "pill vchip" + (muted.has(id) ? " off" : "") + (id === recId ? " rec" : "");
    b.textContent = id; b.dataset.id = id;
    b.title = muted.has(id) ? "Заглушён — щёлкните, чтобы включить" : "Щёлкните, чтобы заглушить";
    box.appendChild(b);
  }
  $("voicebar").hidden = !ids.length;
  const sel = $("rectarget"), want = preferTarget || sel.value;
  preferTarget = null;
  sel.innerHTML = "";
  sel.append(new Option("новый голос", "+new"));
  for (const id of ids) sel.append(new Option(`голос «${id}» заново`, "v:" + id));
  sel.value = [...sel.options].some(o => o.value === want) ? want : "+new";
  $("loopbarslabel").hidden = !$("loop").checked || sel.value !== "+new" || song.length > 1e-9;
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
  refreshVoices();
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
  sel.append(new Option("Чистый лист", "+blank"), std, odd);
  sel.addEventListener("change", () => {
    if (sel.value === "+blank") {
      if (loadText("")) {
        muted.clear(); refreshVoices();
        setMsg("Чистый лист: запишите первый голос («● Начать запись») или напишите ноты. Строй пианино остался прежним.");
      }
    } else if (sel.value !== "") loadText(SONGS[+sel.value]);
    sel.value = ""; sel.blur();
  });
})();

$("play").addEventListener("click", e => { if (playing) stopSong(); else playSong(); e.currentTarget.blur(); });
songText.addEventListener("keydown", e => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); playing ? stopSong() : playSong(); }
});
let hashTimer = null;
songText.addEventListener("input", () => { dirty = true; refreshVoices(); clearTimeout(hashTimer); hashTimer = setTimeout(updateSongHash, 700); });

$("recstart").addEventListener("click", e => { startRec(); e.currentTarget.blur(); });
$("loop").addEventListener("change", e => { refreshVoices(); e.target.blur(); });
$("rectarget").addEventListener("change", e => { refreshVoices(); e.target.blur(); });
$("voices").addEventListener("click", e => {
  const b = e.target.closest(".vchip"); if (!b) return;
  const id = b.dataset.id;
  if (muted.has(id)) muted.delete(id); else muted.add(id);
  refreshVoices();
});
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
    songText.value = SONGS[0]; refreshVoices();
    setMsg("Выберите композицию из списка, напишите свою или запишите с клавиатуры.");
  }
})();
