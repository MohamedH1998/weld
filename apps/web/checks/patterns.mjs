// Every pattern from weld's home page: it can be put down from the library, lands whole, and is one group.
import { open } from "./lib.mjs";
const { page, errs, close, shot } = await open({ w: 1500, h: 900 });
let pass = 0, fail = 0; const ok = (n, c, x = "") => { c ? pass++ : fail++; console.log(`${c ? "ok  " : "FAIL"} ${n}${c ? "" : "  " + x}`); };
const S = () => page.evaluate(() => { const s = window.__editor.store; return { shapes: s.doc.order.map((id) => s.doc.shapes[id]), sel: [...s.sel], tool: s.tool }; });
const reset = () => page.evaluate(() => { const e = window.__editor, s = e.store; s.persist = false; s.doc = { shapes: {}, order: [] }; s.sel = new Set(); s.undoStack = []; s.redoStack = []; s.cam = { x: 0, y: 0, z: 1 }; s.tool = "select"; s.emit(); e.invalidate(); });
const defs = await page.evaluate(async () => { const P = await __engine("patterns"); return P.PATTERNS.map((p) => ({ slug: p.slug, name: p.name, n: p.build().length })); });
ok("the home-page patterns are here (the two socket patterns are one: a wire with ports; the clock removed; five taken from our diagrams; nine from the guide; the lanes with their hand-overs)", defs.length === 38, `${defs.length}`);
const bad = [];
// the whole set, laid out to look at (three sheets)
for (let sheet = 0; sheet < 3; sheet++) {
  await reset(); await page.evaluate(() => { const s = window.__editor.store; s.cam = { x: 0, y: 0, z: 0.42 }; s.emit(); });
  const part = defs.slice(sheet * 9, sheet * 9 + 9);
  for (let i = 0; i < part.length; i++) {
    const d = part[i], x = 260 + (i % 3) * 490, y = 160 + Math.floor(i / 3) * 280;
    const before = (await S()).shapes.length;
    await page.getByRole("button", { name: "More shapes", exact: true }).click();
    await page.getByRole("tab", { name: "Patterns" }).click();
    await page.getByRole("group", { name: "Patterns" }).getByRole("button", { name: d.name, exact: true }).click();
    await page.mouse.click(x, y);
    const st = await S(); const added = st.shapes.slice(before);
    const groups = new Set(added.map((s) => s.group));
    const finite = JSON.stringify(added).indexOf("null") === -1;
    const joined = added.filter((s) => s.kind === "arrow").every((a) => [a.a, a.b].every((e) => !e.bind || added.some((o) => o.id === e.bind.id)));
    if (!(added.length === d.n && groups.size === 1 && !groups.has(undefined) && st.sel.length === d.n && st.tool === "select" && finite && joined)) bad.push(`${d.slug}: added ${added.length}/${d.n}, groups ${groups.size}, sel ${st.sel.length}, tool ${st.tool}`);
    await page.keyboard.press("Escape");
  }
  await page.waitForTimeout(150); await shot(`patterns-${sheet + 1}`);
}
ok("each lands whole, as one group, selected, with its wires joined", bad.length === 0, bad.join(" | "));
// one click on any part takes the whole pattern; undo removes it in one step
await reset(); await page.getByRole("button", { name: "More shapes", exact: true }).click(); await page.getByRole("tab", { name: "Patterns" }).click();
await page.getByRole("group", { name: "Patterns" }).getByRole("button", { name: "Loop", exact: true }).click(); await page.mouse.click(700, 420); await page.keyboard.press("Escape");
let st = await S(); const prompt = st.shapes.find((s) => s.text === "Prompt"); const pp = await page.evaluate((b) => window.__editor.screen({ x: b.x + b.w / 2, y: b.y + b.h / 2 }), prompt);
await page.mouse.click(pp.x, pp.y); st = await S(); ok("clicking one part takes that part", st.sel.length === 1, `${st.sel.length}/${st.shapes.length}`);
await page.keyboard.press("Meta+Shift+g"); await page.keyboard.press("Escape"); await page.mouse.click(pp.x, pp.y); st = await S(); ok("ungrouped, its parts are ordinary shapes", st.sel.length === 1);
await page.keyboard.press("Meta+z"); await page.keyboard.press("Meta+z"); st = await S(); ok("placing a pattern is one undo step", st.shapes.length === 0, `${st.shapes.length}`);
// the library tab itself
await page.getByRole("button", { name: "More shapes", exact: true }).click(); await page.getByRole("tab", { name: "Patterns" }).click(); await page.waitForTimeout(300);
const b = await page.locator('[role="toolbar"]').boundingBox(); await page.screenshot({ path: new URL("./shots/patterns-library.png", import.meta.url).pathname, clip: { x: b.x - 40, y: b.y - 560, width: b.width + 80, height: 610 } });
console.log(`\n${pass} passed, ${fail} failed`, errs.filter((e) => !e.includes("404"))); await close();
