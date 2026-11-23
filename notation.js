"use strict";
// FPN — Flex Piano Notation. Format description: README.md.
// Classic script (not a module) so that index.html also works from file://.

const FPN = (() => {
  const WAVES = ["piano", "organ", "sine", "triangle", "sawtooth", "square"];
  const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  // "A4", "C#3", "Bb2" -> Hz (12-TET, A4 = 440)
  function noteHz(s) {
    const m = s.match(/^([A-Ga-g])([#♯b♭]?)(-?\d+)$/);
    if (!m) return NaN;
    const acc = m[2] === "#" || m[2] === "♯" ? 1 : m[2] ? -1 : 0;
    const midi = (+m[3] + 1) * 12 + PC[m[1].toUpperCase()] + acc;
    return 440 * Math.pow(2, (midi - 69) / 12);
  }
  // "2", "1.5", "3/1", "3:2"
  function number(s) {
    const m = s.match(/^(\d+(?:\.\d+)?)\s*[\/:]\s*(\d+(?:\.\d+)?)$/);
    if (m) return +m[1] / +m[2];
    return /^\d+(\.\d+)?$/.test(s) ? +s : NaN;
  }

  const PITCH = /^(-?\d+)([',]*)$/;
  const TOKEN = /^(\[[^\]]*\]|[rR]|-?\d+[',]*)(?:\/(\d+)(\.*))?(?:\*(\d+(?:\.\d+)?))?$/;

  // Returns { meta, events, errors, length }.
  //   meta:   { title, n, ratio, base, octaves, tempo, wave } — only what the text sets
  //   events: { t, len, steps: [absolute step], vel, wave, line }; t and len in whole notes
  function parse(text, fallbackN = 12) {
    const meta = {}, errors = [], raw = [];
    const defaults = { dur: 1 / 4, vel: 0.8, wave: null };
    const voices = new Map();
    let cur = null;
    const voice = id => {
      if (!voices.has(id)) voices.set(id, { t: 0, dur: defaults.dur, vel: defaults.vel, wave: defaults.wave });
      return voices.get(id);
    };
    const err = (ln, msg) => errors.push(`строка ${ln}: ${msg}`);

    text.split(/\r?\n/).forEach((src, idx) => {
      const ln = idx + 1;
      const line = src.replace(/(^|\s)#.*$/, "").trim();
      if (!line) return;

      if (line[0] === "@") {
        const m = line.match(/^@(\w+)\s*(.*)$/);
        if (!m) return err(ln, `непонятная директива «${line}»`);
        const key = m[1].toLowerCase(), val = m[2].trim();
        switch (key) {
          case "title": meta.title = val; break;
          case "edo": case "n": {
            const v = parseInt(val, 10);
            if (v >= 1 && v <= 120) meta.n = v; else err(ln, "@edo: целое от 1 до 120");
            break;
          }
          case "ratio": {
            const v = number(val);
            if (v > 1 && v <= 10) meta.ratio = v; else err(ln, "@ratio: число больше 1, например 2 или 3/1");
            break;
          }
          case "base": {
            const v = /^[A-Ga-g]/.test(val) ? noteHz(val) : number(val);
            if (v >= 10 && v <= 5000) meta.base = v; else err(ln, "@base: частота в Гц или нота вроде A4");
            break;
          }
          case "octaves": {
            const v = parseInt(val, 10);
            if (v >= 1 && v <= 10) meta.octaves = v; else err(ln, "@octaves: от 1 до 10");
            break;
          }
          case "tempo": {
            const v = number(val);
            if (v >= 10 && v <= 400) meta.tempo = v; else err(ln, "@tempo: от 10 до 400 четвертей в минуту");
            break;
          }
          case "wave": {
            if (!WAVES.includes(val)) { err(ln, `@wave: одно из ${WAVES.join(", ")}`); break; }
            if (cur) cur.wave = val; else { defaults.wave = val; meta.wave = val; }
            break;
          }
          case "vel": {
            const v = number(val);
            if (!(v >= 0 && v <= 1)) { err(ln, "@vel: от 0 до 1"); break; }
            if (cur) cur.vel = v; else defaults.vel = v;
            break;
          }
          case "voice": cur = voice(val || "1"); break;
          default: err(ln, `неизвестная директива @${key}`);
        }
        return;
      }

      if (!cur) cur = voice("1");
      const tokens = line.match(/\[[^\]]*\][^\s\[|]*|[^\s|\[]+/g) || [];
      for (const tok of tokens) {
        const m = tok.match(TOKEN);
        if (!m) { err(ln, `не понял «${tok}»`); continue; }
        let pitches = null;
        if (m[1][0] === "[") {
          pitches = m[1].slice(1, -1).trim().split(/\s+/).filter(Boolean);
          const bad = pitches.find(p => !PITCH.test(p));
          if (bad || !pitches.length) { err(ln, `в аккорде «${tok}» непонятная нота «${bad || ""}»`); continue; }
        } else if (m[1] !== "r" && m[1] !== "R") pitches = [m[1]];

        if (m[2] !== undefined) {
          const d = +m[2];
          if (!d) { err(ln, `длительность /0 в «${tok}»`); continue; }
          cur.dur = (1 / d) * (2 - Math.pow(0.5, m[3].length));
        }
        const len = cur.dur * (m[4] ? +m[4] : 1);
        if (pitches) raw.push({ t: cur.t, len, pitches, vel: cur.vel, wave: cur.wave, line: ln });
        cur.t += len;
      }
    });

    const n = meta.n || fallbackN;
    const events = raw.map(e => ({
      t: e.t, len: e.len, vel: e.vel, wave: e.wave, line: e.line,
      steps: e.pitches.map(p => {
        const m = p.match(PITCH);
        const up = (m[2].match(/'/g) || []).length, down = (m[2].match(/,/g) || []).length;
        return parseInt(m[1], 10) + (up - down) * n;
      }),
    })).sort((a, b) => a.t - b.t);
    const length = Math.max(0, ...[...voices.values()].map(v => v.t));
    const voiceLengths = Object.fromEntries([...voices].map(([id, v]) => [id, v.t]));
    return { meta, events, errors, length, voiceLengths };
  }

  // ---------- recording -> text ----------
  const fmtNum = x => String(+x.toFixed(4));

  function durStr(ticks, q) {
    for (let d = 1; d <= q; d *= 2)
      for (let dots = 0; dots <= 2; dots++)
        if (Math.abs((q / d) * (2 - Math.pow(0.5, dots)) - ticks) < 1e-9) return "/" + d + ".".repeat(dots);
    return `/${q}*${ticks}`;
  }
  function pitchStr(i, n) {
    const o = Math.floor(i / n), d = i - o * n;
    return d + (o > 0 ? "'".repeat(o) : ",".repeat(-o));
  }

  // notes: [{ i, on, off }] — key index and times in seconds.
  // opts: { n, ratio, base, octaves, wave, tempo, q, t0, title }
  //   q  — grid: 8, 16 or 32 (parts of a whole note)
  //   t0 — time of beat 1 (metronome start) or null to start from the first note
  function fromRecording(notes, opts) {
    const { n, q, tempo } = opts;
    const head = [
      `@title ${opts.title || "Запись"}`,
      `@edo ${n}`, `@ratio ${fmtNum(opts.ratio)}`, `@base ${fmtNum(opts.base)}`,
      `@octaves ${opts.octaves}`, `@wave ${opts.wave}`, `@tempo ${fmtNum(tempo)}`, "",
    ];
    if (!notes.length) return head.join("\n") + "# пусто: ни одной ноты не записано\n";

    const grid = (240 / tempo) / q; // seconds per tick
    const t0 = opts.t0 != null ? opts.t0 : Math.min(...notes.map(x => x.on));
    const tk = t => Math.round((t - t0) / grid);
    const qn = notes.map(x => ({ i: x.i, on: Math.max(0, tk(x.on)), off: tk(x.off) }));
    const lead = Math.floor(Math.min(...qn.map(x => x.on)) / q) * q; // drop whole silent bars
    qn.forEach(x => { x.on -= lead; x.off -= lead; });

    const byTick = new Map();
    for (const x of qn) {
      if (!byTick.has(x.on)) byTick.set(x.on, []);
      byTick.get(x.on).push(x);
    }
    const ticks = [...byTick.keys()].sort((a, b) => a - b);

    const out = [];
    let pos = 0, last = "", bars = 0;
    const emit = (pitch, len) => {
      if (pos > 0 && pos % q === 0) { bars++; out.push(bars % 4 === 0 ? "|\n" : "|"); }
      let d = durStr(len, q), shown = "";
      if (d.includes("*")) { shown = d; last = `/${q}`; }
      else if (d !== last) { shown = d; last = d; }
      out.push(pitch + shown);
      pos += len;
    };

    if (ticks[0] > 0) emit("r", ticks[0]);
    ticks.forEach((t, k) => {
      const group = byTick.get(t);
      const keys = [...new Set(group.map(x => x.i))].sort((a, b) => a - b);
      const next = k + 1 < ticks.length ? ticks[k + 1] : Infinity;
      let end = Math.max(...group.map(x => x.off));
      end = Math.min(Math.max(end, t + 1), next);
      const pitch = keys.length === 1 ? pitchStr(keys[0], n) : "[" + keys.map(i => pitchStr(i, n)).join(" ") + "]";
      emit(pitch, end - t);
      if (next !== Infinity && next > end) emit("r", next - end);
    });

    return head.join("\n") + out.join(" ").replace(/ ?\n ?/g, "\n") + "\n";
  }

  return { parse, fromRecording, noteHz, WAVES };
})();
