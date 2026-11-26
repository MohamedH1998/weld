// A thread's session continued in its agent's own app: from the title bar, "Continue in Claude Code" opens it in
// Terminal (not in a check) and Weld lets go of its own run of it; what is said meanwhile waits; when that app lets go of
// the session, Weld takes it back and sends what waited. "Copy session id" and "Take it back" do what they say.
// A stand-in for Claude Code (test/fake/claude) and for the login shell keep this off any real agent:
//   PATH="$PWD/test/fake:$PATH" SHELL="$PWD/test/fake/shell" node scripts/shot.mjs out/elsewhere test/elsewhere.mjs
import { spawn } from "node:child_process";
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
  await E((T) => window.weld.thread.set(T, { agent: "claude", mode: "full" }), T);
  const get = () => E((T) => window.weld.thread.get(T), T);
  const oks = async () => (await get()).items.filter((i) => i.kind === "text" && /^ok \d/.test(i.text ?? "")).map((i) => i.text);
  await E((T) => window.weld.thread.send(T, { text: "first" }), T);
  for (let t = 0; t < 60 && (await oks()).length < 1; t++) await wait(250);
  const sid = (await get()).meta.sessions.claude;
  check("(asked once, it has a session)", !!sid && (await oks()).join() === "ok 1", sid);
  await E((T) => { const st = window.__editor.store; st.select([T]); st.emit(); }, T);
  await wait(800);

  // copy session id, from the title bar's menu (the page's clipboard stood in for)
  await E(() => { window.__copied = []; Object.defineProperty(navigator, "clipboard", { value: { writeText: async (t) => void window.__copied.push(t) }, configurable: true }); });
  const btn = page.locator(`[data-live="${T}"] button[aria-label="Continue in Claude Code"]`);
  check("the title bar offers to continue it in Claude Code", (await btn.count()) === 1);
  await btn.click({ force: true });
  await wait(300);
  // (the card is redrawn with the board each frame: the press is made once the menu has settled)
  await page.locator(".thread-elsewhere button", { hasText: "Copy session id" }).click({ force: true });
  check("Copy session id copies it", (await E(() => window.__copied)).join() === sid);
  await shot?.("menu");

  // continued there: Weld lets go of its own run, says so, and holds what is said here
  await page.locator(".thread-elsewhere button", { hasText: "Continue in Claude Code" }).click({ force: true });
  await wait(600);
  const out1 = await get();
  check("continued in Claude Code, the thread says so", !!out1.meta.outside && (await page.isVisible(`[data-live="${T}"] .thread-outside`)), out1.meta.outside);
  await shot?.("outside");
  const weldsOwn = () => app.evaluate((_, sid) => new Promise((done) => process.getBuiltinModule("node:child_process").execFile("/bin/ps", ["-axo", "command="], (e, out) => done(String(out).split("\n").filter((l) => l.includes("stream-json") && l.includes("test/fake/claude")).length))), sid);
  await wait(2500);
  check("…and Weld's own run of it is let go", (await weldsOwn()) === 0);
  await E((T) => window.weld.thread.send(T, { text: "second" }), T);
  await wait(1000);
  const held = await get();
  check("what is said meanwhile waits", held.meta.queue.length === 1 && (await oks()).length === 1, { queue: held.meta.queue.length, oks: await oks() });

  // the person's own run of it there (as Terminal would have it), then closed: Weld takes it back and sends what waited
  const there = spawn(bin, ["--resume", sid], { stdio: ["pipe", "ignore", "ignore"] });
  await wait(6000);
  check("(while it runs there, the thread stays out)", !!(await get()).meta.outside);
  there.kill("SIGTERM");
  let back = null;
  for (let t = 0; t < 60 && !back; t++) { const th = await get(); if (!th.meta.outside && (await oks()).length >= 2) back = th; else await wait(300); }
  check("closed there, Weld takes it back and sends what waited", !!back && (await oks()).join() === "ok 1,ok 2", { oks: await oks() });
  check("…and says it is back", !!back && back.items.some((i) => i.kind === "note" && /Back from Claude Code/.test(i.text ?? "")));

  // "Take it back", by hand
  await E((T) => window.weld.thread.handOut(T), T);
  await wait(500);
  await page.locator(`[data-live="${T}"] .thread-outside button`, { hasText: "Take it back" }).click({ force: true });
  await wait(500);
  check("Take it back brings it back at once", !(await get()).meta.outside && !(await page.isVisible(`[data-live="${T}"] .thread-outside`)));
};
