// Work an agent leaves going in the background after its turn (a build it started) is seen: the thread is "working",
// its card says what and for how long, the bar's capsule says so, the corner counts it; and when it finishes, it goes.
// A stand-in for Claude Code (test/fake/claude) and for the login shell keep this off any real agent:
//   PATH="$PWD/test/fake:$PATH" SHELL="$PWD/test/fake/shell" node scripts/shot.mjs out/background test/background.mjs
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
  await E((T) => window.weld.thread.send(T, { text: "start the build in the background bg:8" }), T);
  let th;
  for (let t = 0; t < 40; t++) { th = await get(); if (th.meta.status !== "running" && th.meta.background?.length) break; await wait(200); }
  check("its turn over, the thread keeps what it left going", th.meta.status !== "running" && th.meta.background?.[0]?.what === "Build the Acme API", th.meta);
  await wait(1500);
  const card = await E((T) => ({ strip: document.querySelector(`[data-live="${T}"] .thread-behind`)?.textContent ?? null, dot: document.querySelector(`[data-live="${T}"] .live-dot`)?.getAttribute("data-state") }), T);
  check("its card says what is going on in the background, and for how long", /In the background: Build the Acme API · \d/.test(card.strip ?? ""), card);
  check("…and counts as working", card.dot === "working", card);
  const pill = await E(() => document.querySelector('.top-pill[data-state="working"]')?.textContent ?? null);
  check("the corner counts it as working", /1 working/.test(pill ?? ""), pill);
  await shot?.("background");
  for (let t = 0; t < 60; t++) { th = await get(); if (!th.meta.background?.length && th.items.some((i) => i.kind === "text" && i.text === "the build finished")) break; await wait(250); }
  check("when it finishes it goes, and the agent says so", !th.meta.background?.length && th.items.some((i) => i.kind === "text" && i.text === "the build finished"), th.meta.background);
  await wait(500);
  check("…and the card no longer shows it", !(await E((T) => !!document.querySelector(`[data-live="${T}"] .thread-behind`), T)));

  // a thread kept in the bar: its capsule says so too
  await E(() => window.weld.saveSettings({ agent: "claude", mode: "full" }));
  await page.click(".ask-bar textarea");
  await page.keyboard.insertText("deploy it in the background bg:6");
  await page.keyboard.press("Enter");
  let cap = null;
  for (let t = 0; t < 40 && !/In the background/.test(cap?.text ?? ""); t++) { cap = await E(() => { const c = document.querySelector(".ask-capsule"); return c && { text: c.textContent, state: c.getAttribute("data-state") }; }); await wait(250); }
  check("a thread in the bar with work in the background: its capsule says so, and is working", /In the background: Build the Acme API/.test(cap?.text ?? "") && cap?.state === "working", cap);
  await shot?.("capsule");
};
