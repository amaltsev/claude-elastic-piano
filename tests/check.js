"use strict";
// Fast checks without a browser: script syntax and every built-in song.
// Run: node tests/check.js
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const scripts = ["songs.js", "notation.js", "app.js"];
let failed = 0;
const fail = msg => { failed++; console.log("FAIL " + msg); };
const ok = msg => console.log("ok   " + msg);

for (const f of scripts) {
  try { execFileSync(process.execPath, ["--check", path.join(root, f)], { stdio: "pipe" }); ok(`syntax ${f}`); }
  catch (e) { fail(`syntax ${f}\n${e.stderr}`); }
}

// Classic scripts share one global scope, like in the page.
const sandbox = vm.createContext({ console });
for (const f of ["songs.js", "notation.js"])
  vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), sandbox, { filename: f });
const { SONGS, EPN } = vm.runInContext("({ SONGS, EPN })", sandbox);

if (!Array.isArray(SONGS) || !SONGS.length) fail("SONGS is empty");
SONGS.forEach((text, i) => {
  const song = EPN.parse(text);
  const name = `song ${i} "${song.meta.title || "?"}"`;
  const problems = [];
  if (song.errors.length) problems.push(...song.errors);
  if (!song.events.length) problems.push("no notes");
  if (!song.meta.title) problems.push("no @title");
  const lens = Object.entries(song.voiceLengths);
  if (new Set(lens.map(([, t]) => +t.toFixed(6))).size > 1)
    problems.push("voice lengths differ: " + lens.map(([id, t]) => `${id}=${+t.toFixed(4)}`).join(", "));
  for (const e of song.events)
    if (!(e.t >= 0 && e.len > 0 && e.steps.every(Number.isFinite))) { problems.push(`bad event at t=${e.t}`); break; }
  if (problems.length) fail(`${name}:\n  ${problems.join("\n  ")}`); else ok(name);
});

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
