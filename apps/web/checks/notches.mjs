// node checks/notches.mjs [file] — measures, in every moment of every diagram, where each wire is actually drawn against the
// notches of what it joins: an end that lands on a side with a notch must land in it. Prints each miss, worst first. (pnpm dev on :3100.)
import { chromium } from "playwright-core";
import { withEngine } from "./lib.mjs";
const file = process.argv[2] ?? "src/canvas/accepted.ts";
const b = await chromium.launch({ channel: "chrome" }), c = await b.newContext(); await withEngine(c); const p = await c.newPage();
await p.goto("http://localhost:3100/?demo=1&scene=blank&theme=light"); await p.waitForFunction(() => window.__editor);
const out = await p.evaluate(async (file) => {
  const m = await import("/" + file + "?t=" + Date.now()), g = await __engine("geometry"), k = await __engine("kinds"), st = await __engine("stamps");
  const list = m.TRIAL ? [m.TRIAL].flat() : Object.values(m).find((v) => Array.isArray(v) && v[0]?.slug);
  const miss = [];
  for (const d0 of list) {
    let r; try { const d = st.stamp(d0); r = d.moments ? d.moments() : { moments: [{ shapes: d.build() }] }; } catch { continue; }
    r.moments.forEach((mo, i) => {
      const doc = { shapes: Object.fromEntries(mo.shapes.map((x) => [x.id, x])), order: mo.shapes.map((x) => x.id) };
      for (const a of mo.shapes) {
        if (a.kind !== "arrow" || a.away) continue;
        let pts; try { pts = g.arrowPath(doc, a); } catch { continue; }
        for (const [e, pt] of [[a.a, pts[0]], [a.b, pts[pts.length - 1]]]) {
          const s = e?.bind && doc.shapes[e.bind.id];
          if (!s || !pt || s.kind === "arrow" || s.kind === "text" || s.kind === "junction" || s.kind === "pad" || s.rot) continue;
          // the side it lands on, and where that side's notches are
          const dl = Math.abs(pt.x - s.x), dr = Math.abs(pt.x - s.x - s.w), dt = Math.abs(pt.y - s.y), db = Math.abs(pt.y - s.y - s.h), near = Math.min(dl, dr, dt, db);
          if (near > 16) continue;
          const side = near === dl ? "l" : near === dr ? "r" : near === dt ? "t" : "b";
          const seam = s.kind === "panel" ? Math.min(s.head ?? 30, s.h) : 0, spots = [];
          if (k.hasNotch(s, side)) spots.push(side === "l" || side === "r" ? s.y + s.h / 2 : s.x + s.w / 2);
          if (seam && (side === "l" || side === "r") && s.h >= seam + 12) spots.push(s.y + seam);
          if (!spots.length) continue;
          const at = side === "l" || side === "r" ? pt.y : pt.x, off = Math.min(...spots.map((q) => Math.abs(q - at)));
          // ends spread along a side on purpose (several wires to one side) are left alone
          if (off > 1.5 && off < 40) miss.push({ slug: d0.slug, moment: i + 1, wire: a.id, to: s.id, side, off: Math.round(off * 10) / 10 });
        }
      }
    });
  }
  return miss;
}, file);
const seen = new Map();
for (const x of out) { const k2 = `${x.slug} ${x.wire}→${x.to}`; if (!seen.has(k2) || seen.get(k2).off < x.off) seen.set(k2, x); }
const rows = [...seen.values()].sort((a, b) => b.off - a.off);
for (const x of rows) console.log(`${x.slug.padEnd(26)} ${x.wire} → ${x.to} (${x.side})  ${x.off}px off the notch  (moment ${x.moment})`);
console.log(`${rows.length} wire ends off their notch`);
await b.close();
