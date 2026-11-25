"use strict";
// In-page tests, injected after app.js into a copy of index.html by tests/browser.js.
// Reports through console.log lines starting with "EPTEST"; the last one is "EPTEST DONE <failures>".
// Audio is rendered with an OfflineAudioContext, so no sound card is needed.
(async () => {
  let failures = 0;
  const report = (pass, name, detail = "") => {
    if (!pass) failures++;
    console.log(`EPTEST ${pass ? "ok  " : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
  };
  const check = async (name, fn) => {
    try { const r = await fn(); report(r === undefined || r === true, name, typeof r === "string" ? r : ""); }
    catch (e) { report(false, name, e && e.stack || String(e)); }
  };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const SR = 22050;

  // Make ensureAudio() build its graph on an OfflineAudioContext, so the real setup code is tested.
  const RealAC = window.AudioContext;
  function offlineAudio(seconds) {
    stopAll();
    const off = new OfflineAudioContext(1, Math.ceil(seconds * SR), SR);
    off.resume = () => Promise.resolve(); // not allowed before rendering starts
    window.AudioContext = function () { return off; };
    ctx = null;
    try { ensureAudio(); } finally { window.AudioContext = RealAC; }
    return off;
  }
  const stats = (buf, from = 0, to = buf.length) => {
    let peak = 0, sq = 0, bad = 0;
    for (let i = from; i < to; i++) {
      const x = buf[i];
      if (!Number.isFinite(x)) { bad++; continue; }
      peak = Math.max(peak, Math.abs(x)); sq += x * x;
    }
    return { peak, rms: Math.sqrt(sq / Math.max(1, to - from)), bad };
  };

  await sleep(300); // let the async start-up code run

  await check("no errors while loading the page", () =>
    window.__errors.length ? window.__errors.join("\n") : true);

  await check("keyboard is built", () => {
    const keys = document.querySelectorAll("#kb .key").length;
    return keys > 0 && keys === total || `${keys} keys, total = ${total}`;
  });

  await check("song list has every built-in song", () => {
    const n = document.querySelectorAll("#songlist optgroup option").length;
    return n === SONGS.length || `${n} options for ${SONGS.length} songs`;
  });

  for (let i = 0; i < SONGS.length; i++) {
    const title = songTitle(SONGS[i]);
    await check(`load song ${i} "${title}"`, () => {
      dirty = false;
      if (!loadText(SONGS[i])) return "loadText refused";
      if ($("songmsg").classList.contains("err")) return $("songmsg").textContent;
      const song = EPN.parse(SONGS[i], state.n);
      if (song.meta.n && state.n !== song.meta.n) return `keyboard has ${state.n} steps, song wants ${song.meta.n}`;
      return true;
    });

    await check(`render song ${i} "${title}"`, async () => {
      const song = EPN.parse(SONGS[i], state.n);
      const songBase = applySong(song);
      const spw = 240 / tempo();
      const seconds = Math.min(song.length * spw + 1, 8);
      const off = offlineAudio(seconds);
      const bus = off.createGain(); bus.connect(master);
      const pl = { bus, marks: new Map(), songBase, spw, session: null };
      let n = 0;
      for (const e of song.events) {
        const start = 0.05 + e.t * spw;
        if (start < seconds - 0.5) { playEvent(pl, e, start); n++; }
      }
      const buf = (await off.startRendering()).getChannelData(0);
      const s = stats(buf);
      if (!n) return "no notes in the first seconds";
      if (s.bad) return `${s.bad} non-finite samples`;
      if (s.rms < 0.005) return `nearly silent (rms ${s.rms.toFixed(4)})`;
      if (s.peak > 1) return `clipping (peak ${s.peak.toFixed(3)})`;
      return true;
    });
  }

  // A release scheduled ahead of time must fade from the envelope level at that moment.
  // Reading gain.value instead gave every note a second attack in Firefox.
  for (const w of ["piano", "organ", "sine", "square"]) {
    await check(`release scheduled ahead fades out smoothly (${w})`, async () => {
      const off = offlineAudio(2);
      const v = makeVoice(220, 0.1, w, 1, master);
      const relAt = 0.7;
      releaseVoice(v, relAt);
      const buf = (await off.startRendering()).getChannelData(0);
      const win = Math.round(0.02 * SR), at = Math.round(relAt * SR);
      const before = stats(buf, at - win, at).peak;
      let worst = 0;
      for (let i = at; i + win <= buf.length; i += win) worst = Math.max(worst, stats(buf, i, i + win).peak);
      const tail = stats(buf, buf.length - win).peak;
      if (before < 0.005) return `note is silent before release (${before.toFixed(4)})`;
      if (worst > before * 1.1) return `level jumps after release: ${before.toFixed(4)} -> ${worst.toFixed(4)}`;
      if (tail > before * 0.05) return `does not fade out (tail ${tail.toFixed(4)})`;
      return true;
    });
  }

  // envAt() must stay in sync with the envelope that makeVoice() schedules (see CLAUDE.md).
  // Feed a constant 1 instead of the oscillators into the voice's gain: the output is the envelope.
  for (const w of ["piano", "organ"]) {
    await check(`envAt() matches the envelope from makeVoice() (${w})`, async () => {
      const off = offlineAudio(2.5);
      const v = makeVoice(220, 0.1, w, 1, master);
      v.oscs.forEach(o => o.disconnect());
      v.g.disconnect(); v.g.connect(off.destination);
      const one = off.createConstantSource(); one.connect(v.g); one.start(0);
      const buf = (await off.startRendering()).getChannelData(0);
      const bad = [0.104, 0.2, 0.5, 1, 2.4].map(t => {
        const got = buf[Math.round(t * SR)], want = envAt(v.env, t);
        return Math.abs(got - want) > 0.01 * v.env.lvl ? `t=${t}: ${got.toFixed(5)} vs envAt ${want.toFixed(5)}` : null;
      }).filter(Boolean);
      return bad.length ? bad.join("; ") : true;
    });
  }

  await check("no errors during the tests", () =>
    window.__errors.length ? window.__errors.join("\n") : true);

  console.log(`EPTEST DONE ${failures}`);
})();
