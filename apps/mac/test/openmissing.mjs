// `weld open` on a file that isn't there says so, instead of putting a "not found" page on the board; a file that is
// there, and a web address, still open.
//   node scripts/shot.mjs out/openmissing test/openmissing.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, ok, extra) => console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && extra !== undefined ? ` -> ${JSON.stringify(extra).slice(0, 300)}` : ""}`);

export default async ({ app, page, out }) => {
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  await wait(2000);
  const T = await E(() => Object.values(window.__editor.store.doc.shapes).find((s) => s.kind === "thread")?.id);
  const dir = path.join(out, "data", "scratch", "openmissing");
  mkdirSync(path.join(dir, "screens"), { recursive: true });
  writeFileSync(path.join(dir, "screens", "index.html"), "<!doctype html><title>Acme</title><h1>Acme</h1>");
  await E(([T, dir]) => window.weld.thread.set(T, { mode: "full", cwd: dir }), [T, dir]);
  const door = await app.evaluate(({}, T) => ({ url: globalThis.__door.url, key: globalThis.__door.keyFor(T), bin: globalThis.__door.bin }), T);
  const weld = (args) => { try { return execFileSync(path.join(door.bin, "weld"), args, { cwd: dir, encoding: "utf8", env: { ...process.env, WELD_URL: door.url, WELD_TOKEN: door.key, WELD_FROM: T } }); } catch (e) { return `(failed) ${e.stdout ?? ""}${e.stderr ?? ""}`; } };
  const pages = () => E((T) => Object.values(window.__editor.store.doc.shapes).filter((s) => s.kind === "browser" && s.live?.by === T).length, T);
  const n0 = await pages();
  // the shell is in the folder above the file, as the agent's was
  const r1 = weld(["open", `file://${dir}/index.html#register`]);
  check("a file:// address with nothing there is refused, and says where it looked", /failed/.test(r1) && /there is no file at .*index\.html/.test(r1), r1);
  const r2 = weld(["open", "index.html"]);
  check("a bare file name with nothing there is refused", /failed/.test(r2) && /there is no file/.test(r2), r2);
  const r3 = weld(["open", "./designs/register.html"]);
  check("a relative path with nothing there is refused", /failed/.test(r3) && /there is no file/.test(r3), r3);
  await wait(800);
  check("nothing was put on the board for them", (await pages()) === n0, await pages());
  const r4 = weld(["open", `file://${dir}/screens/index.html#register`]);
  check("a file that is there opens", /^opened weld-local:\/\/.+\/index\.html#register/.test(r4), r4);
  const r5 = weld(["open", "screens/index.html"]);
  check("a relative path that is there opens", /^opened weld-local:/.test(r5), r5);
  const r6 = weld(["open", "acme.test"]);
  check("a web address still opens", /^opened https:\/\/acme\.test/.test(r6), r6);
};
