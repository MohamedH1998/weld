// Pictures of the board: the PNG and the SVG must show the same thing.
import { writeFileSync } from "node:fs";
import { open } from "./lib.mjs";
const { page, errs, close } = await open({ w: 1280, h: 760 });
let pass = 0, fail = 0; const ok = (n, c, x = "") => { c ? pass++ : fail++; console.log(`${c ? "ok  " : "FAIL"} ${n}${c ? "" : "  " + x}`); };
const R = (id, x, y, text, extra = {}) => ({ id, kind: "rect", x, y, w: 160, h: 72, text, tone: "ink", fill: "none", ...extra });
const bind = (id) => ({ x: 0, y: 0, bind: { id, ax: 0.5, ay: 0.5 } });
const shapes = [R("A", 100, 100, "Request"), R("B", 380, 90, "Signed in?", { kind: "diamond", h: 92, fill: "tint", tone: "accent" }), R("C", 660, 100, "Handler", { fill: "solid", tone: "green" }), R("D", 940, 100, "Response", { kind: "ellipse", line: "dashed" }),
  R("E", 380, 300, "401 & <tags> \"quoted\"", { tone: "red", line: "dotted", rot: 0.2 }), { id: "T", kind: "text", x: 700, y: 320, w: 200, h: 52, text: "free text\nsecond line", size: 18, tone: "ink", rot: -0.15 },
  { id: "r1", kind: "arrow", text: "", route: "elbow", heads: "end", tone: "ink", a: bind("A"), b: bind("B") }, { id: "r2", kind: "arrow", text: "yes", route: "elbow", heads: "end", tone: "ink", a: bind("B"), b: bind("C") },
  { id: "r3", kind: "arrow", text: "", route: "straight", heads: "both", tone: "accent", line: "dashed", a: bind("C"), b: bind("D") }, { id: "r4", kind: "arrow", text: "no", route: "elbow", heads: "end", tone: "red", a: bind("B"), b: bind("E") },
  { id: "r5", kind: "arrow", text: "", route: "elbow", heads: "none", tone: "muted", a: bind("D"), b: { x: 1000, y: 400 } }];
await page.evaluate((shapes) => { const s = window.__editor.store; s.persist = false; s.doc = { shapes: Object.fromEntries(shapes.map((x) => [x.id, x])), order: shapes.map((x) => x.id) }; s.cam = { x: 0, y: 0, z: 1 }; s.emit(); }, shapes);
await page.waitForTimeout(300);
const out = await page.evaluate(async () => {
  const X = await __engine("export"), R = await __engine("render"); const d = window.__editor.store.doc, t = R.themeFor(false);
  const svg = await X.toSVG(d, null, t), png = await X.toPNG(d, null, t);
  const b64 = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(png); });
  const part = await X.toSVG(d, new Set(["B", "E", "r4"]), t);
  // paint both into canvases of the same size and compare
  const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const a = await load(b64), b = await load("data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg));
  const px = (img) => { const c = document.createElement("canvas"); c.width = a.width; c.height = a.height; const x = c.getContext("2d"); x.drawImage(img, 0, 0, a.width, a.height); return x.getImageData(0, 0, a.width, a.height).data; };
  const pa = px(a), pb = px(b); let diff = 0, ink = 0;
  for (let i = 0; i < pa.length; i += 4) { const da = Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2]); if (da > 120) diff++; if (pa[i] < 200) ink++; }
  return { svg, b64, part, size: [a.width, a.height], svgSize: [b.width, b.height], diff, ink, empty: await X.toSVG({ shapes: {}, order: [] }, null, t) };
});
writeFileSync(new URL("./shots/export.svg", import.meta.url), out.svg); writeFileSync(new URL("./shots/export.png", import.meta.url), Buffer.from(out.b64.split(",")[1], "base64")); writeFileSync(new URL("./shots/export-part.svg", import.meta.url), out.part);
ok("the PNG is twice the size of the SVG, for sharp screens", out.size[0] === out.svgSize[0] * 2 && out.size[1] === out.svgSize[1] * 2, JSON.stringify([out.size, out.svgSize]));
ok("the SVG is well-formed and escapes text", out.svg.startsWith("<svg") && out.svg.includes("401 &amp; &lt;tags&gt;") && out.svg.includes("&quot;quoted&quot;") && !/NaN|undefined/.test(out.svg));
// an SVG shown as an image cannot load the web font, so its letters differ a little; lines and fills must not
ok("the PNG and the SVG show the same picture", out.diff / out.ink < 0.25, `${out.diff} of ${out.ink} inked pixels differ (${((out.diff / out.ink) * 100).toFixed(1)}%)`);
ok("exporting a selection takes only what is selected", out.part.includes("Signed in?") && out.part.includes("401") && !out.part.includes("Request"));
ok("an empty board gives nothing to save", out.empty === null);
// the menu offers it
await page.mouse.click(1100, 600, { button: "right" }); const rows = await page.locator('[role="menuitem"]').allInnerTexts(); await page.keyboard.press("Escape");
ok("right-click offers the three ways out", ["Copy as image", "Save as PNG", "Save as SVG"].every((l) => rows.some((r) => r.startsWith(l))), rows.join(" | "));
const [dl] = await Promise.all([page.waitForEvent("download"), (async () => { await page.mouse.click(1100, 600, { button: "right" }); await page.getByRole("menuitem", { name: "Save as SVG" }).click(); })()]);
ok("Save as SVG downloads a file", dl.suggestedFilename() === "canvas.svg", dl.suggestedFilename());
// side by side, to look at
await page.setContent(`<body style="margin:0;background:#888"><img src="${out.b64}" style="width:${out.svgSize[0]}px;display:block"><div style="height:8px"></div><img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(out.svg)}" style="display:block"></body>`);
await page.setViewportSize({ width: out.svgSize[0], height: out.svgSize[1] * 2 + 8 }); await page.waitForTimeout(300); await page.screenshot({ path: new URL("./shots/export-both.png", import.meta.url).pathname });
console.log(`\n${pass} passed, ${fail} failed`, errs.filter((e) => !e.includes("404"))); await close();
