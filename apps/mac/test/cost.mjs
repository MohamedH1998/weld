// What a thread costs isn't kept: Claude Code reports a running total with each answer, which Weld once added up turn
// on turn (wrongly) and used for nothing. A stand-in for Claude Code is used (test/fake/claude: $0.10 a turn), put first
// on the PATH, with a stand-in login shell that keeps that PATH:
//   PATH="$PWD/test/fake:$PATH" SHELL="$PWD/test/fake/shell" node scripts/shot.mjs out/cost test/cost.mjs
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, ok, extra) => console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && extra !== undefined ? ` -> ${JSON.stringify(extra).slice(0, 300)}` : ""}`);

export default async ({ app, page }) => {
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  await wait(2000);
  // (never a real agent: the Claude this Weld would run must be the stand-in, or nothing is sent)
  for (let t = 0; t < 60 && !(await E(() => window.weld.envKnown?.() ?? true)); t++) await wait(200);
  const bin = await app.evaluate(() => { const fs = process.getBuiltinModule("node:fs"), p = process.getBuiltinModule("node:path"); for (const d of (process.env.PATH || "").split(":")) if (d && fs.existsSync(p.join(d, "claude"))) return p.join(d, "claude"); return null; });
  check("(the Claude this Weld runs is the stand-in)", !!bin && bin.endsWith("test/fake/claude"), bin);
  if (!bin?.endsWith("test/fake/claude")) return;
  const T = await E(() => Object.values(window.__editor.store.doc.shapes).find((s) => s.kind === "thread")?.id);
  await E((T) => window.weld.thread.set(T, { agent: "claude", mode: "full" }), T);
  let th;
  for (const [n, text] of [[1, "plan the Acme API"], [2, "and its tests"], [3, "and the billing page"]]) {
    await E(([T, text]) => window.weld.thread.send(T, { text }), [T, text]);
    for (let t = 0; t < 80; t++) {
      th = await E((T) => window.weld.thread.get(T), T);
      if (th.meta.status !== "running" && th.items.filter((i) => i.kind === "text" && /^ok \d/.test(i.text ?? "")).length >= n) break;
      await wait(250);
    }
  }
  check("(three turns answered)", th.items.filter((i) => i.kind === "text" && /^ok \d/.test(i.text ?? "")).length === 3);
  check("what the turns cost isn't kept on the thread", th.meta.cost === undefined, th.meta.cost);
};
