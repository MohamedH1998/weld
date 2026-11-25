// Opens Weld against a throwaway data folder in test mode, runs a file of steps, and saves pictures of it.
// usage: node scripts/shot.mjs <outDir> [steps.mjs]
//   WELD_EXEC=<path to Weld.app/Contents/MacOS/Weld>  run a packaged app (with the bare environment Finder gives one)
//   WELD_SEED=0                                       start from an empty board (default: a thread, a page, a terminal)
//   SHOT_TIMEOUT=<seconds>                            give up after this long (default 600)
// Exits non-zero if the steps throw, print a line starting "FAIL", or run out of time. The app is always closed.
import { _electron as electron } from "playwright-core";
import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const out = path.resolve(process.argv[2] || "shots");
mkdirSync(out, { recursive: true });
const data = path.join(out, "data");
// a fresh data folder every run, so nothing a run finds was left by the one before (made writable first: some of what
// Weld keeps is read-only)
// (links are never followed: what they point at is not the folder's to change)
const writable = (p) => {
  try {
    const st = lstatSync(p);
    if (st.isSymbolicLink()) return;
    chmodSync(p, st.isDirectory() ? 0o755 : 0o644);
    if (st.isDirectory()) for (const f of readdirSync(p)) writable(path.join(p, f));
  } catch {
    /* gone already */
  }
};
if (existsSync(data)) (writable(data), rmSync(data, { recursive: true, force: true }));
const exec = process.env.WELD_EXEC;
const test = { WELD_DATA: data, WELD_TEST: "1", WELD_SEED: process.env.WELD_SEED ?? "1" };
const limit = Number(process.env.SHOT_TIMEOUT || 600) * 1000;
let app = null;
// (the whole run, launching and closing included, has its time)
const timer = setTimeout(() => {
  console.log(`[shot] gave up after ${limit / 1000}s`);
  // closed if it will close; if not within a few seconds, the test app (and only it) is ended
  const proc = app?.process();
  setTimeout(() => {
    try {
      proc?.kill("SIGKILL");
    } catch {
      /* already gone */
    }
    process.exit(1);
  }, 5000);
  void Promise.resolve(app?.close()).finally(() => process.exit(1));
}, limit);
app = exec
  ? await electron.launch({ executablePath: exec, args: [], env: { HOME: process.env.HOME, USER: process.env.USER, SHELL: process.env.SHELL, PATH: "/usr/bin:/bin:/usr/sbin:/sbin", TMPDIR: process.env.TMPDIR, ...test } })
  : await electron.launch({ args: ["."], env: { ...process.env, ...test, WELD_DEV_URL: process.env.WELD_DEV_URL || "" } });

let failed = false;
const say = console.log;
// a step's own "FAIL …" line fails the run
console.log = (...a) => {
  if (/^FAIL\b/.test(String(a[0] ?? ""))) failed = true;
  say(...a);
};
const logs = [];
try {
  const page = await app.firstWindow();
  page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
  await page.waitForSelector("canvas");
  await page.waitForTimeout(1500);
  // taken by the window itself, so guest pages are in the picture too
  const shot = async (name) => {
    const b64 = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString("base64"));
    writeFileSync(path.join(out, `${name}.png`), Buffer.from(b64, "base64"));
  };
  try {
    if (process.argv[3]) {
      const steps = await import(pathToFileURL(path.resolve(process.argv[3])).href);
      await steps.default({ app, page, shot, out });
    } else await shot("first");
  } catch (e) {
    failed = true;
    logs.push(`[steps] ${e?.stack || e}`);
    await shot("failed").catch(() => {});
  }
} catch (e) {
  failed = true;
  logs.push(`[shot] ${e?.stack || e}`);
} finally {
  say(logs.slice(-40).join("\n"));
  await app.close().catch(() => {});
  clearTimeout(timer);
}
process.exit(failed ? 1 : 0);
