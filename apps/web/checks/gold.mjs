// Weld's gold-standard diagrams on the board: each can be put down from the library, whole, and looked at beside the original.
import { open } from "./lib.mjs";
const { page, errs, close } = await open({ w: 1200, h: 1000 });
let pass = 0, fail = 0; const ok = (n, c, x = "") => { c ? pass++ : fail++; console.log(`${c ? "ok  " : "FAIL"} ${n}${c ? "" : "  " + x}`); };
const defs = await page.evaluate(async () => { const A = await import("/src/canvas/accepted.ts"); return A.ACCEPTED.map((p) => ({ slug: p.slug, name: p.name, n: (p.moments ? p.moments().moments[0].shapes : p.build()).length })); });
ok("the gold-standard diagrams are here, with those brought over from the board", defs.length >= 14, `${defs.length}`);
const bad = [];
for (const d of defs) {
  await page.evaluate(() => { const e = window.__editor, s = e.store; s.persist = false; s.doc = { shapes: {}, order: [] }; s.sel = new Set(); s.undoStack = []; s.redoStack = []; s.cam = { x: 0, y: 0, z: 1 }; s.tool = "select"; s.emit(); e.invalidate(); });
  await page.getByRole("button", { name: "More shapes", exact: true }).click(); await page.getByRole("tab", { name: "Diagrams" }).click();
  await page.getByRole("group", { name: "Diagrams" }).getByRole("button", { name: d.name, exact: true }).click(); await page.mouse.click(600, 450);
  const st = await page.evaluate(async () => { const G = await __engine("geometry"); const s = window.__editor.store, sh = s.doc.order.map((id) => s.doc.shapes[id]);
    const paths = sh.filter((x) => x.kind === "arrow").every((a) => G.arrowPath(s.doc, a).every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
    const dangling = sh.filter((x) => x.kind === "arrow").filter((a) => [a.a, a.b].some((e) => e.bind && !s.doc.shapes[e.bind.id])).length;
    // parts hidden in the moment on show are on the board too, and go wherever the group goes
    // a wire's end that lies on a shape's rim is joined to that shape (only an end out in the open, under a caption, is loose)
    const boxes = sh.filter((x) => x.kind !== "arrow" && x.kind !== "text");
    window.__loose = (window.__loose ?? 0) + sh.filter((x) => x.kind === "arrow" && !x.away).flatMap((a) => [a.a, a.b]).filter((e) => !e.bind && boxes.some((h) => e.x >= h.x - 1 && e.x <= h.x + h.w + 1 && e.y >= h.y - 1 && e.y <= h.y + h.h + 1 && Math.min(Math.abs(e.x - h.x), Math.abs(e.x - h.x - h.w), Math.abs(e.y - h.y), Math.abs(e.y - h.y - h.h)) <= 1)).length;
    window.__pads = (window.__pads ?? 0) + sh.filter((x) => x.kind === "pad").length;
    return { n: sh.filter((x) => !x.away).length, all: sh.length, groups: new Set(sh.map((x) => x.group)).size, sel: s.sel.size, tool: s.tool, paths, dangling }; });
  if (!(st.n === d.n && st.groups === 1 && st.sel === st.all && st.tool === "select" && st.paths && st.dangling === 0)) bad.push(`${d.slug}: ${JSON.stringify(st)} expected ${d.n}`);
  await page.keyboard.press("Escape"); await page.evaluate(() => window.__editor.fit()); await page.waitForTimeout(400);
  await page.screenshot({ path: new URL(`./shots/gold/${d.slug}-ours.png`, import.meta.url).pathname });
}
ok("each lands whole, as one group, with every wire joined and drawn", bad.length === 0, bad.join(" | "));
{ const c = await page.evaluate(() => ({ loose: window.__loose, pads: window.__pads }));
ok("no wire merely touches a shape it is not joined to, and no socket is a shape of its own", c.loose === 0 && c.pads === 0, JSON.stringify(c)); }
console.log(`\n${pass} passed, ${fail} failed`, errs.filter((e) => !e.includes("404"))); await close();
