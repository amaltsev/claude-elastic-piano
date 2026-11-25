# Elastic Piano

Static web app: a piano with the octave (or any period ratio) split into N equal steps,
plus a text notation (EPN) for playback, recording and export.
Live at https://amaltsev.github.io/claude-elastic-piano/ (GitHub Pages, served from `main`).

- No build, no dependencies. Plain classic `<script>`s, not ES modules, so `index.html`
  works from `file://`. Keep it that way.
- UI text and README are in Russian. README.md is also the EPN format spec — update it
  whenever the notation changes.
- Files: `app.js` (audio, keyboard, playback, recording, URL state), `notation.js`
  (EPN parser + recording-to-text), `songs.js` (built-in pieces as JS strings).

## Gotchas

- Firefox has no `AudioParam.cancelAndHoldAtTime`, and `gain.value` is useless for releases
  scheduled ahead of time. Release levels come from `envAt()` — keep it in sync with the
  envelope in `makeVoice()`.
- Keys are matched by `e.code` (layout-independent); Shift = one period higher.
- Recording measures presses against `audibleTime()` (audio clock minus output latency),
  since the player follows what they hear. A first take has no length yet (`L = Infinity`):
  use `passOffset()`, as `0 * Infinity` is `NaN`.
- Playback (plain, loop, loop recording) is one scheduler, `tickPlayback()`, that queues notes
  `LOOK` seconds ahead pass by pass; don't schedule whole songs up front again.

## Checking changes

- `node tests/check.js`: `node --check` on each script, and every song in `SONGS` parses
  without errors with equal `voiceLengths`.
- `node tests/browser.js [chrome] [firefox]`: loads a copy of `index.html` with
  `tests/page-test.js` injected into headless Chrome and Firefox and reads its `console.log`
  output. It checks page errors, loading every song, and the audio, rendered with an
  `OfflineAudioContext` that `ensureAudio()` is made to use: songs aren't silent or clipped,
  releases scheduled ahead don't jump, and `envAt()` matches `makeVoice()`. Add tests there.
- Both run on GitHub Actions (`.github/workflows/ci.yml`) on every push and PR.
