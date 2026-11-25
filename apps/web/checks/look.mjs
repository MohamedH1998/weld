// node checks/look.mjs <file> — draws every moment of the diagrams a file exports (as TRIAL, or its only StampDef[] export),
// all at one camera so nothing jumps, with the wires that play in each moment coloured (blue runs, violet runs back, red refused or lost), and writes one sheet per diagram to checks/shots/look-<slug>.png. Look at it before you finish.
//   e.g. node checks/look.mjs ../../packages/canvas/src/trial/mine.ts     (pnpm dev running on :3100)
import { chromium } from "playwright-core";
import { execSync } from "node:child_process";
import { resolve, relative } from "node:path";
import { existsSync, readFileSync } from "node:fs";
const file = relative(process.cwd(), resolve(process.argv[2] ?? "")).replace(/\\/g, "/");
// (the engine's own diagrams, templates and trials are in the package, which the dev server serves from where it lies)
const PKG = "../../packages/canvas/src/";
if (!file.startsWith("src/") && !file.startsWith(PKG)) { console.error("give a file under src/ or the engine's src, e.g. ../../packages/canvas/src/trial/mine.ts"); process.exit(1); }
const url = file.startsWith(PKG) ? "/@fs" + resolve(file) : "/" + file;
const TEMPLATES = PKG + "templates";
const out = resolve("checks/shots"); execSync(`mkdir -p ${out}`);
const b = await chromium.launch({ channel: "chrome" }), page = await b.newPage({ viewport: { width: 1100, height: 680 }, deviceScaleFactor: 1.5 });
const errs = []; page.on("pageerror", (e) => errs.push(String(e).slice(0, 300)));
// (the board settles after it loads: wait for it, and for its fonts, before drawing anything)
await page.goto("http://localhost:3100/?demo=1&scene=blank&theme=light"); await page.waitForFunction(() => window.__editor, null, { timeout: 60000 }); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(1500);
await page.addStyleTag({ content: ".board-ui, [class*='absolute']:not(canvas) { visibility: hidden !important; }" });
const load = `const m = await import("${url}?t=" + Date.now()); const list = m.TRIAL ? [m.TRIAL, ...(m.PATTERNS ?? [])].flat() : Object.values(m).find((v) => Array.isArray(v) && v[0]?.slug);`;
const info = await page.evaluate(new Function(`return (async () => { ${load} const lint = (r) => { const out = [], M = r.moments, SM = ["meter","gauge","bars","queue","window"]; const lost = new Set(); for (const m of M) { const ids = new Set(m.shapes.map((x) => x.id)); for (const x of m.shapes) if (x.kind === "arrow") for (const e of [x.a, x.b]) if (e.bind && !ids.has(e.bind.id)) lost.add("the " + x.id + " wire joins \u201c" + e.bind.id + "\u201d, which is not in the drawing, so the board will not load: join it to a thing's id (s, not s.r)"); } out.push(...lost); for (const x of M[M.length - 1].shapes) if (x.kind === "timeline" && x.levels?.length > 1) { const at = x.levels, top = Math.max(...at) || 1, nm = (x.text || "").split("\\n"), px = at.map((a) => (x.w * a) / top); for (let i = 0; i + 1 < at.length; i++) if (px[i + 1] - px[i] < (nm[i] || "").length * 7.5 + 16) out.push("the " + x.id + " stops “" + nm[i] + "” and “" + nm[i + 1] + "” are too close for their names, so the names stack and read as one: shorten the names to two or three words, or space the stops wider"); } const BX = ["card","panel","machine","pill","tank","queue","window","segments"], CT = ["boundary","zone","frame","lane","hatch"], end1 = M[M.length - 1].shapes.filter((x) => x.kind !== "arrow" && x.kind !== "text"), bx = end1.filter((x) => BX.includes(x.kind)), inside = (a, c) => a.x >= c.x - 1 && a.y >= c.y - 1 && a.x + a.w <= c.x + c.w + 1 && a.y + a.h <= c.y + c.h + 1; const held = (a) => end1.some((c) => c !== a && BX.includes(c.kind) && inside(a, c)); for (let i = 0; i < bx.length; i++) for (let j = i + 1; j < bx.length; j++) { const a = bx[i], b = bx[j]; if (held(a) || held(b) || inside(a, b) || inside(b, a)) continue; const gx = Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w), gy = Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h); if (Math.max(gx, gy) < 24) out.push("the " + a.id.split("~")[0] + " and " + b.id.split("~")[0] + " touch: leave 24 px or more between things"); } for (const c of end1.filter((x) => CT.includes(x.kind))) for (const a of bx) if (inside(a, c) && Math.min(a.x - c.x, a.y - c.y, c.x + c.w - a.x - a.w, c.y + c.h - a.y - a.h) < 12) out.push("the " + a.id.split("~")[0] + " is flush with the edge of " + c.id.split("~")[0] + ": make it narrower or move it in, 20 px or more from the edge"); const bare = (m) => JSON.stringify(m.shapes.map(({ fine, tone, ...x }) => x).sort((a, b) => (a.id < b.id ? -1 : 1))); for (let k = 1; k < M.length; k++) if (bare(M[k]) === bare(M[k - 1])) out.push("moment " + (k + 1) + " only lights or un-lights what moment " + k + " showed: it adds nothing, so cut it or let it change something"); const L = M[M.length - 1].shapes, byI = Object.fromEntries(L.map((x) => [x.id, x])); const notchY = (b) => { const hd = b.head ?? 30; return b.kind === "panel" && b.h >= hd + 12 ? b.y + hd : b.y + b.h / 2; }; for (const x of L) if (x.kind === "arrow" && x.route === "straight" && !x.via && x.a.bind && x.b.bind) { const A = byI[x.a.bind.id], B = byI[x.b.bind.id], side = (e) => e.bind.ay === 0.5 && (e.bind.ax === 0 || e.bind.ax === 1); if (A && B && side(x.a) && side(x.b)) { const d = Math.round(notchY(A) - notchY(B)); if (Math.abs(d) >= 2) out.push("the " + x.id + " wire runs between notches " + Math.abs(d) + " px apart, so its head misses the notch: move " + B.id.split("~")[0] + " " + (d > 0 ? "down" : "up") + " " + Math.abs(d) + " px (a panel's notch is at its header line, 52 px from its top; a card's at its middle)"); } } const at = (e) => { const b = e.bind && byI[e.bind.id]; if (!b) return e; const side = e.bind.ay === 0.5 && (e.bind.ax === 0 || e.bind.ax === 1); return { x: b.x + e.bind.ax * b.w, y: side ? notchY(b) : b.y + e.bind.ay * b.h }; }; for (const x of L) if (x.kind === "arrow" && x.route === "elbow" && !x.via && x.a.bind && x.b.bind) { const p0 = at(x.a), p1 = at(x.b), dy = Math.round(Math.abs(p0.y - p1.y)); if (dy >= 2 && dy < 30) out.push("the " + x.id + " wire jogs only " + dy + " px, so its corners crowd and it looks broken: line its ends up exactly (move " + x.b.bind.id.split("~")[0] + " by " + dy + " px), or make the drop 30 px or more"); } const life = L.filter((x) => x.kind === "arrow" && !!x.a.bind !== !!x.b.bind && Math.abs(at(x.a).x - at(x.b).x) < 2), lifeX = life.map((x) => at(x.a).x), rows = L.filter((x) => x.kind === "ticks"), onRow = (e) => rows.some((r) => e.x >= r.x - 2 && e.x <= r.x + r.w + 2 && e.y >= r.y - 3 && e.y <= r.y + r.h + 3), onLife = (e) => !!e.bind || lifeX.some((v) => Math.abs(v - e.x) < 3) || onRow(e); for (const x of L) if (x.kind === "arrow" && !x.fine?.dot && !life.includes(x) && !(onLife(x.a) && onLife(x.b))) out.push("the " + x.id + " wire starts or ends on nothing: join both ends to things (or, in the turns template, to two parties\u2019 lines; or, between lanes, from one activity row to the other with handover()), or take it out"); const joined = new Set(M.flatMap((m) => m.shapes.filter((x) => x.kind === "arrow").flatMap((x) => [x.a.bind?.id, x.b.bind?.id]))); for (const pn of L.filter((x) => x.kind === "panel")) { const said = new Set(M.map((m) => (m.shapes.find((x) => x.id === pn.id + "d") || {}).text).filter(Boolean)); if (!joined.has(pn.id) && said.size >= 3) out.push("the " + pn.id + " panel narrates: nothing joins it, it only says what is happening elsewhere. Show that change in the picture itself and take the panel out"); } const both = {}; for (const m of M) for (const x of m.shapes) if (x.kind === "arrow" && x.heads === "both" && x.run) (both[x.id] ??= new Set()).add(x.text || ""); for (const [id, t] of Object.entries(both)) if (t.size >= 2) out.push("the " + id + " wire has a head at each end but carries messages (" + [...t].join(", ") + "): each message goes one way, so give it one head and run it, or back it for the answer"); const wrongWay = new Set(); for (const m of M) for (const x of m.shapes) if (x.kind === "arrow" && (!x.a.bind || !x.b.bind) && x.run && x.run !== "pour") wrongWay.add(x.id); for (const id of wrongWay) out.push("the " + id + " message is played back or refused: in a sequence every message runs forward, from the line it is drawn from. An answer is a message of its own, a row lower, drawn from the one answering and run; a no is a message too, with tone red"); if (M.length > 11) out.push(M.length + " moments: keep it to 4 to 11"); const vals = {}; for (const m of M) for (const x of m.shapes) if (SM.includes(x.kind)) (vals[x.id] ??= new Set()).add(JSON.stringify([x.value ?? 0, x.text, x.levels])); for (const [id, v] of Object.entries(vals)) if (v.size < 2) out.push("the " + id.split("~")[0] + " mark never changes: let it carry the change, or take it out"); const tones = new Set(M.flatMap((m) => m.shapes.map((x) => x.tone)).filter((t) => t && !["ink","muted","accent"].includes(t))); const kinds = new Set(M.flatMap((m) => m.shapes.map((x) => x.kind))); if (kinds.has("timeline") && ["card","panel","machine","pill","arrow"].some((k) => kinds.has(k))) out.push("a timeline stands alone: take out the cards, panels, pills and wires beside it, or use another shape"); if (tones.size > 2) out.push("colours " + [...tones].join(", ") + ": keep to two besides blue"); const last = M[M.length - 1].shapes, byId = Object.fromEntries(last.map((x) => [x.id, x])); const end = (e) => { const b = e.bind && byId[e.bind.id]; return b ? { x: b.x + e.bind.ax * b.w, y: b.y + e.bind.ay * b.h } : e; }; for (const x of last) if (x.kind === "arrow" && x.route === "straight" && !x.via) { const a = end(x.a), b = end(x.b); if (Math.abs(a.x - b.x) > 12 && Math.abs(a.y - b.y) > 12) out.push("the " + x.id + " wire runs at an angle: line its ends up, or give it an elbow"); } return out; }; return list.map((d) => { try { const r = d.moments ? d.moments() : { moments: [{ shapes: d.build() }] }; return { slug: d.slug, name: d.name, n: r.moments.length, warn: lint(r) }; } catch (e) { return { slug: d.slug, err: String(e).slice(0, 400) }; } }); })()`));
// another file saved while drawing reloads the page under us: then the diagram is drawn again from the start
const settle = async () => { await page.goto("http://localhost:3100/?demo=1&scene=blank&theme=light"); await page.waitForFunction(() => window.__editor, null, { timeout: 60000 }); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(1500); await page.addStyleTag({ content: ".board-ui, [class*='absolute']:not(canvas) { visibility: hidden !important; }" }); await page.evaluate(() => { window.__look = true; }); };
await page.evaluate(() => { window.__look = true; });
for (const [i, d] of info.entries()) {
  if (d.err) { console.log(`${d.slug}: ${d.err}`); continue; }
  for (let attempt = 0; attempt < 4; attempt++) { try {
  // one camera for every moment: the whole of what any moment shows
  await page.evaluate(new Function("i", `return (async () => { ${load} const r = list[i].moments ? list[i].moments() : { moments: [{ shapes: list[i].build() }] }; const e = window.__editor, s = e.store; s.remove([...s.doc.order]); s.run(() => s.put(...r.moments.flatMap((m, k) => m.shapes.map((x) => ({ ...x, id: x.id + "~" + k }))))); e.fit(); })()`), i);
  await page.waitForTimeout(900);
  await page.evaluate(() => { const s = window.__editor.store; window.__cam = { ...s.cam }; s.remove([...s.doc.order]); });
  var files = [];
  for (let at = 0; at < d.n; at++) {
    await page.evaluate(new Function("a", `return (async () => { ${load} const r = list[a[0]].moments ? list[a[0]].moments() : { moments: [{ shapes: list[a[0]].build() }] }; const e = window.__editor, s = e.store; s.remove([...s.doc.order]); const mark = (x) => x.kind === "arrow" && x.run ? { ...x, run: undefined, ...(x.run === "back" ? { a: x.b, b: x.a } : {}), tone: x.run === "squash" || x.run === "fizzle" ? "red" : x.run === "back" ? "violet" : "accent", fine: x.fine ? { ...x.fine, line: undefined, w: Math.max(2.5, x.fine.w ?? 2) } : undefined } : x; const want = r.moments[a[1]].shapes.map(mark); window.__want = want.map((x) => x.id); s.run(() => s.put(...want)); s.select([]); s.cam = { ...window.__cam }; s.emit(); })()`), [i, at]);
    // the board holds exactly this moment: nothing left over from the page's own demo, nothing missing
    await page.waitForFunction(() => { const o = window.__editor.store.doc.order, w = window.__want || []; return o.length === w.length && w.every((id) => window.__editor.store.doc.shapes[id]); }, null, { timeout: 15000 }).catch(() => { throw new Error("reloaded"); });
    await page.mouse.move(1090, 670); await page.waitForTimeout(350);
    if (!(await page.evaluate(() => window.__look === true && Number.isFinite(window.__editor.store.cam.z)))) throw new Error("reloaded");
    const f = `${out}/look-${d.slug}-${at + 1}.png`;
    // a shot can land before the board has drawn: an empty page is taken again, not judged
    for (let t = 0; t < 4; t++) { await page.screenshot({ path: f }); if (execSync(`python3 -c "from PIL import Image; lo,hi=Image.open('${f}').convert('L').getextrema(); print(hi-lo)"`).toString().trim() > 40) break; await page.waitForTimeout(700); }
    files.push(f);
  }
  break; } catch (e) { if (attempt === 3) throw e; await settle(); } }
  execSync(`python3 -c "
from PIL import Image, ImageDraw
fs=${JSON.stringify(files).replace(/"/g, "'")}
ims=[Image.open(f).convert('RGB').resize((660,408)) for f in fs]
c=3; r=(len(ims)+c-1)//c
s=Image.new('RGB',(c*660,r*408),'white'); d=ImageDraw.Draw(s)
for k,im in enumerate(ims): s.paste(im,((k%c)*660,(k//c)*408)); d.rectangle([(k%c)*660,(k//c)*408,(k%c)*660+659,(k//c)*408+407],outline=(220,220,220)); d.text(((k%c)*660+10,(k//c)*408+8),'moment '+str(k+1)+'   (wires that play in this moment: blue runs forward, violet runs back, red is refused or lost)',fill=(220,0,0))
s.save('${out}/look-${d.slug}.png')"`, { stdio: "ignore" });
  console.log(`${d.slug}: ${d.n} moments -> checks/shots/look-${d.slug}.png (each moment also as look-${d.slug}-<n>.png)`);
  for (const w of d.warn ?? []) console.log(`  fix: ${w}`);
  // what the pictures themselves show: a moment drawn exactly as the one before, ink cut off by the frame
  process.stdout.write(execSync(`python3 -c "
from PIL import Image, ImageChops
fs=${JSON.stringify(files).replace(/"/g, "'")}
ims=[Image.open(f).convert('L') for f in fs]
for k in range(1,len(ims)):
  if ImageChops.difference(ims[k],ims[k-1]).getbbox() is None: print('  fix: moment '+str(k+1)+' looks exactly like moment '+str(k)+': make it change something the reader can see, or drop it')
cut=set()
for k,im in enumerate(ims):
  w,h=im.size; px=im.load()
  for name,pts in (('left',[(x,y) for x in range(2) for y in range(h)]),('right',[(w-1-x,y) for x in range(2) for y in range(h)]),('top',[(x,y) for y in range(2) for x in range(w)]),('bottom',[(x,h-1-y) for y in range(2) for x in range(w)])):
    if any(px[p]<170 for p in pts): cut.add(name)
for n in sorted(cut): print('  fix: something is cut off at the '+n+' edge of the picture: words or marks lie outside the drawing (a label set to end at a negative x?); move them inside')
"`).toString());
}
// a diagram started from a template keeps its picture: the main mark stays, and at most two more cards or panels
{
  const src = readFileSync(file, "utf8"), tm = /^\/\/ template: (\w+)/m.exec(src);
  const boxes = (t) => (t.match(/\b(card|panel|machine)\(|kind: "(card|panel|machine)"/g) ?? []).length;
  if (!tm && file.includes("/trial/")) console.log(`  fix: start from a template: copy one of ${TEMPLATES}/*.ts and keep its first line`);
  // the catalogue is read, not skipped: a new diagram names the accepted one nearest to it, whose sheet it has looked at
  if (file.includes("/trial/") || /\/explore\d*\//.test(file)) {
    const slugs = new Set([...readFileSync("src/canvas/catalogue.ts", "utf8").matchAll(/slug: "([^"]+)"/g)].map((m) => m[1])), near = /^\/\/ nearest: ([\w-]+)/m.exec(src)?.[1];
    if (!near || !slugs.has(near)) console.log(`  fix: name the catalogue diagram nearest to yours: open CATALOGUE.md, find the entry whose Shows line is closest to your sentence, open its sheet catalogue/<slug>.png with the image reader, borrow what its Borrow line says, and write "// nearest: <slug>" near the top of your file${near ? ` ("${near}" is not in the catalogue)` : ""}`);
  }
  else if (tm && existsSync(`${TEMPLATES}/${tm[1]}.ts`) && !file.includes("/templates/")) {
    const t = readFileSync(`${TEMPLATES}/${tm[1]}.ts`, "utf8"), main = /main mark: (\w+)/.exec(t)?.[1];
    if (main && !new RegExp(`\\b${main}\\(|kind: "${main}"`).test(src)) console.log(`  fix: the ${tm[1]} template's main mark (${main}) is gone: put it back, or pick another template`);
    if (/\btimeline\(/.test(src)) console.log("  fix: the dots-on-a-line timeline is retired: show time as a strip of periods (copy the periods template)");
    if (/\bwin\(/.test(src)) console.log("  fix: the window mark is retired: show the entries as a segments strip, the found one picked");
    if (/\btank\(/.test(src)) console.log("  fix: the tank mark is retired: show the level as a segments strip (filled and empty parts) or a queue");
    if (/curve: true/.test(src)) console.log("  fix: wires are square: give them elbow: true (or none, if their ends line up), never curve");
    if ((src.match(/\btimeline\(/g) ?? []).length > 1) console.log("  fix: more than one timeline: the rows cannot be told apart and nothing says who each is. One timeline per drawing; for two parties taking turns, use the turns template; for one copying another, the handoff template");
    if (boxes(src) > boxes(t) + 2) console.log(`  fix: ${boxes(src)} cards and panels where the ${tm[1]} template has ${boxes(t)}: keep to two more at most, or pick the handoff template`);
  }
  if (/\/explore\d*\//.test(file)) {
    if (/\b(timeline|win|tank)\(/.test(src)) console.log("  fix: the window, tank and timeline marks are retired: rows, levels and time are drawn as segments strips (or a mark of your own)");
    if (/curve: true/.test(src)) console.log("  fix: wires are square: give them elbow: true (or none, if their ends line up), never curve");
  }
}
if (errs.length) console.log("page errors:", errs.join(" | "));
await b.close();
