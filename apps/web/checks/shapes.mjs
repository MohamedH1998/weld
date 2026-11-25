// The shapes brought in from weld: placing each from the library, typing its words, levels, pictures.
import { open } from "./lib.mjs";
const { page, errs, close, shot, drag } = await open({ w: 1360, h: 1600 });
let pass = 0, fail = 0; const ok = (n, c, x = "") => { c ? pass++ : fail++; console.log(`${c ? "ok  " : "FAIL"} ${n}${c ? "" : "  " + x}`); };
const S = () => page.evaluate(() => { const s = window.__editor.store; return { shapes: s.doc.order.map((id) => s.doc.shapes[id]), sel: [...s.sel], tool: s.tool, editing: !!s.editing }; });
await page.evaluate(() => { const s = window.__editor.store; s.persist = false; s.cam = { x: 0, y: 0, z: 1 }; s.emit(); });
const kinds = await page.evaluate(async () => { const K = await __engine("kinds"); return K.LIBRARY.flatMap((g) => g.kinds.map((k) => ({ k, name: K.KINDS[k].name, key: K.KINDS[k].key, label: K.KINDS[k].label, level: !!K.KINDS[k].level }))); });
// place every shape from the library, in a grid, and give it words
let i = 0;
for (const d of kinds) {
  const x = 120 + (i % 8) * 155, y = 130 + Math.floor(i / 8) * 145; i++;
  await page.getByRole("button", { name: "More shapes", exact: true }).click();
  await page.getByRole("group").getByRole("button", { name: d.name, exact: true }).click();
  await page.mouse.click(x, y);
  await page.keyboard.press("Enter"); await page.keyboard.type(d.name); await page.keyboard.press("Enter"); await page.keyboard.press("Escape");
}
let st = await S();
ok("every library shape can be placed and named", st.shapes.length === kinds.length && st.shapes.every((s, j) => s.kind === kinds[j].k && s.text === kinds[j].name), JSON.stringify(st.shapes.map((s) => s.kind + ":" + s.text)));
ok("each hands back to the pointer after one use", st.tool === "select");
await page.waitForTimeout(150); await shot("shapes-1-all");
// keys pick them too
await page.keyboard.press("c"); st = await S(); ok("C picks the Card", st.tool === "card", st.tool); await page.keyboard.press("Escape");
// a level goes up and down
const meter = st.shapes.find((s) => s.kind === "meter"); const mp = await page.evaluate((b) => window.__editor.screen({ x: b.x + b.w / 2, y: b.y + b.h / 2 }), meter);
await page.mouse.click(mp.x, mp.y); for (let n = 0; n < 4; n++) await page.getByRole("button", { name: "Raise", exact: true }).click(); st = await S();
ok("Raise steps a meter's level", Math.abs(st.shapes.find((s) => s.kind === "meter").value - 0.8) < 1e-9, `${st.shapes.find((s) => s.kind === "meter").value}`);
await page.keyboard.press("Meta+z"); await page.keyboard.press("Escape");
// an arrow joins a card to a machine, and stops at their edges
const at = async (kind) => { const b = (await S()).shapes.find((s) => s.kind === kind); return page.evaluate((b) => window.__editor.screen({ x: b.x + b.w / 2, y: b.y + b.h / 2 }), b); };
const c1 = await at("card"), c2 = await at("machine"); await page.keyboard.press("a"); await drag(c1.x, c1.y, c2.x, c2.y); st = await S(); const ar = st.shapes.at(-1);
ok("arrows join the new shapes", ar.kind === "arrow" && !!ar.a.bind && !!ar.b.bind);
await page.keyboard.press("Escape");
// the Line tool draws a wire with no head
await page.getByRole("button", { name: "More shapes", exact: true }).click(); await page.getByRole("group").getByRole("button", { name: "Line", exact: true }).click(); await drag(200, 700, 420, 740); st = await S();
ok("Line draws a connection with no arrowhead", st.shapes.at(-1).kind === "arrow" && st.shapes.at(-1).heads === "none" && st.tool === "select");
await page.keyboard.press("Escape");
// typing into a header happens in the header
const mc = await at("machine"); await page.mouse.dblclick(mc.x, mc.y); await page.waitForTimeout(80);
const ed = await page.evaluate(() => { const e = document.querySelector("[contenteditable]"); const r = e.getBoundingClientRect(); return { y: r.y + r.height / 2, tt: getComputedStyle(e).textTransform }; });
const mb = (await S()).shapes.find((s) => s.kind === "machine"); const mTop = (await page.evaluate((b) => window.__editor.screen({ x: b.x, y: b.y }), mb)).y;
ok("a machine's name is typed in its header, in capitals", ed.y > mTop && ed.y < mTop + 34 && ed.tt === "uppercase", JSON.stringify([ed, mTop]));
await shot("shapes-2-typing"); await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
// the library itself
await page.getByRole("button", { name: "More shapes", exact: true }).click(); await page.waitForTimeout(200); await shot("shapes-3-library"); await page.keyboard.press("Escape");
// pictures: the PNG and the SVG still agree
const diff = await page.evaluate(async () => {
  const X = await __engine("export"), R = await __engine("render"); const d = window.__editor.store.doc, t = R.themeFor(false);
  const svg = await X.toSVG(d, null, t), png = await X.toPNG(d, null, t); const url = URL.createObjectURL(png);
  const load = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
  const a = await load(url), b = await load("data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg));
  const px = (img) => { const c = document.createElement("canvas"); c.width = a.width; c.height = a.height; const x = c.getContext("2d"); x.drawImage(img, 0, 0, a.width, a.height); return x.getImageData(0, 0, a.width, a.height).data; };
  const pa = px(a), pb = px(b); let dd = 0, ink = 0; for (let n = 0; n < pa.length; n += 4) { if (Math.abs(pa[n] - pb[n]) + Math.abs(pa[n + 1] - pb[n + 1]) + Math.abs(pa[n + 2] - pb[n + 2]) > 120) dd++; if (pa[n] < 200) ink++; }
  return { ratio: dd / ink, bad: /NaN|undefined/.test(svg) };
});
ok("the new shapes export the same as PNG and SVG", diff.ratio < 0.3 && !diff.bad, JSON.stringify(diff));
// wires dock in notches: every tip that meets a welded shape sits at the middle of one of its sides
const dock = await page.evaluate(async () => {
  const G = await __engine("geometry"); const card = (id, x, y, kind = "card", w = 160, h = 56) => ({ id, kind, x, y, w, h, text: "", tone: "ink", fill: "none" });
  const bind = (id) => ({ x: 0, y: 0, bind: { id, ax: 0.5, ay: 0.5 } }); const out = [];
  for (const route of ["straight", "elbow"]) for (const [bx, by] of [[400, 0], [400, 30], [400, 200], [60, 300], [-300, 90], [-120, -260], [520, -180]]) for (const kb of ["card", "machine", "rect"]) {
    const A = card("a", 0, 0), B = card("b", bx, by, kb, kb === "machine" ? 176 : 160, kb === "machine" ? 100 : 56), ar = { id: "r", kind: "arrow", text: "", route, heads: "end", tone: "ink", a: bind("a"), b: bind("b") };
    const pts = G.arrowPath({ shapes: { a: A, b: B, r: ar }, order: ["a", "b", "r"] }, ar);
    const atNotch = (b, p) => { const cx = b.x + b.w / 2, cy = b.y + b.h / 2; return (Math.abs(p.y - cy) < 0.01 && (Math.abs(p.x - b.x) < 0.01 || Math.abs(p.x - (b.x + b.w)) < 0.01)) || (Math.abs(p.x - cx) < 0.01 && (Math.abs(p.y - b.y) < 0.01 || Math.abs(p.y - (b.y + b.h)) < 0.01)); };
    if (!atNotch(A, pts[0])) out.push(`${route} from card → ${kb} at ${bx},${by}: start ${JSON.stringify(pts[0])}`);
    if (kb !== "rect" && !atNotch(B, pts[pts.length - 1])) out.push(`${route} into ${kb} at ${bx},${by}: end ${JSON.stringify(pts[pts.length - 1])}`);
  }
  return out;
});
ok("arrows joined to welded shapes end in their notches, straight or right-angled, from any direction", dock.length === 0, dock.slice(0, 4).join(" | "));

console.log(`\n${pass} passed, ${fail} failed`, errs.filter((e) => !e.includes("404"))); await close();
