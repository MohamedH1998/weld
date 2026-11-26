// What a thread has cost is counted once: Claude Code, kept running between turns, says what its whole run has cost so
// far with each answer, so only what each turn added goes on the thread's total. A stand-in for Claude Code is used
// (test/fake/claude: $0.10 a turn), put first on the PATH, with a stand-in login shell that keeps that PATH:
//   PATH="$PWD/test/fake:$PATH" SHELL="$PWD/test/fake/shell" node scripts/shot.mjs out/cost test/cost.mjs
// and, as an older Claude Code that reports only each run's cost, with FAKE_CLAUDE_VERSION=2.1.200 before it; and as one
// that saves its total only when it finishes by itself (as Claude Code does), with FAKE_CLAUDE_SAVE=exit.
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, ok, extra) => console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && extra !== undefined ? ` -> ${JSON.stringify(extra).slice(0, 300)}` : ""}`);

export default async ({ app, page }) => {
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  await wait(2000);
  // (never a real agent: the Claude this Weld would run must be the stand-in, or nothing is sent)
  for (let t = 0; t < 60 && !(await E(() => window.weld.envKnown?.() ?? true)); t++) await wait(200);
  const bin = await app.evaluate(() => { const fs = process.getBuiltinModule("node:fs"), p = process.getBuiltinModule("node:path"); for (const d of (process.env.PATH || "").split(":")) if (d && fs.existsSync(p.join(d, "claude"))) return p.join(d, "claude"); return null; });
  check(`(the Claude this Weld runs is the stand-in, as ${process.env.FAKE_CLAUDE_VERSION || "2.1.332"}${process.env.FAKE_CLAUDE_SAVE === "exit" ? ", saving its total only on finishing" : ""})`, !!bin && bin.endsWith("test/fake/claude"), bin);
  if (!bin?.endsWith("test/fake/claude")) return;
  const T = await E(() => Object.values(window.__editor.store.doc.shapes).find((s) => s.kind === "thread")?.id);
  await E((T) => window.weld.thread.set(T, { agent: "claude", mode: "full" }), T);
  const done = async (n) => {
    for (let t = 0; t < 80; t++) {
      const th = await E((T) => window.weld.thread.get(T), T);
      if (th.meta.status !== "running" && th.items.filter((i) => i.kind === "text" && /^ok \d/.test(i.text ?? "")).length >= n) return th;
      await wait(250);
    }
    return E((T) => window.weld.thread.get(T), T);
  };
  let th;
  for (const [n, text] of [[1, "first"], [2, "second"], [3, "third"]]) {
    await E(([T, text]) => window.weld.thread.send(T, { text }), [T, text]);
    th = await done(n);
  }
  const said = () => th.items.filter((i) => i.kind === "text" && /^ok \d/.test(i.text ?? "")).map((i) => i.text);
  check("(three turns, answered in turn by the one Claude kept running)", said().join() === "ok 1,ok 2,ok 3", said());
  check("the thread's cost is what the three turns cost ($0.30), counted once", Math.abs((th.meta.cost ?? 0) - 0.3) < 1e-9, th.meta.cost);
  await wait(500);
  const shown = await E((T) => document.querySelector(`[data-live="${T}"] .live-cost`)?.textContent, T);
  check("…and the thread's card says so beside its name", shown === "$0.30", shown);
  const tip = await E((T) => { const c = document.querySelector(`[data-live="${T}"] .live-cost`); return c && { title: c.title, pe: getComputedStyle(c).pointerEvents }; }, T);
  check("…which, pointed at, says what it is", !!tip?.title && tip.pe !== "none", tip);
  // a fresh run of it (its mode changed), resumed: what the session cost before is not counted again
  await E((T) => window.weld.thread.set(T, { mode: "edits" }), T);
  await E((T) => window.weld.thread.send(T, { text: "fourth, a big one" }), T);
  th = await done(4);
  check("(a fresh run, resumed, answers the session's fourth turn)", said().at(-1) === "ok 4", said());
  // (its first turn costs more than all before it: what it reports can't be read as its own or the session's by size)
  check("resumed, the thread's cost is the four turns' ($0.80: three at $0.10, one at $0.50), none counted twice or missed", Math.abs((th.meta.cost ?? 0) - 0.8) < 1e-9, th.meta.cost);
  // a thread branched from it starts with no cost of its own
  const copy = await E(async (T) => { const id = `fork${Date.now().toString(36)}`; const c = await window.weld.thread.fork(T, id); return c.meta.cost ?? null; }, T);
  check("a thread branched from it starts with no cost of its own", copy === null, copy);
};
