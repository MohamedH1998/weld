// Random real input against the canvas, with invariants checked after every action.
import { open } from "./lib.mjs";
const seed0 = Number(process.argv[2] ?? 1), runs = Number(process.argv[3] ?? 3), steps = Number(process.argv[4] ?? 300);
const W = 1280, H = 800;
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const check = (page) => page.evaluate(() => {
  const e = window.__editor, s = e.store, d = s.doc, bad = [];
  const fin = (v) => typeof v === "number" && Number.isFinite(v);
  if (new Set(d.order).size !== d.order.length) bad.push("duplicate ids in order");
  if (Object.keys(d.shapes).length !== d.order.length) bad.push("shapes/order mismatch");
  for (const id of d.order) {
    const sh = d.shapes[id]; if (!sh) { bad.push("order id missing " + id); continue; }
    if (sh.kind === "arrow") {
      for (const k of ["a", "b"]) { const en = sh[k]; if (!fin(en.x) || !fin(en.y)) bad.push("arrow end NaN"); if (en.bind) { const b = d.shapes[en.bind.id]; if (!b) bad.push("arrow bound to missing shape"); else if (b.kind === "arrow" || b.kind === "text") bad.push("arrow bound to " + b.kind); if (!fin(en.bind.ax) || !fin(en.bind.ay) || en.bind.ax < 0 || en.bind.ax > 1 || en.bind.ay < 0 || en.bind.ay > 1) bad.push("bad anchor"); } }
      if (sh.a.bind && sh.b.bind && sh.a.bind.id === sh.b.bind.id) bad.push("arrow from a box to itself");
    } else {
      if (![sh.x, sh.y, sh.w, sh.h].every(fin)) bad.push(sh.kind + " NaN");
      if (sh.rot !== undefined && (!fin(sh.rot) || sh.rot === 0 || Math.abs(sh.rot) > Math.PI + 1e-9)) bad.push("bad angle " + sh.rot);
      if (sh.kind !== "text" && (sh.w < 5.99 || sh.h < 5.99)) bad.push(`${sh.kind} too small ${sh.w}x${sh.h}`);
      if (sh.kind === "text" && !sh.text && s.editing !== id) bad.push("empty text left behind");
    }
  }
  for (const id of s.sel) if (!d.shapes[id]) bad.push("selection holds a missing id");
  if (s.editing && !d.shapes[s.editing]) bad.push("editing a missing id");
  if (!fin(s.cam.x) || !fin(s.cam.y) || !fin(s.cam.z) || s.cam.z < 0.049 || s.cam.z > 8.01) bad.push("camera " + JSON.stringify(s.cam));
  if (e.g.type !== "idle") bad.push("gesture stuck: " + e.g.type);
  if (!!s.editing !== !!document.querySelector("[contenteditable]")) bad.push("editing flag and text box disagree");
  // every change to the board must be inside an undo step
  const now = { doc: d, stack: s.undoStack.length, redo: s.redoStack.length, pending: !!s.pending };
  const was = window.__was;
  if (was && was.doc !== d && !now.pending && !was.pending && now.stack === was.stack && now.redo === was.redo) {
    const same = was.doc.order.length === d.order.length && d.order.every((id, i) => id === was.doc.order[i] && d.shapes[id] === was.doc.shapes[id]);
    if (!same) bad.push("the board changed outside any undo step");
  }
  window.__was = now;
  return bad;
});
let failures = 0;
for (let run = 0; run < runs; run++) {
  const seed = seed0 + run, r = rng(seed);
  const { page, errs, close } = await open({ w: W, h: H });
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  const log = [];
  const spot = async () => {
    // half the time aim at something real: a centre, an edge, a corner, an arrow's middle, a stub
    if (r() < 0.6) {
      const pts = await page.evaluate(() => { const e = window.__editor, s = e.store, c = s.cam, out = []; for (const id of s.doc.order) { const sh = s.doc.shapes[id]; if (sh.kind === "arrow") { const pa = e.screen({ x: sh.a.x, y: sh.a.y }); out.push([pa.x, pa.y]); } else { const x = (sh.x - c.x) * c.z, y = (sh.y - c.y) * c.z, w = sh.w * c.z, h = sh.h * c.z; out.push([x + w / 2, y + h / 2], [x + 1, y + h / 2], [x + w, y + h], [x + w / 2, y - 20], [x + w + 20, y + h / 2], [x + w + 14, y - 14], [x + w * 0.3, y + h - 2]); } } return out; });
      if (pts.length) { const p = pick(pts); return [Math.max(2, Math.min(W - 2, p[0])), Math.max(2, Math.min(H - 2, p[1]))]; }
    }
    return [20 + r() * (W - 40), 20 + r() * (H - 40)];
  };
  const keys = ["v", "h", "r", "o", "d", "a", "t", "c", "j", "y", "b", "n", "g", "m", "i", "q", "u", "k", "x", "l", "f", "Escape", "Escape", "Enter", "Tab", "Shift+Tab", "Delete", "Backspace", "Meta+a", "Meta+c", "Meta+v", "Meta+x", "Meta+d", "Meta+g", "Meta+Shift+g", "Meta+z", "Meta+z", "Meta+Shift+z", "ArrowLeft", "ArrowDown", "Shift+ArrowRight", "Meta+ArrowRight", "Meta+ArrowDown", "Meta+ArrowUp", "Meta+ArrowLeft", "]", "[", "Shift+1", "Shift+0", "Shift+2", "Meta+=", "Meta+-"];
  const mods = [[], [], [], ["Shift"], ["Alt"], ["Meta"]];
  const act = async () => {
    const k = r();
    if (k < 0.2) { const key = pick(keys); log.push("key " + key); await page.keyboard.press(key); }
    else if (k < 0.3) { const t = pick(["ab", "Hello there", "x", "long label that wraps around a box", "é", " "]); log.push("type " + t); await page.keyboard.type(t); }
    else if (k < 0.45) { const [x, y] = await spot(); const m = pick(mods); log.push(`click ${x | 0},${y | 0} ${m}`); for (const q of m) await page.keyboard.down(q); await page.mouse.click(x, y); for (const q of m) await page.keyboard.up(q); }
    else if (k < 0.52) { const [x, y] = await spot(); log.push(`dblclick ${x | 0},${y | 0}`); await page.mouse.dblclick(x, y); }
    else if (k < 0.8) {
      const [x1, y1] = await spot(), [x2, y2] = r() < 0.5 ? await spot() : [x1 + (r() - 0.5) * 300, y1 + (r() - 0.5) * 300]; const m = pick(mods); const mid = r() < 0.2 ? pick(["Escape", "Meta+z", "Delete", "r", "v", "Tab"]) : null;
      log.push(`drag ${x1 | 0},${y1 | 0} -> ${x2 | 0},${y2 | 0} ${m} mid:${mid}`);
      for (const q of m) await page.keyboard.down(q);
      await page.mouse.move(x1, y1); await page.mouse.down(); const n = 2 + Math.floor(r() * 6);
      for (let i = 1; i <= n; i++) { await page.mouse.move(x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n); if (mid && i === 1) { for (const q of m) await page.keyboard.up(q); await page.keyboard.press(mid); } }
      if (r() < 0.3) await page.waitForTimeout(90);
      await page.mouse.up(); for (const q of m) await page.keyboard.up(q).catch(() => {});
    }
    else if (k < 0.85) { const [x, y] = await spot(); log.push(`rightclick ${x | 0},${y | 0}`); await page.mouse.click(x, y, { button: "right" }); await page.waitForTimeout(30); const items = await page.locator('[role="menuitem"]:not([disabled]), [role="menuitemcheckbox"]').all(); if (items.length && r() < 0.7) { const it = pick(items); log.push("  menu " + (await it.innerText().catch(() => "?")).split("\n")[0]); await it.click({ timeout: 800 }).catch(() => {}); } else await page.keyboard.press("Escape"); }
    else if (k < 0.92) { const zoom = r() < 0.5; const dx = (r() - 0.5) * 400, dy = (r() - 0.5) * 400; const [x, y] = await spot(); log.push(`wheel ${zoom ? "zoom" : "pan"} ${dx | 0},${dy | 0}`); await page.mouse.move(x, y); if (zoom) await page.keyboard.down("Meta"); await page.mouse.wheel(zoom ? 0 : dx, dy); if (zoom) await page.keyboard.up("Meta"); }
    else { const btns = await page.locator("button:visible:not([disabled])").all(); if (btns.length) { const b = pick(btns); log.push("button " + (await b.getAttribute("aria-label").catch(() => "?"))); await b.click({ timeout: 800 }).catch(() => {}); } }
  };
  let fail = null;
  for (let i = 0; i < steps && !fail; i++) {
    await act();
    await page.waitForTimeout(8);
    const bad = await check(page).catch((e) => ["check threw: " + e.message.slice(0, 200)]);
    const real = errs.filter((e) => !e.includes("404"));
    if (bad.length || real.length) fail = { i, bad, real };
  }
  if (!fail) {
    // leave any mode, then history must take the board back to empty and forward again exactly
    for (let i = 0; i < 3; i++) await page.keyboard.press("Escape");
    const st = await page.evaluate(() => { const s = window.__editor.store; return { tool: s.tool, sel: s.sel.size, editing: s.editing }; });
    if (st.tool !== "select" || st.sel || st.editing) fail = { i: "end", bad: ["3× Escape did not reach rest: " + JSON.stringify(st)], real: [] };
    const final = await page.evaluate(() => JSON.stringify(window.__editor.store.doc));
    const undone = await page.evaluate(() => { const e = window.__editor; let n = 0; while (e.store.canUndo && n < 2000) { e.history("undo"); n++; } return { n, left: e.store.doc.order.length }; });
    if (undone.left !== 0) fail = fail ?? { i: "end", bad: [`undo all left ${undone.left} shapes after ${undone.n} undos`], real: [] };
    const redone = await page.evaluate((n) => { const e = window.__editor; for (let i = 0; i < n; i++) e.history("redo"); return JSON.stringify(e.store.doc); }, undone.n);
    if (redone !== final) { const A = JSON.parse(final), B = JSON.parse(redone); const diff = []; for (const id of new Set([...A.order, ...B.order])) { const x = JSON.stringify(A.shapes[id]), y = JSON.stringify(B.shapes[id]); if (x !== y) diff.push(`final ${x}\n      redo  ${y}`); } if (A.order.join() !== B.order.join()) diff.push("order differs"); fail = fail ?? { i: "end", bad: ["redo all did not restore the final board", ...diff.slice(0, 3)], real: [] }; }
    console.log(`seed ${seed}: ${steps} actions, ${JSON.parse(final).order.length} shapes at the end, ${undone.n} undo steps ${fail ? "" : "— ok"}`);
  }
  if (fail) { failures++; console.log(`seed ${seed} FAILED at step ${fail.i}:`, fail.bad, fail.real, "\n  last actions:\n   " + log.slice(-12).join("\n   ")); }
  await close();
}
process.exit(failures ? 1 : 0);
