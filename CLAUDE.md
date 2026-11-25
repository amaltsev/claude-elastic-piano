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

- `node --check` each script; parse all `SONGS` with `EPN.parse` (via `node:vm`) and check
  for errors and that `voiceLengths` match within each piece.
- Headless `google-chrome` / `firefox` are installed: inject a test script into a copy of
  `index.html` and read `console.log` output (Firefox needs
  `devtools.console.stdout.content=true` in a profile `user.js`). Audio can be verified with
  an `OfflineAudioContext` assigned to the global `ctx`/`master`.
