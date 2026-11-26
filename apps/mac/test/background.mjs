// Work an agent leaves going in the background after its turn (a build it started) is seen: the thread is "working",
// its card says what and for how long (and, far off, so does the card's face), the bar's capsule says so, the corner
// counts it and its list says what; when it ends (by either of the agent's ways of saying so) it goes. It belongs to the
// run that started it: a branch doesn't inherit it, and a run let go has no say over the next run's. However many tasks,
// none is lost from view.
// A stand-in for Claude Code (test/fake/claude) and for the login shell keep this off any real agent:
// (the stand-in lingers 3 s when told to stop, so a run let go is still about as the next one starts)
//   FAKE_CLAUDE_TERM_MS=3000 PATH="$PWD/test/fake:$PATH" SHELL="$PWD/test/fake/shell" node scripts/shot.mjs out/background test/background.mjs
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
  const get = (id = T) => E((id) => window.weld.thread.get(id), id);
  const until = async (fn, ms = 15000) => { for (let t = 0; t < ms / 200; t++) { const v = await fn(); if (v) return v; await wait(200); } return null; };
  const strip = () => E((T) => document.querySelector(`[data-live="${T}"] .thread-behind`)?.textContent ?? null, T);

  await E((T) => window.weld.thread.send(T, { text: "start the build in the background bg:12" }), T);
  const th = await until(async () => { const th = await get(); return th.meta.status !== "running" && th.meta.background?.length ? th : null; });
  check("its turn over, the thread keeps what it left going", th?.meta.background?.[0]?.what === "Build the Acme API", th?.meta);
  await wait(1200);
  const s1 = await strip();
  await wait(2100);
  const s2 = await strip();
  check("its card says what is going on in the background, and for how long (the time moving on)", /In the background: Build the Acme API · \d/.test(s1 ?? "") && s1 !== s2, { s1, s2 });
  const dot = await E((T) => document.querySelector(`[data-live="${T}"] .live-dot`)?.getAttribute("data-state"), T);
  check("…and counts as working", dot === "working", dot);
  const pill = page.locator('.top-pill[data-state="working"]');
  check("the corner counts it as working", /1 working/.test((await pill.textContent().catch(() => "")) ?? ""));
  await pill.click();
  await wait(300);
  const row = await E(() => document.querySelector(".running-row .running-doing")?.textContent ?? null);
  check("…and its list says what, in the background", /In the background: Build the Acme API/.test(row ?? ""), row);
  await page.keyboard.press("Escape");
  await shot?.("background");
  // far off: the card's face says it, the strip (as the rest) isn't shown
  await E(() => { const st = window.__editor.store; st.cam = { ...st.cam, z: 0.15 }; st.emit(); });
  await wait(700);
  const far = await E((T) => { const n = document.querySelector(`[data-live="${T}"]`), st = n?.querySelector(".far-state"); return { face: n?.querySelector(".far-card")?.textContent ?? "", state: st?.textContent ?? "", seen: st ? getComputedStyle(st).visibility !== "hidden" && st.getBoundingClientRect().width > 0 : false, strip: n ? getComputedStyle(n.querySelector(".thread-behind") ?? n).visibility : null }; }, T);
  check("far off, the card's face says, visibly, it is working in the background; the strip not shown", far.state === "In the background" && far.seen && /In the background: Build the Acme API/.test(far.face) && far.strip === "hidden", far);
  const boards = await E(() => window.weld.boards.list?.().then?.((l) => l.find((b) => b.current)?.working) ?? null);
  check("the boards list counts it as an agent at work (so the board isn't offered to be put away)", boards === null || boards >= 1, boards);
  await E((T) => { window.__editor.fit([T]); }, T);
  await wait(500);
  // a branch, while it works, doesn't inherit it
  const copy = await E(async (T) => (await window.weld.thread.fork(T, `fork${Date.now().toString(36)}`)).meta.background ?? [], T);
  check("a thread branched from it while it works in the background has nothing in the background", copy.length === 0, copy);
  const done = await until(async () => { const th = await get(); return !th.meta.background?.length && th.items.some((i) => i.kind === "text" && i.text === "the build finished") ? th : null; }, 20000);
  check("when it finishes it goes, and the agent says so", !!done);
  check("…and the card no longer shows it", (await strip()) === null);

  // either of the agent's ways of saying a task ended is enough
  for (const how of ["bgn", "bgu"]) {
    await E(([T, how]) => window.weld.thread.send(T, { text: `go ${how}:2` }), [T, how]);
    const on = await until(async () => ((await get()).meta.background?.length ? true : null), 6000);
    const off = await until(async () => (!(await get()).meta.background?.length ? true : null), 8000);
    await wait(400);
    const corner = await E(() => !!document.querySelector('.top-pill[data-state="working"]'));
    check(`a task that ends with only ${how === "bgn" ? "its notification" : "its update"} goes, from the card and the corner`, !!on && !!off && !corner, { on, off, corner });
  }

  // however many: a long build among a dozen short ones stays in view after they have ended
  await E((T) => window.weld.thread.send(T, { text: "lots bgmany" }), T);
  await until(async () => ((await get()).meta.background?.length ? true : null), 6000);
  await wait(500);
  check("thirteen going: the card says thirteen", /^13 in the background/.test((await strip()) ?? ""), await strip());
  await wait(5500);
  const after = (await get()).meta.background ?? [];
  check("a long task among a dozen short ones is still shown once they have ended", after.length === 1 && after[0].what === "Long build", after.map((b) => b.what));

  // a run let go (its model changed) has no say over the next run's: what the new one starts stays shown
  await E((T) => window.weld.thread.set(T, { mode: "edits" }), T);
  await E((T) => window.weld.thread.send(T, { text: "again bg:10" }), T);
  const fresh = await until(async () => { const th = await get(); return th.meta.background?.some((b) => b.id.endsWith("bg")) ? th : null; }, 10000);
  await wait(4000);
  const kept = (await get()).meta.background ?? [];
  check("after its run was let go and a new one started, the new run's task stays shown", !!fresh && kept.some((b) => b.what === "Build the Acme API") && !kept.some((b) => b.what === "Long build"), kept.map((b) => b.what));

  // a thread kept in the bar: its capsule says so too, read or not
  await E(() => window.weld.saveSettings({ agent: "claude", mode: "full" }));
  await page.click(".ask-bar textarea");
  await page.keyboard.insertText("deploy it in the background bg:8");
  await page.keyboard.press("Enter");
  const away = await until(() => E(() => Object.keys(window.__editor.store.doc.away ?? {}).at(-1) ?? null), 5000);
  await until(async () => ((await get(away)).meta.background?.length ? true : null), 8000);
  // (its answer not yet read: for the person, the work behind it notwithstanding)
  await wait(500);
  const unreadNow = await E(async (id) => ({ unread: !!(await window.weld.thread.get(id)).meta.unread, pills: [...document.querySelectorAll(".top-pill")].map((p) => `${p.getAttribute("data-state")}:${p.textContent}`), waiting: (await window.weld.boards.list()).find((b) => b.current)?.waiting ?? null }), away);
  const capUnread = await E(() => { const c = [...document.querySelectorAll(".ask-capsule")].find((x) => /deploy/.test(x.textContent)); return c && { text: c.textContent, state: c.getAttribute("data-state") }; });
  check("…and its capsule reads as done, not as working behind", !!capUnread && capUnread.state === "done" && !/In the background/.test(capUnread.text), capUnread);
  check("an answer not yet read is still offered as for you while work goes on behind it (corner, boards)", unreadNow.unread && unreadNow.pills.some((p) => p.startsWith("ready:")) && unreadNow.waiting >= 1, unreadNow);
  await E((id) => window.weld.thread.seen(id), away);
  await wait(500);
  const cap = await E(() => { const c = [...document.querySelectorAll(".ask-capsule")].find((x) => /deploy/.test(x.textContent)); return c && { text: c.textContent, state: c.getAttribute("data-state") }; });
  check("a thread in the bar with work in the background (read): its capsule says so, and is working", /In the background: Build the Acme API/.test(cap?.text ?? "") && cap?.state === "working", cap);
  await shot?.("capsule");

  // a thread no longer on the board (deleted, its undo gone with the window): its work in the background is stopped
  await E((T) => window.weld.thread.set(T, { mode: "full" }), T);
  await E((T) => window.weld.thread.send(T, { text: "orphan bg:30" }), T);
  await until(async () => ((await get()).meta.background?.some((b) => /Acme/.test(b.what)) ? true : null), 8000);
  await E((away) => window.weld.thread.onBoard([away]), away);
  const gone = await until(async () => (!(await get()).meta.background?.length ? true : null), 8000);
  check("a thread no longer on the board has its background work stopped", !!gone);

  // Claude's own housekeeping (ambient) isn't work of the person's: not shown, not counted
  await E((T) => window.weld.thread.send(T, { text: "watch bgamb:20" }), T);
  await wait(2000);
  // (this thread's: another, in the bar, may still be busy with its own)
  const amb = { bg: (await get()).meta.background ?? [], dot: await E((T) => document.querySelector(`[data-live="${T}"] .live-dot`)?.getAttribute("data-state"), T) };
  check("Claude's own housekeeping isn't shown or counted as work", !amb.bg.length && amb.dot !== "working", amb);
  // a helper resumed under the same task id: the old run's late ending doesn't end the new one
  await E((T) => window.weld.thread.send(T, { text: "review bgreuse" }), T);
  await wait(3500);
  const reused = (await get()).meta.background ?? [];
  check("a helper resumed under its task id stays shown when its old run's ending arrives late", reused.some((b) => /resumed/.test(b.what)), reused.map((b) => b.what));
  // a turn that fails while older work goes on: the failure is said first, the work still shown on the card
  await E((T) => window.weld.thread.send(T, { text: "this will fail" }), T);
  await wait(1500);
  const failed = await E((T) => ({ dot: document.querySelector(`[data-live="${T}"] .live-dot`)?.getAttribute("data-state"), strip: document.querySelector(`[data-live="${T}"] .thread-behind`)?.textContent ?? null, pill: document.querySelector('.top-pill[data-state="error"]')?.textContent ?? null }), T);
  check("a failed turn is said first (stopped), with the work still going on shown on the card", failed.dot === "error" && /resumed/.test(failed.strip ?? ""), failed);
  await E(() => { const st = window.__editor.store; st.cam = { ...st.cam, z: 0.15 }; st.emit(); });
  await wait(700);
  const farErr = await E((T) => document.querySelector(`[data-live="${T}"] .far-state`)?.textContent ?? null, T);
  check("…and far off it says Stopped, not the work in the background", farErr === "Stopped", farErr);
  await E((T) => window.__editor.fit([T]), T);
  await wait(400);
};
