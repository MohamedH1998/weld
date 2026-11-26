// A thread in hand shows what it sees, quietly: a faint outline in its colour. Pointing at one of them in the thread's
// list (hover or keyboard focus) outlines that one clearly, and only that one.
//   WELD_SEED=0 node scripts/shot.mjs out/kin test/kin.mjs
import path from "node:path";

const MOCK = path.resolve("test/mock-acp-agent.mjs");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, ok, extra) => console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && extra !== undefined ? ` -> ${JSON.stringify(extra).slice(0, 300)}` : ""}`);

export default async ({ page, shot }) => {
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const saved = await E(([n, m]) => window.weld.saveAgent({ name: "Mock agent", command: n, args: [m], env: {} }), [process.execPath, MOCK]);
  await E((id) => window.weld.saveSettings({ agent: `cmd:${id}`, mode: "full" }), saved.id);
  await page.reload();
  await page.waitForFunction(() => !!window.__editor);
  await wait(1200);
  await page.click(".ask-bar textarea");
  await page.keyboard.insertText("say:Here's_the_plan");
  await page.keyboard.press("Enter");
  for (let t = 0; t < 80 && (await E(() => document.querySelector(".ask-capsule")?.getAttribute("data-state"))) !== "done"; t++) await wait(250);
  await page.click(".ask-capsule");
  await wait(500);
  await page.click("text=Put on the board");
  await wait(800);
  // two parts of a plan the thread was shown, beside it
  const id = await E(() => {
    const e = window.__editor, st = e.store, d = st.doc, t = d.order.find((x) => d.shapes[x]?.kind === "thread"), b = d.shapes[t];
    st.run(() => {
      st.put({ id: "r1", kind: "rect", x: b.x + b.w + 80, y: b.y, w: 220, h: 90, text: "Acme API", tone: "ink", fill: "tint" });
      st.put({ id: "r2", kind: "rect", x: b.x + b.w + 80, y: b.y + 140, w: 220, h: 90, text: "Payments service", tone: "ink", fill: "tint" });
      st.patch(t, { live: { ...b.live, sees: ["drawing:r1", "drawing:r2"] } });
      // and a page the thread opened (what it made is outlined too)
      st.put({ id: "pg", kind: "browser", x: b.x, y: b.y + b.h + 80, w: 420, h: 260, text: "", tone: "ink", fill: "none", live: { url: "about:blank", from: t } });
    });
    e.fit([t, "r1", "r2", "pg"]);
    st.select([t]);
    st.emit();
    return t;
  });
  await wait(900);
  const quiet = await E(() => { const k = window.__editor.overlay.kin; return k && { ids: [...k.ids].sort(), hot: [...(k.hot ?? [])] }; });
  check("a thread in hand outlines what it sees", quiet && quiet.ids.join() === "r1,r2", quiet);
  check("…all of them faintly, none clearly", quiet && quiet.hot.length === 0, quiet);
  const card = await E(() => { const n = document.querySelector('[data-live="pg"]'), sh = n?.querySelector(":scope > .live-sheet"); return n && sh && { kin: n.classList.contains("is-kin"), outline: getComputedStyle(sh).outlineWidth, shadow: getComputedStyle(sh).boxShadow }; });
  check("a page the thread opened is outlined faintly too (a thin line, no glow)", card?.kin && card.outline === "1.5px" && !/6px/.test(card.shadow), card);
  await shot?.("quiet");
  const chips = page.locator(".thread-see");
  check("the thread lists them", (await chips.count()) === 2, await chips.allInnerTexts());
  await chips.first().hover();
  await wait(300);
  const hot = await E(() => [...(window.__editor.overlay.kin?.hot ?? [])]);
  check("pointing at one in its list outlines that one clearly", hot.join() === "r1", hot);
  await shot?.("pointed");
  await page.mouse.move(5, 5);
  await wait(300);
  check("…and moving off lets it go back to faint", (await E(() => (window.__editor.overlay.kin?.hot?.size ?? 0))) === 0);
  // by keyboard too
  await chips.nth(1).locator("button").first().focus();
  await wait(200);
  check("focusing one by keyboard outlines it clearly too", (await E(() => [...(window.__editor.overlay.kin?.hot ?? [])].join())) === "r2");
  await E(() => document.activeElement?.blur());
  // another thing taken in hand: nothing stays pointed at
  await chips.first().hover();
  await E(() => { const st = window.__editor.store; st.select(["r1"]); st.emit(); });
  await wait(300);
  await E((t) => { const st = window.__editor.store; st.select([t]); st.emit(); }, id);
  await wait(300);
  await page.mouse.move(5, 5);
  check("taking another thing in hand lets go of what was pointed at", (await E(() => (window.__editor.overlay.kin?.hot?.size ?? 0))) === 0);
};
