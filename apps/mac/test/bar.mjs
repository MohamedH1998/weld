// The bar: ask, watch the capsule, read the thread, put it on the board and back, and keep it through undo and reload.
// Run: WELD_SEED=0 node scripts/shot.mjs <outDir> test/bar.mjs
import path from "node:path";
const MOCK = path.resolve("test/mock-acp-agent.mjs");
const say = (ok, what, more) => console.log(`${ok ? "ok  " : "FAIL"} ${what}${more !== undefined ? ` (${JSON.stringify(more)})` : ""}`);
const away = (page) => page.evaluate(() => Object.keys(window.__editor.store.doc.away ?? {}));
const until = async (page, fn, arg, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(fn, arg)) return true; await page.waitForTimeout(150); } return false; };
export default async ({ page, shot }) => {
  // new threads use the mock agent (no credentials)
  const saved = await page.evaluate(([n, m]) => window.weld.saveAgent({ name: "Mock agent", command: n, args: [m], env: {} }), [process.execPath, MOCK]);
  await page.evaluate((id) => window.weld.saveSettings({ agent: `cmd:${id}`, mode: "full" }), saved.id);
  await page.reload(); await page.waitForSelector("canvas"); await page.waitForTimeout(1200);
  say(await page.isVisible(".ask-bar textarea"), "the bar is there on an empty board");
  say(await page.isVisible(".welcome-task"), "…with things to try above it");
  await page.click(".ask-bar textarea");
  await page.keyboard.type("tool say:finished");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  const ids = await away(page);
  say(ids.length === 1, "asking starts a thread kept off the board", ids);
  const T = ids[0];
  say(await page.evaluate(() => window.__editor.store.doc.order.length === 0), "nothing is put on the board for it");
  say(await page.isVisible(".ask-capsule"), "a capsule says what it is doing");
  const done = await until(page, (t) => document.querySelector(".ask-capsule")?.getAttribute("data-state") === "done" && !!t, T);
  say(done, "the capsule says when it is done", await page.evaluate(() => document.querySelector(".ask-capsule")?.textContent));
  say(await until(page, () => !!document.querySelector(".agent-say"), null, 3000), "its reply shows by its mark on the board", await page.evaluate(() => document.querySelector(".agent-say")?.textContent));
  await shot("done");
  await page.click(".ask-capsule");
  await page.waitForTimeout(400);
  const reader = await page.evaluate(() => document.querySelector(".ask-reader")?.textContent ?? "");
  say(/finished/.test(reader), "pressed, the capsule opens the whole conversation", reader.slice(0, 120));
  say(!(await page.isVisible(".ask-bar")), "…in place of the bar");
  await shot("reader");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  say(!(await page.isVisible(".ask-reader")) && (await page.isVisible(".ask-bar")), "Escape folds it back");
  // undo of the person's own step never takes the thread away
  await page.evaluate(() => { const e = window.__editor, s = e.store; s.run(() => s.put({ id: "r1", kind: "rect", x: 900, y: 900, w: 100, h: 60, text: "", tone: "ink", fill: "none" })); e.history("undo"); });
  say((await away(page)).includes(T), "undoing a step on the board keeps the thread");
  // onto the board and back
  await page.evaluate((t) => window.dispatchEvent(new CustomEvent("weld:read", { detail: t })), T);
  await page.waitForTimeout(300);
  await page.click("text=Put on the board");
  await page.waitForTimeout(500);
  const on = await page.evaluate((t) => ({ card: window.__editor.store.doc.shapes[t]?.kind, away: !!window.__editor.store.doc.away?.[t] }), T);
  say(on.card === "thread" && !on.away, "Put on the board makes it a card", on);
  await shot("card");
  // (a step of the person's after it landed, undone and redone: the card stays through both)
  const hist = await page.evaluate((t) => {
    const e = window.__editor, s = e.store;
    s.run(() => s.put({ id: "r2", kind: "rect", x: 1400, y: 900, w: 100, h: 60, text: "", tone: "ink", fill: "none" }));
    const made = !!s.doc.shapes.r2;
    e.history("undo");
    const undone = !s.doc.shapes.r2 && !!s.doc.shapes[t];
    e.history("redo");
    return { made, undone, redone: !!s.doc.shapes.r2 && !!s.doc.shapes[t] };
  }, T);
  say(hist.made && hist.undone && hist.redone, "…and undo and redo of later steps keep the card", hist);
  await page.click('[aria-label="Close this thread"]');
  await page.waitForTimeout(300);
  const off = await page.evaluate((t) => ({ card: !!window.__editor.store.doc.shapes[t], away: !!window.__editor.store.doc.away?.[t] }), T);
  say(!off.card && off.away, "taken off the board, it is kept in the bar again", off);
  // a gesture abandoned, and a save in the middle of one, keep a thread started meanwhile
  const mid = await page.evaluate(() => {
    const s = window.__editor.store;
    s.mark();
    s.putAway({ id: "awaytest", kind: "thread", x: 0, y: 0, w: 1, h: 1, text: "", tone: "ink", fill: "none", live: {} });
    const saved = JSON.parse(s.docJson()).away?.awaytest !== undefined;
    s.cancel();
    return { saved, kept: !!s.doc.away?.awaytest };
  });
  say(mid.saved && mid.kept, "a thread started during a gesture is saved and survives the gesture being dropped", mid);
  // a thread at work taken off the board keeps working
  await page.click(".ask-bar textarea");
  await page.keyboard.type("hang");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  const H = (await away(page)).find((x) => x !== T && x !== "awaytest");
  say(await until(page, (h) => window.weld.thread.get(h).then((t) => t.meta.status === "running"), H), "a second thread starts working");
  await page.evaluate((h) => window.dispatchEvent(new CustomEvent("weld:read", { detail: h })), H);
  await page.waitForTimeout(300);
  await page.click("text=Put on the board");
  await page.waitForTimeout(400);
  await page.click('[aria-label="Close this thread"]');
  await page.waitForTimeout(1500);
  const still = await page.evaluate((h) => window.weld.thread.get(h).then((t) => ({ status: t.meta.status, away: !!window.__editor.store.doc.away?.[h] })), H);
  say(still.away && still.status === "running", "taken off the board while working, it keeps working", still);
  await page.evaluate((h) => window.weld.thread.stop(h), H);
  // the thread tool and New Thread open the bar
  await page.evaluate(() => { const ta = document.querySelector(".ask-bar textarea"); ta?.blur(); window.__editor.setTool("thread"); });
  await page.waitForTimeout(200);
  say(await page.evaluate(() => document.activeElement?.closest(".ask-bar") !== null && window.__editor.store.tool === "select"), "the thread tool asks in the bar");
  // kept through a reload
  await page.evaluate(() => window.__editor.store.saveNow?.());
  await page.waitForTimeout(1700);
  await page.reload(); await page.waitForSelector("canvas"); await page.waitForTimeout(1500);
  say((await away(page)).includes(T), "a reload keeps it");

  // who a new thread is asked of, and with which model, chosen in the bar before anything is asked
  const chip = (i) => page.evaluate((i) => document.querySelectorAll(".ask-row .live-chip")[i]?.textContent ?? "", i);
  say(/Mock agent/.test(await chip(0)), "the bar says which agent is asked", await chip(0));
  say(!(await page.evaluate(() => [...document.querySelectorAll(".ask-row .live-chip")].some((c) => /Default/.test(c.textContent)))), "…and offers no model for an agent that names none");
  await page.click(".ask-row .live-chip >> nth=0");
  await page.waitForTimeout(200);
  const offered = await page.evaluate(() => [...document.querySelectorAll(".ask-menu button")].map((b) => ({ t: b.textContent, off: b.disabled })));
  say(["Claude", "Codex", "Mock agent"].every((n) => offered.some((o) => o.t.includes(n))), "pressed, it lists the agents", offered.map((o) => o.t));
  if (offered.find((o) => o.t.includes("Claude Code") && !o.off)) {
    await page.click('.ask-menu button:has-text("Claude")');
    await page.waitForTimeout(200);
    say(/Claude/.test(await chip(0)) && /Default/.test(await chip(1)), "choosing Claude offers its models", [await chip(0), await chip(1)]);
    await page.click(".ask-row .live-chip >> nth=1");
    await page.waitForTimeout(200);
    const names = await page.evaluate(() => [...document.querySelectorAll(".ask-menu button")].map((b) => b.textContent));
    say(["Default", "Fable", "Opus", "Sonnet", "Haiku"].every((n) => names.includes(n)), "…Default and the aliases Claude Code takes", names);
    await page.click('.ask-menu button:has-text("Opus")');
    await page.waitForTimeout(300);
    const kept = await page.evaluate(() => window.weld.settings?.() ?? null);
    say(/Opus/.test(await chip(1)), "the model chosen shows in the bar", await chip(1));
    // a new thread is given them (put down as a card: nothing is sent, so no agent is run)
    await page.evaluate(() => { const s = window.__editor.store; s.run(() => s.put({ id: "modelcard", kind: "thread", x: 3000, y: 3000, w: 420, h: 520, text: "", tone: "ink", fill: "none", live: {} })); });
    const seeded = await until(page, () => window.weld.thread.get("modelcard").then((t) => t?.meta.agent === "claude" && t.meta.model === "opus" && t.meta.modelFor === "claude"), null, 6000);
    say(seeded, "a new thread is asked of that agent with that model", await page.evaluate(() => window.weld.thread.get("modelcard").then((t) => ({ agent: t?.meta.agent, model: t?.meta.model, modelFor: t?.meta.modelFor }))));
    // remembered for next time
    await page.reload(); await page.waitForSelector("canvas"); await page.waitForTimeout(1500);
    say(/Claude/.test(await chip(0)) && /Opus/.test(await chip(1)), "after a reload the bar still asks Claude with Opus", [await chip(0), await chip(1)], kept);
  } else say(true, "(Claude Code is not on this Mac: its models are not checked)");
};
