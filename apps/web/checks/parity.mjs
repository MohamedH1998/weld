// Parity with weld. For every gold-standard diagram: how far our wires, header rules and words are
// from where weld draws them (in board px), and a picture of ours laid over weld's.
//   node checks/parity.mjs            (pnpm dev running; run pnpm import:gold first)
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { open } from "./lib.mjs";
const { page, errs, close } = await open({ w: 1200, h: 900 });
const dir = new URL("./gold/", import.meta.url), U = 2;
let worst = 0, failures = 0; const LIMIT = 2;
for (const file of readdirSync(dir).filter((f) => /^[a-z-]+\.json$/.test(f) && (!process.env.ONLY || f.startsWith(process.env.ONLY))).sort()) {
  const slug = file.replace(".json", ""), ref = JSON.parse(readFileSync(new URL(file, dir)));
  const png = "data:image/png;base64," + readFileSync(new URL(slug + ".png", dir)).toString("base64");
  const r = await page.evaluate(async ({ slug, ref, png, U, shift }) => {
    const [G, Geo, Sh, R, X] = await Promise.all([import("/src/canvas/gold.ts"), __engine("geometry"), __engine("shapes"), __engine("render"), __engine("export")]);
    // drawn in weld's own faces (its labels are DM Mono), whatever the board's default
    (await import("/src/canvas/parity.ts")).inWeldFaces(); await Promise.all([document.fonts.load('400 12px "DM Mono"'), document.fonts.load('500 12px "DM Mono"')]);
    const def = G.GOLD.find((g) => g.slug === slug); if (!def) return { missing: true };
    const shapes = def.build(), doc = { shapes: Object.fromEntries(shapes.map((s) => [s.id, s])), order: shapes.map((s) => s.id) };
    const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const out = { wires: [], rules: [], texts: [] };
    // wires: each of weld's must have one of ours ending in the same two places
    const ours = shapes.filter((s) => s.kind === "arrow").map((a) => { const p = Geo.arrowPath(doc, a), turn = a.square ? 0 : R.ELBOW_R; let len = 0; for (let i = 1; i < p.length; i++) len += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
      // each corner is cut with a quadratic curve, which is shorter than the square corner by this much
      for (let i = 1; i < p.length - 1; i++) { const r = Math.min(turn, Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y) / 2, Math.hypot(p[i + 1].x - p[i].x, p[i + 1].y - p[i].y) / 2); len -= r * (2 - 1.6232); }
      return { a: [p[0].x, p[0].y], b: [p[p.length - 1].x, p[p.length - 1].y], len }; });
    for (const w of ref.expect.wires) {
      const p0 = w.p0.map((v) => v * U), p1 = w.p1.map((v) => v * U);
      let best = Infinity, lenOff = 0;
      for (const o of ours) { const e = Math.min(Math.max(d(o.a, p0), d(o.b, p1)), Math.max(d(o.a, p1), d(o.b, p0))); if (e < best) { best = e; lenOff = Math.abs(o.len - w.len * U); } }
      out.wires.push({ at: w.p0.join(",") + "→" + w.p1.join(","), ends: best, len: lenOff });
    }
    // header rules: ours sit under a header band of exactly weld's height
    const bands = shapes.filter((s) => s.kind === "machine" || s.kind === "panel").map((b) => ({ y: b.y + Sh.header(b).h, x0: b.x, x1: b.x + b.w }));
    for (const rule of ref.expect.rules) { let best = Infinity; for (const b of bands) if (Math.abs(b.x0 - rule.x0 * U) < 8) best = Math.min(best, Math.abs(b.y - rule.y * U)); out.rules.push({ at: `y${rule.y}`, off: best }); }
    // words: the same line (vertical middle) and the same edge they are set from
    const placed = [];
    for (const s of shapes) {
      if (s.kind === "text") placed.push({ s: s.text, x: s.x, r: s.x + s.w, cx: s.x + s.w / 2, cy: s.y + s.h / 2 });
      else if (s.kind !== "arrow" && s.text) { const sp = Sh.labelSpot(s); placed.push({ s: s.text, x: sp.x, r: sp.x + sp.w, cx: sp.x + sp.w / 2, cy: sp.y + sp.h / 2, spot: sp.align }); }
    }
    for (const t of ref.expect.texts) {
      const key = t.s.toLowerCase(), mine = placed.filter((p) => p.s.toLowerCase() === key).sort((a, b) => Math.hypot(a.cx - t.cx * U, a.cy - t.cy * U) - Math.hypot(b.cx - t.cx * U, b.cy - t.cy * U))[0];
      if (!mine) { out.texts.push({ s: t.s, off: Infinity }); continue; }
      const dy = Math.abs(mine.cy - t.cy * U);
      const dx = mine.spot === "center" || t.a === "middle" ? Math.abs(mine.cx - t.cx * U) : t.a === "end" ? Math.abs(mine.r - t.r * U) : Math.abs(mine.x - t.x * U);
      out.texts.push({ s: t.s, off: Math.max(dx, dy), dx, dy });
    }
    // the two pictures themselves, pixel for pixel, on weld's own raster (src/canvas/parity.ts)
    const P = await import("/src/canvas/parity.ts"), c = await P.compare(def, ref, png, shift);
    return { ...out, diff: c.diff.toDataURL("image/png"), ours: c.ours.toDataURL("image/png"), weld: c.weld.toDataURL("image/png"), pixels: { n: c.drawn, bad: c.differ }, lag: c.slid };
  }, { slug, ref, png, U, shift: (process.env.SHIFT ?? "0,0").split(",").map(Number) });
  if (r.missing) { console.log(`${slug}: not in gold.ts`); failures++; continue; }
  // every moment it moves through, against weld's picture of that same instant
  const each = [];
  for (let i = 0; i < (ref.moments ?? 0); i++) {
    const mref = JSON.parse(readFileSync(new URL(`${slug}.${i}.json`, dir))), mpng = "data:image/png;base64," + readFileSync(new URL(`${slug}.${i}.png`, dir)).toString("base64");
    const m = await page.evaluate(async ({ slug, i, mref, mpng }) => { const [G, P] = await Promise.all([import("/src/canvas/gold.ts"), import("/src/canvas/parity.ts")]); P.inWeldFaces(); const def = G.GOLD.find((g) => g.slug === slug), shapes = def.moments().moments[i].shapes; const c = await P.compare({ ...def, build: () => shapes }, mref, mpng); return { pct: (c.differ / Math.max(1, c.drawn)) * 100, diff: c.pct > 2 ? null : null, d: c.diff.toDataURL("image/png"), o: c.ours.toDataURL("image/png"), w: c.weld.toDataURL("image/png") }; }, { slug, i, mref, mpng });
    each.push(m.pct);
    if (m.pct > LIMIT) for (const [k, v] of [["diff", m.d], ["ours", m.o], ["weld", m.w]]) writeFileSync(new URL(`./shots/gold/${slug}.${i}-${k}.png`, import.meta.url), Buffer.from(v.split(",")[1], "base64"));
  }
  writeFileSync(new URL(`./shots/gold/${slug}-diff.png`, import.meta.url), Buffer.from(r.diff.split(",")[1], "base64"));
  for (const k of ["ours", "weld"]) writeFileSync(new URL(`./shots/gold/${slug}-${k}.png`, import.meta.url), Buffer.from(r[k].split(",")[1], "base64"));
  const stray = (r.pixels.bad / Math.max(1, r.pixels.n)) * 100;
  const max = (xs, k) => xs.reduce((m, v) => Math.max(m, v[k]), 0);
  const w = max(r.wires, "ends"), wl = max(r.wires, "len"), ru = max(r.rules, "off"), tx = max(r.texts, "off");
  const bad = [...r.wires.filter((v) => v.ends > 0.5).map((v) => `wire ${v.at} ends ${v.ends.toFixed(1)}px off`), ...r.wires.filter((v) => v.len > 0.5).map((v) => `wire ${v.at} runs ${v.len.toFixed(1)}px differently`), ...r.rules.filter((v) => v.off > 0.25).map((v) => `rule ${v.at} ${v.off.toFixed(1)}px off`), ...(stray > LIMIT ? [`${stray.toFixed(2)}% of drawn pixels differ from weld's (see shots/gold/${slug}-diff.png)`] : []), ...r.texts.filter((v) => v.off > 0.75).map((v) => `"${v.s}" ${Number.isFinite(v.off) ? `${v.dx.toFixed(1)}px across, ${v.dy.toFixed(1)}px down` : "missing"}`)];
  worst = Math.max(worst, w, ru, Number.isFinite(tx) ? tx : 99);
  const off = each.map((p, i) => [p, i]).filter(([p]) => p > LIMIT);
  if (off.length) bad.push(`moment${off.length === 1 ? "" : "s"} ${off.map(([p, i]) => `${i + 1} (${p.toFixed(1)}%)`).join(", ")} of ${each.length} differ from weld's (see shots/gold/${slug}.<n>-diff.png)`);
  if (bad.length) failures++;
  console.log(`${bad.length ? "FAIL" : "ok  "} ${slug.padEnd(24)} wire ends ${w.toFixed(1)} · wire runs ${wl.toFixed(1)} · rules ${ru.toFixed(1)} · words ${Number.isFinite(tx) ? tx.toFixed(1) : "—"}   (px off, worst) · pixels ${stray.toFixed(2)}% differ · ${each.length} moments, worst ${each.length ? Math.max(...each).toFixed(2) : "—"}%${r.lag[0] || r.lag[1] ? ` (slid ${r.lag.join(",")}px to register)` : ""}${bad.length ? "\n       " + bad.slice(0, 8).join("\n       ") : ""}`);
}
console.log(`\n${failures ? failures + " diagrams differ from weld" : "all diagrams match weld"}; worst offset ${worst.toFixed(1)}px`, errs.filter((e) => !e.includes("404")));
await close();
process.exit(failures ? 1 : 0);
