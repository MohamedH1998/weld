// Quitting ends the app, whatever is left going (a server a thread started, the window already closed), and even when
// a step of quitting throws or never ends. Run on its own (it quits the app itself, so it is not a shot.mjs step):
//   node test/quit.mjs
import { _electron as electron } from "playwright-core";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = false;
const check = (name, ok, extra) => (ok || (failed = true), console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && extra !== undefined ? ` -> ${JSON.stringify(extra).slice(0, 300)}` : ""}`));
const out = path.resolve("out/quit"), data = path.join(out, "data");
for (const how of ["as it is", "a step that throws", "a step that never ends"]) {
console.log(`— quitting, ${how}`);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const app = await electron.launch({ args: ["."], env: { ...process.env, WELD_DATA: data, WELD_TEST: "1", WELD_SEED: "1", WELD_DEV_URL: "" } });
const proc = app.process();
let exited = false;
proc.on("exit", () => (exited = true));
try {
  const page = await app.firstWindow();
  await page.waitForSelector("canvas");
  await wait(2000);
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const T = await E(() => Object.values(window.__editor.store.doc.shapes).find((s) => s.kind === "thread")?.id);
  const dir = path.join(data, "scratch", "quit");
  mkdirSync(dir, { recursive: true });
  await E(([T, dir]) => window.weld.thread.set(T, { mode: "full", cwd: dir }), [T, dir]);
  const door = await app.evaluate(({}, T) => ({ url: globalThis.__door.url, key: globalThis.__door.keyFor(T), bin: globalThis.__door.bin }), T);
  // a server the thread started, still going
  const said = execFileSync(path.join(door.bin, "weld"), ["run", "python3 -m http.server 0 --bind 127.0.0.1"], { cwd: dir, encoding: "utf8", env: { ...process.env, WELD_URL: door.url, WELD_TOKEN: door.key, WELD_FROM: T } });
  check("(a server is running for the thread)", /running|started|weld logs/i.test(said), said);
  await wait(1500);
  // the conversation closed off the board, as the person closes it
  // the window closed: the app stays for the server
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
  await wait(2000);
  check("(with the window closed, the app stays for its server)", !exited);
  if (how === "a step that throws") await app.evaluate(() => (globalThis.__breakQuit = true));
  if (how === "a step that never ends") await app.evaluate(() => (globalThis.__holdQuit = true));
  // then quit, as from the Dock
  const t0 = Date.now();
  await app.evaluate(({ app }) => app.quit()).catch(() => {});
  for (let t = 0; t < 110 && !exited; t++) await wait(500);
  check("quitting ends the app", exited, `${Math.round((Date.now() - t0) / 1000)} s and still running`);
  if (exited) console.log(`  ended in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
} finally {
  if (!exited) try { proc.kill("SIGKILL"); } catch {}
}
}
process.exit(failed ? 1 : 0);
