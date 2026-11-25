// Every tool × every kind of target × click / drag / double-click. Prints what happened.
import { open } from "./lib.mjs";
const { page, errs, close } = await open();
const seed = async () => page.evaluate(() => {
  const e = window.__editor, s = e.store; window.__cam0 ??= { ...s.cam }; s.cam = { ...window.__cam0 }; const c = s.cam; const W = (x, y) => ({ x: x / c.z + c.x, y: y / c.z + c.y });
  const box = (id, x, y, fill) => { const p = W(x, y); return { id, kind: "rect", x: p.x, y: p.y, w: 160, h: 72, text: "", tone: "ink", fill }; };
  const t = W(260, 520);
  const shapes = [box("F", 200, 200, "solid"), box("H", 600, 200, "none"),
    { id: "T", kind: "text", x: t.x, y: t.y, w: 60, h: 26, text: "words", size: 18, tone: "ink" },
    { id: "AB", kind: "arrow", text: "", route: "straight", heads: "end", tone: "ink", a: { x: 0, y: 0, bind: { id: "F", ax: 0.5, ay: 0.5 } }, b: { x: 0, y: 0, bind: { id: "H", ax: 0.5, ay: 0.5 } } },
    { id: "AF", kind: "arrow", text: "", route: "straight", heads: "end", tone: "ink", a: W(600, 500), b: W(800, 560) }];
  s.doc = { shapes: Object.fromEntries(shapes.map((x) => [x.id, x])), order: shapes.map((x) => x.id) };
  s.sel = new Set(); s.editing = null; s.tool = "select"; s.emit(); e.invalidate();
});
const snap = () => page.evaluate(() => { const s = window.__editor.store; return { doc: JSON.stringify(s.doc), n: s.doc.order.length, sel: [...s.sel].join("+"), tool: s.tool, editing: s.editing, cam: JSON.stringify(s.cam), kinds: s.doc.order.map((id) => s.doc.shapes[id].kind) }; });
const targets = { empty: [1000, 650], "filled box": [280, 236], "hollow box": [680, 236], "box edge": [600, 236], text: [285, 533], "bound arrow": [480, 236], "free arrow": [700, 530] };
const tools = { select: "v", rect: "r", arrow: "a", text: "t", hand: "h" };
for (const [tool, key] of Object.entries(tools)) for (const [tname, [x, y]] of Object.entries(targets)) for (const gesture of ["click", "drag", "dblclick"]) {
  await page.keyboard.press("Escape"); await seed();
  await page.keyboard.press(key); const before = await snap();
  if (gesture === "click") await page.mouse.click(x, y);
  else if (gesture === "dblclick") await page.mouse.dblclick(x, y);
  else { await page.mouse.move(x, y); await page.mouse.down(); for (let i = 1; i <= 6; i++) await page.mouse.move(x + i * 10, y + i * 15); await page.mouse.up(); }
  await page.waitForTimeout(40); const a = await snap();
  const out = [];
  if (a.n !== before.n) out.push(`+${a.n - before.n} ${a.kinds.slice(before.n).join(",")}`);
  else if (a.doc !== before.doc) out.push("changed/moved");
  out.push(a.sel ? `sel ${a.sel.replace(/[a-z0-9]{8,}/g, "new")}` : "sel –");
  if (a.editing) out.push(`typing in ${["F", "H", "T", "AB", "AF"].includes(a.editing) ? a.editing : "new"}`);
  if (a.cam !== before.cam) out.push("panned");
  out.push(`tool→${a.tool}`);
  console.log(`${tool.padEnd(7)} ${gesture.padEnd(9)} ${tname.padEnd(12)} ${out.join(" · ")}`);
  await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
}
console.log(errs.filter((e) => !e.includes("404")));
await close();
