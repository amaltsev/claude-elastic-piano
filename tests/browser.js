"use strict";
// Runs tests/page-test.js inside the real page in headless Chrome and Firefox.
// Run: node tests/browser.js [chrome] [firefox]   (default: both)
// Browser binaries: $CHROME / $FIREFOX, otherwise the first one found on PATH.
const { spawn, execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.join(__dirname, "..");
const TIMEOUT = 90_000;

function which(names) {
  for (const n of names) {
    try { return execFileSync("sh", ["-c", `command -v "${n}"`], { encoding: "utf8" }).trim(); } catch (_) {}
  }
  return null;
}

// A copy of the page with an error catcher before the app scripts and the tests after them.
function makePage(dir) {
  for (const f of ["songs.js", "notation.js", "app.js"]) fs.copyFileSync(path.join(root, f), path.join(dir, f));
  fs.copyFileSync(path.join(__dirname, "page-test.js"), path.join(dir, "page-test.js"));
  const catcher = `<script>
window.__errors = [];
addEventListener("error", e => __errors.push("error: " + e.message + " @ " + (e.filename || "").split("/").pop() + ":" + e.lineno));
addEventListener("unhandledrejection", e => __errors.push("unhandled rejection: " + (e.reason && e.reason.stack || e.reason)));
</script>\n`;
  let html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const first = html.indexOf("<script src=");
  const end = html.lastIndexOf("</body>");
  if (first < 0 || end < 0) throw new Error("index.html: no <script src=…> or </body> found");
  html = html.slice(0, first) + catcher + html.slice(first, end) + `<script src="page-test.js"></script>\n` + html.slice(end);
  const file = path.join(dir, "index.html");
  fs.writeFileSync(file, html);
  return "file://" + file;
}

const BROWSERS = {
  chrome: {
    bin: () => process.env.CHROME || which(["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]),
    args: (url, dir) => [
      "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
      "--user-data-dir=" + path.join(dir, "chrome-profile"),
      "--allow-file-access-from-files", "--autoplay-policy=no-user-gesture-required",
      "--enable-logging=stderr", "--v=0",
      // Root in a container (GitHub's own runner doesn't need it).
      ...(process.getuid && process.getuid() === 0 ? ["--no-sandbox"] : []),
      url,
    ],
    // [123:456:INFO:CONSOLE(12)] "EPTEST ok   ...", source: file:///.../page-test.js (12)
    line: l => { const m = l.match(/CONSOLE.*?\] "(EPTEST[\s\S]*)", source:/); return m && m[1]; },
  },
  firefox: {
    bin: () => process.env.FIREFOX || which(["firefox", "firefox-esr"]),
    args: (url, dir) => {
      const prof = path.join(dir, "firefox-profile");
      fs.mkdirSync(prof, { recursive: true });
      fs.writeFileSync(path.join(prof, "user.js"), [
        'user_pref("devtools.console.stdout.content", true);',
        'user_pref("media.autoplay.default", 0);',
        'user_pref("browser.shell.checkDefaultBrowser", false);',
        'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
      ].join("\n"));
      return ["--headless", "--no-remote", "--profile", prof, url];
    },
    // console.log: "EPTEST ok   ..." (a JSON string literal), or unquoted in some versions
    line: l => {
      const m = l.match(/^console\.log: (".*"|EPTEST.*)$/);
      if (!m) return null;
      let s = m[1];
      if (s[0] === '"') try { s = JSON.parse(s); } catch (_) { s = s.slice(1, -1); }
      return s.startsWith("EPTEST") ? s : null;
    },
  },
};

function run(name) {
  const b = BROWSERS[name], bin = b.bin();
  if (!bin) { console.log(`FAIL ${name}: browser not found`); return Promise.resolve(false); }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "epiano-test-"));
  const url = makePage(dir);
  console.log(`\n== ${name} (${bin})`);
  return new Promise(resolve => {
    const p = spawn(bin, b.args(url, dir), { stdio: ["ignore", "pipe", "pipe"], detached: true });
    let done = false, buf = "", seen = 0;
    const finish = (pass, msg) => {
      if (done) return;
      done = true; clearTimeout(timer);
      if (msg) console.log(msg);
      try { process.kill(-p.pid, "SIGKILL"); } catch (_) {}
      setTimeout(() => { fs.rmSync(dir, { recursive: true, force: true }); resolve(pass); }, 300);
    };
    const onData = d => {
      buf += d;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const l = buf.slice(0, i); buf = buf.slice(i + 1);
        const msg = b.line(l);
        if (!msg) continue;
        seen++;
        const m = msg.match(/^EPTEST DONE (\d+)/);
        if (m) finish(+m[1] === 0, +m[1] ? `${name}: ${m[1]} failed` : `${name}: all passed`);
        else console.log(msg.replace(/^EPTEST /, "").replace(/\\n/g, "\n"));
      }
    };
    p.stdout.on("data", onData); p.stderr.on("data", onData);
    p.on("exit", code => finish(false, `FAIL ${name}: browser exited (code ${code}) before the tests finished` +
      (seen ? "" : " — no test output at all")));
    const timer = setTimeout(() => finish(false, `FAIL ${name}: timed out after ${TIMEOUT / 1000} s`), TIMEOUT);
  });
}

(async () => {
  const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(BROWSERS);
  let pass = true;
  for (const n of names) {
    if (!BROWSERS[n]) { console.log(`unknown browser "${n}"`); pass = false; continue; }
    pass = (await run(n)) && pass;
  }
  process.exit(pass ? 0 : 1);
})();
