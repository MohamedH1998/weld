// A thread's session continued in its agent's own app: from the title bar's menu, "Continue in Claude Code" (and "Copy
// session id"). Weld lets go of its own run of it before the launcher can start one, holds what is said meanwhile, and
// takes it back when that run is plainly gone; the launcher works once, in the thread's folder, on that session, and not
// at all once taken back. A stand-in for Claude Code (test/fake/claude) and for the login shell keep this off real agents:
// (the stand-in takes a moment to wind up when let go, as a real one may)
//   FAKE_CLAUDE_SAVE_MS=1500 FAKE_CLAUDE_TERM_MS=1500 PATH="$PWD/test/fake:$PATH" SHELL="$PWD/test/fake/shell" node scripts/shot.mjs out/elsewhere test/elsewhere.mjs
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, ok, extra) => console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && extra !== undefined ? ` -> ${JSON.stringify(extra).slice(0, 300)}` : ""}`);

export default async ({ app, page, shot }) => {
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  for (let t = 0; t < 60 && !(await E(() => window.weld.envKnown?.() ?? true)); t++) await wait(200);
  const bin = await app.evaluate(() => { const fs = process.getBuiltinModule("node:fs"), p = process.getBuiltinModule("node:path"); for (const d of (process.env.PATH || "").split(":")) if (d && fs.existsSync(p.join(d, "claude"))) return p.join(d, "claude"); return null; });
  check("(the Claude this Weld runs is the stand-in)", !!bin && bin.endsWith("test/fake/claude"), bin);
  if (!bin?.endsWith("test/fake/claude")) return;
  const T = await E(() => Object.values(window.__editor.store.doc.shapes).find((s) => s.kind === "thread")?.id);
  const home = mkdtempSync(path.join(os.tmpdir(), "weld-elsewhere-"));
  await E(([T, home]) => window.weld.thread.set(T, { agent: "claude", mode: "full", cwd: home }), [T, home]);
  const get = () => E((T) => window.weld.thread.get(T), T);
  const oks = async () => (await get()).items.filter((i) => i.kind === "text" && /^ok \d/.test(i.text ?? "")).map((i) => i.text);
  // (Weld's own scripted runs of the stand-in, and runs of a session outside Weld, by what they were started with)
  const runs = (sid) => new Promise((done) => { const ps = spawn("/bin/ps", ["-U", String(process.getuid()), "-o", "command="]); let out = ""; ps.stdout.on("data", (d) => (out += d)); ps.on("close", () => { const l = out.split("\n").map((x) => x.trim()).filter((x) => /^(\S*node\S* )?\S*test\/fake\/claude(\s|$)/.test(x)); done({ weld: l.filter((x) => x.includes("stream-json")).length, outside: l.filter((x) => x.includes(sid) && !x.includes("stream-json")).length }); }); });
  await E((T) => window.weld.thread.send(T, { text: "first" }), T);
  for (let t = 0; t < 60 && (await oks()).length < 1; t++) await wait(250);
  const sid = (await get()).meta.sessions.claude, cwd = (await get()).meta.cwd;
  check("(asked once, it has a session, and Weld's run of it is going)", !!sid && (await oks()).join() === "ok 1" && (await runs(sid)).weld === 1, sid);
  await E((T) => { const st = window.__editor.store; st.select([T]); st.emit(); }, T);
  await wait(800);

  // the title bar's menu: copy the session id (the page's clipboard stood in for), and continue it in Claude Code
  await E(() => { window.__copied = []; Object.defineProperty(navigator, "clipboard", { value: { writeText: async (t) => void window.__copied.push(t) }, configurable: true }); });
  const btn = page.locator(`[data-live="${T}"] button[aria-label="Continue in Claude Code"]`);
  check("the title bar offers to continue it in Claude Code", (await btn.count()) === 1);
  await btn.click({ force: true });
  await wait(300);
  await page.locator(".thread-elsewhere button", { hasText: "Copy session id" }).click({ force: true });
  check("Copy session id copies it", (await E(() => window.__copied)).join() === sid);
  await shot?.("menu");
  await page.locator(".thread-elsewhere button", { hasText: "Continue in Claude Code" }).click({ force: true });
  for (let t = 0; t < 40 && !(await get()).meta.outside; t++) await wait(50);
  const half = await E((T) => window.weld.thread.takeBack(T), T);
  check("while Weld's own run is still winding up, it can't be taken back halfway", !!half.pending && !!(await get()).meta.outside, half);
  for (let t = 0; t < 60 && (await get()).meta.outside?.pending; t++) await wait(150);
  await wait(300);
  check("continued in Claude Code, the thread says so", !!(await get()).meta.outside && (await page.isVisible(`[data-live="${T}"] .thread-outside`)));
  check("…and Weld's own run of it has already ended", (await runs(sid)).weld === 0, await runs(sid));
  await shot?.("outside");
  // (taken back at once: the launcher the menu made is cancelled)
  check("taken back before anything ran there, it is Weld's again at once", !(await E((T) => window.weld.thread.takeBack(T), T)).live && !(await get()).meta.outside);

  // the launcher, as Terminal would run it: in the thread's folder, on that session; meanwhile what is said waits
  const r = await E((T) => window.weld.thread.handOut(T), T);
  check("(continued again, with its launcher)", !!r.script && existsSync(r.script), r);
  await E((T) => window.weld.thread.send(T, { text: "second" }), T);
  await wait(800);
  const held = await get();
  check("what is said meanwhile waits, and says it will go when it's back", held.meta.queue.length === 1 && (await oks()).length === 1 && /when it's back from Claude Code/.test(await E((T) => document.querySelector(`[data-live="${T}"]`)?.textContent ?? "", T)), held.meta.queue);
  const there = spawn("/bin/sh", [r.script], { stdio: ["pipe", "ignore", "ignore"] });
  await wait(2500);
  const sessFile = path.join(os.tmpdir(), `weld-fake-claude-${sid}.json.cwd`);
  const ranIn = existsSync(sessFile) ? readFileSync(sessFile, "utf8") : null;
  check("the launcher starts Claude Code on that session, in the thread's folder", (await runs(sid)).outside === 1 && !!ranIn && realpathSync(ranIn) === realpathSync(cwd), { runs: await runs(sid), ranIn, cwd });
  const again = spawn("/bin/sh", [r.script], { stdio: ["pipe", "ignore", "ignore"] });
  await wait(1500);
  check("…and runs once: run again, it starts nothing more", (await runs(sid)).outside === 1);
  again.kill("SIGKILL");
  check("while it runs there, taking it back asks to be sure", !!(await E((T) => window.weld.thread.takeBack(T), T)).live && !!(await get()).meta.outside);
  // (left running a while, as a person's session there is: Weld looks every few seconds)
  await wait(9000);
  check("(while it runs there, the thread stays out)", !!(await get()).meta.outside);
  there.kill("SIGTERM");
  let back = null;
  for (let t = 0; t < 80 && !back; t++) { const th = await get(); if (!th.meta.outside && (await oks()).length >= 2) back = th; else await wait(300); }
  check("closed there, Weld takes it back and sends what waited", !!back && (await oks()).join() === "ok 1,ok 2", { oks: await oks() });
  check("…and says it is back", !!back && back.items.some((i) => i.kind === "note" && /Back from Claude Code/.test(i.text ?? "")));

  // a launcher not yet run when the thread is taken back does nothing after
  const r2 = await E((T) => window.weld.thread.handOut(T), T);
  await E((T) => window.weld.thread.takeBack(T), T);
  const late = spawn("/bin/sh", [r2.script], { stdio: ["pipe", "ignore", "ignore"] });
  await wait(2000);
  check("a launcher run after the thread was taken back starts nothing", (await runs(sid)).outside === 0);
  late.kill("SIGKILL");

  // a thread branched while it is out is its own, not out
  await E((T) => window.weld.thread.handOut(T), T);
  const copy = await E(async (T) => (await window.weld.thread.fork(T, `fork${Date.now().toString(36)}`)).meta.outside ?? null, T);
  check("a thread branched from it while it is out is not out itself", copy === null, copy);
  await E((T) => window.weld.thread.takeBack(T, true), T);

  // a short visit: opened and closed before Weld has looked; the launcher says so, and Weld takes it back
  const r3 = await E((T) => window.weld.thread.handOut(T), T);
  spawn("/bin/sh", [r3.script], { stdio: ["ignore", "ignore", "ignore"] });
  const quick = await (async () => { for (let t = 0; t < 40; t++) { if (!(await get()).meta.outside) return true; await wait(250); } return false; })();
  check("a run there that ends at once is noticed, and it is Weld's again", quick);
  // its folder gone before Terminal could start it there: said, and Weld's again
  const r4 = await E((T) => window.weld.thread.handOut(T), T);
  rmSync(home, { recursive: true, force: true });
  spawn("/bin/sh", [r4.script], { stdio: ["ignore", "ignore", "ignore"] });
  let note = null;
  for (let t = 0; t < 40 && !note; t++) { const th = await get(); if (!th.meta.outside) note = th.items.filter((i) => i.kind === "note").at(-1)?.text ?? ""; else await wait(250); }
  check("a launcher that couldn't open the thread's folder says so, and it is Weld's again", /Couldn't open its folder/.test(note ?? ""), note);
};
