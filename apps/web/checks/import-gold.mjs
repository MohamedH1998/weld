// Brings weld's gold-standard diagrams onto the board.
//   node checks/import-gold.mjs        (weld running on :3000)
// Each figure is opened in weld, taken to its fullest state, and read as
// drawn: every visible mark in the figure's own coordinates. The marks are
// then recognised as the board's shapes (fences, cards, panels, ports,
// wires, words) and written to src/canvas/gold.ts in the stamp notation.
// What is written is ordinary source: it can be tidied by hand afterwards.
import { chromium } from "playwright-core";
import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
mkdirSync(new URL("./gold/", import.meta.url), { recursive: true });

// Each figure: where it lives, the buttons that take it to its fullest state (by accessible name),
// and words that must be on it once it is there. A press that finds no button, or a missing word, stops the import.
const ALL_FIGURES = [
  { slug: "workers", name: "Workers", about: "A request wakes an isolate at the nearest edge.", href: "/v/workers", most: 12, has: ["New York", "London", "Singapore", "Control plane"] },
  { slug: "tunnel-outbound", name: "Tunnel: the outbound connection", about: "Connect out to Cloudflare while keeping resources private.", href: "/v/tunnel-outbound", press: ["Enable tunnel", "Send request"], has: ["CLOUDFLARED", "CLOUDFLARE", "YOUR NETWORK"] },
  { slug: "tunnel-identity", name: "Tunnel: identity and connectors", about: "One tunnel, served by more than one connector.", href: "/v/tunnel-identity", has: ["CONNECTOR A", "CONNECTOR B"] },
  { slug: "tunnel-traffic", name: "Tunnel: how traffic reaches a resource", about: "Routing decides which traffic uses the tunnel.", href: "/v/tunnel-traffic", press: ["Enable tunnel", "Connect hostname", "Send request"], has: ["app.example.com", "TUNNEL", "WEB SERVICE"] },
  { slug: "do-lifecycle", name: "Durable Object lifecycle", about: "One object wakes, serves, hibernates, evicts.", href: "/v/do-lifecycle", has: ["DO Instance", "ACTIVE"] },
  { slug: "container-isolation", name: "Container: isolation", about: "A container boots on demand inside its own VM, fronted by a Worker.", href: "/g/container-isolation", has: ["WORKER", "VM", "CONTAINER"] },
  { slug: "container-request-path", name: "Container: request path", about: "How a request travels from the Worker to the container and back.", href: "/g/container-request-path", press: ["instance A", "instance B"], has: ["WORKER", "DURABLE OBJECT", "CONTAINER"] },
  { slug: "container-lifecycle", name: "Container: lifecycle", about: "A container's states from provisioning to stopped.", href: "/g/container-lifecycle", has: ["Container"] },
  { slug: "container-placement", name: "Container: placement", about: "Where instances run, and how they scale across the network.", href: "/g/container-placement", press: ["Location A", "Location B", "Location C"], has: ["Location A", "Location B", "Location C", "Scheduler"] },
  { slug: "container-connectivity", name: "Container: connectivity", about: "Temporary local disk against durable storage and bindings.", href: "/g/container-connectivity", has: ["Worker", "Container instance", "Persistent storage"] },
];
// ONLY=slug,slug reads just those (nothing is written to gold.ts then)
const FIGURES = process.env.ONLY ? ALL_FIGURES.filter((f) => process.env.ONLY.split(",").includes(f.slug)) : ALL_FIGURES;

// ── reading a figure as drawn (runs in the page) ────────────────────
const read = (light) => {
  const svg = [...document.querySelectorAll("svg")].map((e) => ({ e, r: e.getBoundingClientRect() })).filter((o) => o.r.width > 60).sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height)[0]?.e;
  if (!svg) return null;
  const vb = svg.viewBox.baseVal, sr = svg.getBoundingClientRect(), k = vb.width / sr.width, R = (v) => Math.round(v * 10) / 10;
  const shown = (el) => { let o = 1; for (let n = el; n && n !== svg.parentElement; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === "none" || cs.visibility === "hidden") return 0; o *= parseFloat(cs.opacity); } return o; };
  const hue = (c) => { const m = c.match(/\d+(\.\d+)?/g); if (!m) return "none"; const [r, g, b, a] = m.map(Number); if (a === 0) return "none"; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx - mn > 60 ? "brand" : mx > 235 ? "bg" : mx > 200 ? "faint" : mx > 140 ? "muted" : "ink"; };
  // a colour as weld's palette names it: a step of the neutral scale, the accent, or the paper
  const dot = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  const rgba = (c) => { dot.clearRect(0, 0, 1, 1); dot.fillStyle = "#000"; dot.fillStyle = c; dot.fillRect(0, 0, 1, 1); return [...dot.getImageData(0, 0, 1, 1).data]; };
  const STEPS = [["paper", 255], ["n50", 250], ["n100", 245], ["n200", 229], ["n300", 212], ["n400", 161], ["n500", 115], ["n600", 82], ["n700", 64], ["n900", 23]];
  const named = (c) => { if (!c || c === "none") return ["none", 0]; const [r, g, b, a] = rgba(c); if (a === 0) return ["none", 0]; const alpha = Math.round((a / 255) * 100) / 100; if (Math.max(r, g, b) - Math.min(r, g, b) > 40) return ["accent", alpha]; const l = (r + g + b) / 3; return [STEPS.reduce((best, s) => (Math.abs(s[1] - l) < Math.abs(best[1] - l) ? s : best))[0], alpha]; };
  const shadowed = (el) => { for (let n = el; n && n !== svg.parentElement; n = n.parentElement) if (getComputedStyle(n).filter !== "none") return true; return false; };
  const at = (el, p) => { const m = el.getScreenCTM(), q = new DOMPoint(p.x, p.y).matrixTransform(m); return [R((q.x - sr.x) * k), R((q.y - sr.y) * k)]; };
  // a light reading only counts what is showing: enough to tell which moment is the fullest
  if (light) { let n = 0; for (const el of svg.querySelectorAll("rect,line,path,circle,ellipse,text,polyline")) { if (shown(el) < 0.08) continue; const r = el.getBoundingClientRect(); if (r.width || r.height) n++; } return { marks: { length: n } }; }
  const marks = [];
  for (const el of svg.querySelectorAll("rect,line,path,circle,ellipse,text,polyline")) {
    const o = shown(el); if (o < 0.08) continue;
    const r = el.getBoundingClientRect(); if (r.width === 0 && r.height === 0) continue;
    const cs = getComputedStyle(el);
    const m = { t: el.tagName, x: R((r.x - sr.x) * k), y: R((r.y - sr.y) * k), w: R(r.width * k), h: R(r.height * k), o: R(o) };
    if (el.tagName === "text") { m.s = el.textContent.trim(); if (cs.textTransform === "uppercase") m.s = m.s.toUpperCase(); m.fs = R(parseFloat(cs.fontSize)); m.sc = named(cs.fill)[0]; m.fw = parseInt(cs.fontWeight) || 400; m.prose = !/mono/i.test(cs.fontFamily); try { m.base = Math.round((at(el, el.getStartPositionOfChar(0))[1]) * 100) / 100; const q = el.getStartPositionOfChar(0), m2 = el.getScreenCTM(), sp = new DOMPoint(q.x, q.y).matrixTransform(m2); m.base = Math.round((sp.y - sr.y) * k * 1000) / 1000; } catch {} m.ls = Math.round(((parseFloat(cs.letterSpacing) || 0) / (parseFloat(cs.fontSize) || 1)) * 100) / 100; m.c = hue(cs.fill); m.a = cs.textAnchor; if (!m.s) continue; }
    else {
      m.f = cs.fill === "none" ? "none" : hue(cs.fill); m.st = cs.stroke === "none" ? "none" : hue(cs.stroke);
      { const [sf, fa] = named(cs.fill), [ss, sa] = named(cs.stroke); m.sf = el.tagName === "line" ? "none" : sf; m.fo = Math.round(fa * (parseFloat(cs.fillOpacity) || 1) * 100) / 100; m.ss = ss; m.so = sa; m.sw = Math.round(parseFloat(cs.strokeWidth) * 2 * 100) / 100; m.cap = cs.strokeLinecap; m.shadow = shadowed(el); }
      if (m.f === "none" && m.st === "none") continue;
      m.dash = m.st !== "none" && cs.strokeDasharray !== "none";
      // a stroke whose dashes are measured against its whole length is one being drawn along: motion, not drawing
      m.moving = el.hasAttribute("pathLength") || (m.dash && cs.strokeDasharray.split(/[ ,]+/).map(parseFloat).reduce((a, b) => a + b, 0) <= 1.5);
      // …unless it has been drawn all the way: then it is simply a line
      if (m.moving && parseFloat(cs.strokeDasharray) >= 0.98 && Math.abs(parseFloat(cs.strokeDashoffset) || 0) < 0.02) { m.moving = false; m.dash = false; }
      // otherwise: how much of it has been drawn so far
      if (m.moving) { m.drawn = Math.round(Math.min(1, Math.max(0, parseFloat(cs.strokeDasharray) || 0)) * 100) / 100; m.dash = false; }
      if (el.tagName === "rect") m.rx = el.rx?.baseVal?.value ?? 0;
      if (el.tagName === "path" || el.tagName === "line" || el.tagName === "polyline") { const n = el.getTotalLength(); m.len = R(n); m.p0 = at(el, el.getPointAtLength(0)); m.p1 = at(el, el.getPointAtLength(n)); const e = Math.min(3, n / 2), q0 = at(el, el.getPointAtLength(e)), q1 = at(el, el.getPointAtLength(n - e)); m.d0 = [q0[0] - m.p0[0], q0[1] - m.p0[1]]; m.d1 = [m.p1[0] - q1[0], m.p1[1] - q1[1]]; m.closed = /z\s*$/i.test(el.getAttribute("d") ?? ""); m.arc = /[Aa]/.test(el.getAttribute("d") ?? ""); m.curved = /[QCAqcaSsTt]/.test(el.getAttribute("d") ?? ""); m.me = cs.markerEnd !== "none"; m.ms = cs.markerStart !== "none";
        // an outline's notches and corners are sampled once and remembered: the same outline is read many times
        const memo = (window.__gold ??= new Map()), mk = `${el.getAttribute("d")}|${m.x},${m.y}`, known = memo.get(mk);
        if (known) Object.assign(m, known);
        // the route's own corners, from the path as written: a curve's control point is the corner it rounds
        if (el.tagName === "path" && !m.closed) { const v = []; let cur = [0, 0]; let rad = 0; const P = (x, y) => at(el, { x, y });
          for (const [, c, rest] of (el.getAttribute("d") ?? "").matchAll(/([MLQHVCZmlqhvcz])([^MLQHVCZmlqhvcz]*)/g)) { const a = rest.trim().split(/[\s,]+/).filter(Boolean).map(Number);
            if (c === "M" || c === "L") for (let i = 0; i + 1 < a.length; i += 2) { cur = [a[i], a[i + 1]]; v.push(P(...cur)); }
            else if (c === "H") { cur = [a[0], cur[1]]; v.push(P(...cur)); } else if (c === "V") { cur = [cur[0], a[0]]; v.push(P(...cur)); }
            else if (c === "Q") for (let i = 0; i + 3 < a.length; i += 4) { const from = P(...cur), ctl = P(a[i], a[i + 1]); rad = Math.max(rad, Math.hypot(ctl[0] - from[0], ctl[1] - from[1]) > 0 ? Math.hypot(a[i + 2] - a[i], a[i + 3] - a[i + 1]) : 0); v.pop(); v.push(ctl); cur = [a[i + 2], a[i + 3]]; v.push(P(...cur)); }
            else if (c !== "Z" && c !== "z") { v.length = 0; break; } }
          // drop points that only continue a straight run
          const turn = v.filter((p, i) => i > 0 && i < v.length - 1 && Math.abs((p[0] - v[i - 1][0]) * (v[i + 1][1] - p[1]) - (p[1] - v[i - 1][1]) * (v[i + 1][0] - p[0])) > 0.05);
          if (v.length >= 3 && turn.length) { m.via = turn; m.bend = Math.round(rad * 2 * 100) / 100; } }
        // a closed outline's corner radius: how far down its left side the straight edge begins
        // a closed outline's corner radius, from the path as written: how far a corner's curve ends from its control point
        if (!known && m.closed && m.w >= 30 && m.h >= 15) { const qd = (el.getAttribute("d") ?? "").match(/Q\s*([-\d.]+)[ ,]+([-\d.]+)[ ,]+([-\d.]+)[ ,]+([-\d.]+)/); if (qd) m.rad = Math.round(Math.max(Math.abs(qd[3] - qd[1]), Math.abs(qd[4] - qd[2])) * 2 * 10) / 10; }
        if (!known && m.closed && m.w >= 30 && m.h >= 15) {
          const apex = { t: [m.x + m.w / 2, m.y + 2], r: [m.x + m.w - 2, m.y + m.h / 2], b: [m.x + m.w / 2, m.y + m.h - 2], l: [m.x + 2, m.y + m.h / 2] };
          const hit = { t: false, r: false, b: false, l: false };
          for (let d = 0; d <= n; d += 0.5) { const q = at(el, el.getPointAtLength(d)); for (const s of "trbl") if (Math.hypot(q[0] - apex[s][0], q[1] - apex[s][1]) < 0.7) hit[s] = true; }
          m.notch = [..."trbl"].filter((s) => hit[s]).join("");
          // notches anywhere else along a side: where the outline runs a notch's depth inside its box, away from the corners
          const deep = { t: [], r: [], b: [], l: [] };
          for (let d = 0; d <= n; d += 0.25) { const q = at(el, el.getPointAtLength(d)), ix = q[0] > m.x + 10 && q[0] < m.x + m.w - 10, iy = q[1] > m.y + 10 && q[1] < m.y + m.h - 10;
            if (ix && Math.abs(q[1] - m.y - 2) < 0.15) deep.t.push((q[0] - m.x) / m.w); if (ix && Math.abs(m.y + m.h - q[1] - 2) < 0.15) deep.b.push((q[0] - m.x) / m.w);
            if (iy && Math.abs(q[0] - m.x - 2) < 0.15) deep.l.push((q[1] - m.y) / m.h); if (iy && Math.abs(m.x + m.w - q[0] - 2) < 0.15) deep.r.push((q[1] - m.y) / m.h); }
          m.dips = [];
          for (const s of "trbl") { const v = deep[s].sort((a, b) => a - b); let run = []; const flush = () => { if (run.length) { const f = run.reduce((a, b) => a + b, 0) / run.length; if (Math.abs(f - 0.5) > 0.01) m.dips.push([s, Math.round(f * 10000) / 10000]); run = []; } }; for (const f of v) { if (run.length && f - run[run.length - 1] > 0.02) flush(); run.push(f); } flush(); }
          memo.set(mk, { notch: m.notch, dips: m.dips, rad: m.rad });
        } }
    }
    marks.push(m);
  }
  // words weld sets over the figure in its controls (a button's caption) are part of how it reads
  for (const b of document.querySelectorAll("button")) {
    const br = b.getBoundingClientRect(); if (br.left < sr.left || br.right > sr.right || br.top < sr.top || br.bottom > sr.bottom) { b.dataset.goldStray = "1"; continue; } // page controls that only overlap the figure are not part of it (hidden while it is photographed)
    // a small stroked sign set beside a caption (a plus): each straight stroke of it comes across as a bar
    for (const el of b.querySelectorAll("svg path, svg line")) { const cs = getComputedStyle(el); if (cs.stroke === "none" || shown(el) < 0.08) continue;
      const m2 = el.getScreenCTM(), sc = Math.hypot(m2.a, m2.b), t = parseFloat(cs.strokeWidth) * sc, [ss] = named(cs.stroke), segs = [];
      if (el.tagName === "line") segs.push([[el.x1.baseVal.value, el.y1.baseVal.value], [el.x2.baseVal.value, el.y2.baseVal.value]]);
      else { let cur = [0, 0]; for (const [, c, rest] of (el.getAttribute("d") ?? "").matchAll(/([MLHVmlhv])([^MLHVmlhvZz]*)/g)) { const a = rest.trim().split(/[\s,]+/).filter(Boolean).map(Number), rel = c === c.toLowerCase(), C = c.toUpperCase();
          const to = C === "H" ? [(rel ? cur[0] : 0) + a[0], cur[1]] : C === "V" ? [cur[0], (rel ? cur[1] : 0) + a[0]] : [(rel ? cur[0] : 0) + a[0], (rel ? cur[1] : 0) + a[1]];
          if (C !== "M") segs.push([cur, to]); cur = to; } }
      for (const [p, q] of segs) { const P = new DOMPoint(p[0], p[1]).matrixTransform(m2), Q = new DOMPoint(q[0], q[1]).matrixTransform(m2); if (Math.abs(P.x - Q.x) > 0.5 && Math.abs(P.y - Q.y) > 0.5) continue;
        const x0 = Math.min(P.x, Q.x) - t / 2, y0 = Math.min(P.y, Q.y) - t / 2, w = Math.abs(P.x - Q.x) + t, h = Math.abs(P.y - Q.y) + t, r = (v) => Math.round(v * 100) / 100;
        marks.push({ t: "rect", x: r((x0 - sr.x) * k), y: r((y0 - sr.y) * k), w: r(w * k), h: r(h * k), o: 1, f: "ink", st: "none", sf: ss, fo: 1, ss: "none", so: 0, sw: 0, cap: "butt", shadow: false, dash: false, moving: false, plus: true }); } }
    const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const said = n.textContent.trim(); if (!said) continue;
      const cs = getComputedStyle(n.parentElement); if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) < 0.08) continue;
      const range = document.createRange(); range.selectNodeContents(n); const r = range.getBoundingClientRect(); if (!r.width || cs.position === "absolute" && r.width < 2) continue;
      const fs = parseFloat(cs.fontSize);
      marks.push({ t: "text", x: R((r.x - sr.x) * k), y: R((r.y - sr.y) * k), w: R(r.width * k), h: R(r.height * k), o: 1, s: cs.textTransform === "uppercase" ? said.toUpperCase() : said, fs: R(fs * k), ls: Math.round(((parseFloat(cs.letterSpacing) || 0) / (fs || 1)) * 100) / 100, c: hue(cs.color), sc: named(cs.color)[0], fw: parseInt(cs.fontWeight) || 400, a: "start", f: "none", st: "none" });
    }
  }
  svg.setAttribute("data-gold", "1");
  // `off`: how far into its first screen pixel the figure starts, so a picture of it can be laid back exactly
  return { w: vb.width, h: vb.height, scale: sr.width / vb.width, off: [sr.x - Math.floor(sr.x), sr.y - Math.floor(sr.y)], clip: { x: Math.floor(sr.x), y: Math.floor(sr.y), width: Math.ceil(sr.right) - Math.floor(sr.x), height: Math.ceil(sr.bottom) - Math.floor(sr.y) }, marks };
};

// ── recognising the board's shapes in the marks ─────────────────────
// words are kept exactly as weld shows them
const sentence = (s) => s;
const inside = (m, b, pad = 0) => m.x >= b.x - pad && m.y >= b.y - pad && m.x + m.w <= b.x + b.w + pad && m.y + m.h <= b.y + b.h + pad;
const mid = (m) => [m.x + m.w / 2, m.y + m.h / 2];
const q = (s) => JSON.stringify(s);
const n = (v) => String(Math.round(v * 10) / 10);
const U = 2; // figure units to board px, as in src/canvas/stamps.ts
// a label's tracking, where it is not the usual 0.15em
const tk = (t) => (t.ls !== undefined && Math.abs(t.ls - 0.15) > 0.005 ? t.ls : undefined);
const px = (v) => Math.round(v * U * 100) / 100;
const toneOf = (c, o = 1) => (c === "brand" ? "accent" : c === "faint" || c === "muted" || o < 0.5 ? "muted" : "ink");

function recognise(fig, names = new Map()) {
  const used = new Set(), shapes = [], notes = []; // shapes: things wires can join; notes: what was set aside, and why
  const M = fig.marks.filter((m) => m.x > -20 && m.y > -20 && m.x < fig.w + 20 && m.y < fig.h + 20);
  const texts = M.filter((m) => m.t === "text"), labels = texts.filter((t) => !t.prose);
  const take = (m) => used.add(m);
  const free = (m) => !used.has(m);
  // a thing is known by its kind and where it sits, so it keeps one name through every moment of the figure
  const id = (p, at) => { const key = `${p}:${Math.round(at[0])},${Math.round(at[1])}`; if (!names.has(key)) { const n = [...names.keys()].filter((k) => k.startsWith(p + ":")).length + 1; names.set(key, `${p}${n}`); } return names.get(key); };
  const pulses = [], wireAt = [];
  const extra = (o) => { const e = Object.entries(o).filter(([, v]) => v !== undefined && v !== "ink" && v !== false); return e.length ? `, { ${e.map(([k, v]) => `${k}: ${typeof v === "string" ? q(v) : Array.isArray(v) ? JSON.stringify(v) : typeof v === "object" ? lit(v) : v}`).join(", ")} }` : ""; };
  // an object as it is written in the stamp, without anything left undefined
  const lit = (o) => `{ ${Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}: ${typeof v === "string" ? q(v) : v}`).join(", ")} }`;
  // the exact look of a mark: its line, weight, fill and presence, as weld paints it
  const fineOf = (m, more = {}) => ({ arc: m.arc || undefined, r: m.rad !== undefined && Math.abs(m.rad - 12) > 0.3 ? m.rad : undefined, line: m.ss, w: m.ss !== "none" ? m.sw : undefined, fill: m.sf, fo: m.sf !== "none" && m.fo < 1 ? m.fo : undefined, o: m.o < 1 ? m.o : undefined, shadow: m.shadow || undefined, ...more });
  const said = (t, cy) => (t ? { text: t.sc, fw: t.fw, rise: t.base !== undefined && cy !== undefined ? Math.round((t.base - cy) * U * 100) / 100 : undefined } : {});
  const out = []; // [z, text]: written in the order weld draws them

  // fences: a dashed frame, named by a dashed plate riding its top edge
  for (const m of M) if (m.t === "rect" && m.dash && m.f === "none" && m.w >= 60 && m.h >= 40) {
    take(m);
    const plate = M.find((p) => free(p) && p.t === "rect" && p.dash && p.h <= 20 && Math.abs(p.y + p.h / 2 - m.y) < 4 && p.x >= m.x && p.x + p.w <= m.x + m.w);
    let name = "", size, track;
    if (plate) { take(plate); const t = texts.find((t) => free(t) && inside(t, plate, 3)); if (t) { take(t); name = sentence(t.s); size = px(t.fs); track = tk(t); } }
    const i = id("zone", mid(m)); out.push([M.indexOf(m), `box(${q(i)}, "boundary", ${n(m.x)}, ${n(m.y)}, ${n(m.w)}, ${n(m.h)}, ${q(name)}${extra({ tone: toneOf(m.st, m.o), size, track, pad: plate ? Math.round((plate.x - m.x) * U * 100) / 100 : undefined, fine: fineOf(m, said(texts.find((t) => t.s === name && plate && inside(t, plate, 3)), m.y)) })})`]);
  }
  // compute: a field of small squares
  const cells = M.filter((m) => free(m) && m.t === "rect" && m.w === 6 && m.h === 6 && m.st === "none" && m.f !== "bg");
  while (cells.length) {
    const group = [cells.shift()];
    for (let grew = true; grew; ) { grew = false; for (let i = cells.length - 1; i >= 0; i--) if (group.some((g) => g.f === cells[i].f && Math.abs(g.x - cells[i].x) <= 10 && Math.abs(g.y - cells[i].y) <= 10)) { group.push(cells.splice(i, 1)[0]); grew = true; } }
    if (group.length < 12) continue;
    group.forEach(take);
    const x0 = Math.min(...group.map((g) => g.x)), y0 = Math.min(...group.map((g) => g.y)), x1 = Math.max(...group.map((g) => g.x + 6)), y1 = Math.max(...group.map((g) => g.y + 6));
    const bright = group.reduce((s, g) => s + g.o, 0) / group.length > 0.6;
    out.push([M.indexOf(group[0]) + 0.5, `box(${q(id("glyph", [x0 + (x1 - x0) / 2, y0 + (y1 - y0) / 2]))}, "glyph", ${n(x0)}, ${n(y0)}, ${n(x1 - x0)}, ${n(y1 - y0)}, ""${extra({ tone: group[0].f === "brand" ? undefined : "muted", fill: bright ? "solid" : undefined, levels: (() => { const lv = [...group].sort((a, b) => a.y - b.y || a.x - b.x).map((g) => Math.round(g.o * g.fo * 100) / 100); return group.length === 24 && new Set(lv).size > 1 ? lv : undefined; })(), fine: { fill: group[0].sf, fo: Math.round((group.reduce((s, g) => s + g.o * g.fo, 0) / group.length) * 100) / 100 } })})`]);
  }
  // ports: a small socket with a mark inside
  for (const m of M) if (free(m) && m.t === "rect" && m.w === 8 && m.h === 8 && m.f === "bg" && m.st !== "none") {
    take(m);
    const mark = M.find((p) => free(p) && p.t === "rect" && p.w <= 4 && inside(p, m));
    if (mark) take(mark);
    const [cx, cy] = mid(m), i = id("port", [cx, cy]);
    shapes.push({ id: i, ...m, port: true });
    out.push([M.indexOf(m), `box(${q(i)}, "pad", ${n(cx - 4)}, ${n(cy - 4)}, 8, 8, ""${extra({ fill: mark?.f === "brand" ? "solid" : undefined, tone: mark?.f === "brand" ? "accent" : undefined, fine: fineOf(m, { lamp: mark ? mark.sf : "none" }) })})`]);
  }
  // a fitting on a wire: a small plain square
  for (const m of M) if (free(m) && m.t === "rect" && m.w <= 9 && m.w >= 6 && m.h <= 9 && m.h >= 6 && m.f === "bg" && m.st !== "none") {
    take(m);
    const i = id("fit", mid(m)); shapes.push({ id: i, ...m, port: true });
    out.push([M.indexOf(m), `box(${q(i)}, "junction", ${n(m.x)}, ${n(m.y)}, ${n(m.w)}, ${n(m.h)}, ""${extra({ fine: fineOf(m) })})`]);
  }
  // things: a closed outline on paper. A rule under its top makes it a machine; a square before its name, a panel.
  for (const m of M) if (free(m) && (m.t === "path" || m.t === "rect") && m.f !== "none" && m.st !== "none" && !m.dash && m.w >= 30 && m.h >= 15 && (m.t === "rect" || (m.closed && m.len > (m.w + m.h) * 1.6))) {
    take(m);
    const rule = M.find((p) => free(p) && p.t === "line" && p.h === 0 && p.w > m.w * 0.8 && p.y > m.y + 14 && p.y < m.y + 40 && p.x >= m.x - 1 && p.x + p.w <= m.x + m.w + 1);
    const lamp = rule && M.find((p) => free(p) && p.t === "rect" && p.w <= 7 && p.h <= 7 && p.y < rule.y && p.y > m.y && p.x < m.x + 24 && p.x >= m.x);
    if (rule) take(rule);
    if (lamp) take(lamp);
    const mine = labels.filter((t) => free(t) && inside({ x: mid(t)[0], y: mid(t)[1], w: 0, h: 0 }, m));
    // a plain card's words sit in its middle; words set to one side stay words of their own
    const centred = (t) => Math.abs(mid(t)[0] - mid(m)[0]) < m.w * 0.12;
    const title = rule ? mine.filter((t) => t.y < rule.y).sort((a, b) => a.x - b.x)[0] : (mine.length === 1 || m.h < 44) && mine[0] && centred(mine[0]) ? mine[0] : undefined;
    // a panel sets its name two lamp-widths after its lamp; where weld set it elsewhere, the name stays words of its own, exactly placed
    const standard = !title || !lamp || Math.abs((title.x - lamp.x) * U - 24) <= 0.5;
    const named = standard ? title : undefined;
    if (named) take(named);
    const kind = rule ? (lamp ? "panel" : "machine") : "card", i = id("thing", mid(m));
    shapes.push({ id: i, ...m });
    // its own measures, so it is drawn exactly as weld draws it
    const size = named ? px(named.fs) : undefined, track = named ? tk(named) : undefined, head = rule ? px(rule.y - m.y) : undefined;
    // notches only where weld cut them (a welded shape has all four unless told otherwise; a panel none)
    const sides = m.notch ?? "", notch = (kind) => (kind === "panel" ? (sides ? sides : undefined) : sides === "trbl" ? undefined : sides);
    const pad = rule ? px((lamp ? lamp.x : named ? named.x : m.x + 6) - m.x) : undefined;
    const tone = toneOf(m.st, m.o);
    // filled with something other than paper: a tinted thing
    const fill = m.f === "bg" ? undefined : "tint";
    const fine = fineOf(m, { ...said(named, rule ? m.y + (rule.y - m.y) / 2 : m.y + m.h / 2), lamp: lamp ? lamp.sf : undefined });
    // the seam at a header's rule is the panel's own; any other notch off a side's middle is kept where weld cut it
    const dips = (m.dips ?? []).filter((d) => !(rule && (d[0] === "l" || d[0] === "r") && Math.abs(d[1] * m.h - (rule.y - m.y)) < 1.5)), dipsOr = dips.length ? dips : undefined;
    out.push([M.indexOf(m), kind === "card" ? `card(${q(i)}, ${n(m.x)}, ${n(m.y)}, ${n(m.w)}, ${n(m.h)}, ${q(named ? sentence(named.s) : "")}${extra({ tone, fill, size, track, notch: notch(kind), dips: dipsOr, fine })})` : `box(${q(i)}, ${q(kind)}, ${n(m.x)}, ${n(m.y)}, ${n(m.w)}, ${n(m.h)}, ${q(named ? sentence(named.s) : "")}${extra({ tone, fill, size, track, head, pad, notch: notch(kind), dips: dipsOr, fine })})`]);
  }
  // quieter boxes: a dashed ghost, an outlined chip, a filled region
  for (const m of M) if (free(m) && m.w >= 20 && m.h >= 10 && m.st !== "none" && ((m.t === "rect" && m.f === "none") || (m.t === "path" && m.closed && m.dash))) {
    take(m);
    const t = labels.find((t) => free(t) && inside({ x: mid(t)[0], y: mid(t)[1], w: 0, h: 0 }, m)); if (t) take(t);
    const i = id("chip", mid(m)); shapes.push({ id: i, ...m });
    out.push([M.indexOf(m), `box(${q(i)}, ${q(m.dash ? "rect" : "button")}, ${n(m.x)}, ${n(m.y)}, ${n(m.w)}, ${n(m.h)}, ${q(t ? sentence(t.s) : "")}${extra({ tone: toneOf(m.st, m.o), line: m.dash ? "dashed" : undefined, size: t ? px(t.fs) : undefined, track: t ? (m.dash ? t.ls : tk(t)) : undefined, fine: fineOf(m, said(t, m.y + m.h / 2)) })})`]);
  }
  for (const m of M) if (free(m) && m.t === "path" && m.st === "none" && m.f !== "bg" && m.w >= 30 && m.h >= 15) {
    take(m);
    out.push([M.indexOf(m), `box(${q(id("area", mid(m)))}, "rect", ${n(m.x)}, ${n(m.y)}, ${n(m.w)}, ${n(m.h)}, ""${extra({ tone: "muted", fill: "tint", fine: fineOf(m) })})`]);
  }
  // arrowheads belong to the wire they finish
  const heads = M.filter((m) => free(m) && m.t === "path" && m.st === "none" && m.w <= 9 && m.h <= 9);
  heads.forEach(take);
  // wires: every remaining stroke that is not a shape
  const wires = [];
  for (const m of M) if (free(m) && (m.t === "line" || (m.t === "path" && m.f === "none" || m.t === "path" && !m.closed && m.st !== "none")) && m.st !== "none" && m.len > 4) {
    take(m);
    // a stroke part-way through being drawn along its path stays a wire of its own, shown that far
    if (m.moving) { if (m.drawn > 0.02) wires.push({ m, flow: true }); continue; }
    if (m.o < 0.2) { notes.push(`set aside: a route drawn at ${Math.round(m.o * 100)}% (${m.p0} → ${m.p1}), not taken in this state`); continue; }
    // two strokes along the same run: the one drawn later lies on top, and is the one seen
    const under = wires.findIndex((w) => !w.flow && Math.abs(w.m.x - m.x) < 1 && Math.abs(w.m.y - m.y) < 1 && Math.abs(w.m.w - m.w) < 1 && Math.abs(w.m.h - m.h) < 1);
    if (under >= 0) { notes.push(`set aside: a ${wires[under].m.ss} stroke lying under a ${m.ss} one (${m.p0} → ${m.p1})`); wires.splice(under, 1); }
    wires.push({ m });
  }
  // Where a wire end belongs. On a shape's rim: that exact spot, so the wire
  // meets it where weld's does. In a port or fitting: the middle of the side
  // the wire comes in by (weld runs the wire under the port to its centre).
  const join = ([x, y], [dx, dy]) => {
    const side = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? [0, 0.5] : [1, 0.5]) : dy > 0 ? [0.5, 0] : [0.5, 1];
    const port = shapes.find((s) => s.port && x >= s.x - 2 && x <= s.x + s.w + 2 && y >= s.y - 2 && y <= s.y + s.h + 2);
    if (port) return `[${q(port.id)}, ${side[0]}, ${side[1]}]`;
    // an end belongs to a shape when it lies on its rim (within a unit) or is seated just inside it (a notch is 2 deep)
    const IN = 3, OUT = 1;
    const host = [...shapes].reverse().find((s) => !s.port && x >= s.x - OUT && x <= s.x + s.w + OUT && y >= s.y - OUT && y <= s.y + s.h + OUT && (Math.abs(x - s.x) <= IN || Math.abs(x - s.x - s.w) <= IN || Math.abs(y - s.y) <= IN || Math.abs(y - s.y - s.h) <= IN));
    if (!host) return `[${n(x)}, ${n(y)}]`;
    const f = (v) => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;
    return `[${q(host.id)}, ${f((x - host.x) / host.w)}, ${f((y - host.y) / host.h)}]`;
  };
  for (const w of wires) {
    const m = w.m, bent = m.w > 1 && m.h > 1 && Math.abs(m.len - Math.hypot(m.w, m.h)) > 1;
    // a head belongs to the wire of its own colour that ends at it (two wires may share a lane)
    const near = (p) => { const h = heads.find((h) => !h.owner && h.f === m.st && Math.hypot(mid(h)[0] - p[0], mid(h)[1] - p[1]) < 9); if (h) h.owner = m; return h; };
    const h1 = near(m.p1), h0 = near(m.p0);
    const head = h1 || m.me ? "end" : h0 || m.ms ? "start" : undefined;
    // weld stops the line where the head begins: the wire's real end is the head's tip
    const tip = (p, d, h) => { if (!h) return p; if (h === true) { const L = Math.hypot(d[0], d[1]) || 1; return [p[0] + (d[0] / L) * 6.5, p[1] + (d[1] / L) * 6.5]; } const L = Math.hypot(d[0], d[1]) || 1, far = Math.abs(d[0]) > Math.abs(d[1]) ? h.w : h.h; return [p[0] + (d[0] / L) * far, p[1] + (d[1] / L) * far]; };
    // each end with the direction the wire is travelling as it arrives there
    const A = [tip(m.p0, [-m.d0[0], -m.d0[1]], h0 || (m.ms && !h0 ? true : undefined)), [-m.d0[0], -m.d0[1]]], B = [tip(m.p1, m.d1, h1 || (m.me && !h1 ? true : undefined)), m.d1];
    w.ends = [A[0], B[0]];
    w.len = m.len + (m.me && !h1 ? 6.5 : 0) + (m.ms && !h0 ? 6.5 : 0) + (h0 ? (Math.abs(m.d0[0]) > Math.abs(m.d0[1]) ? h0.w : h0.h) : 0) + (h1 ? (Math.abs(m.d1[0]) > Math.abs(m.d1[1]) ? h1.w : h1.h) : 0);
    const [[a, da], [b, db]] = head === "start" ? [B, A] : [A, B];
    const ends = [m.p0, m.p1].sort((p, r) => p[0] - r[0] || p[1] - r[1]), wid = id(w.flow ? "flow" : "w", [ends[0][0] * 1000 + ends[1][0], ends[0][1] * 1000 + ends[1][1]]);
    wireAt.push({ id: wid, x: m.x, y: m.y, w: m.w, h: m.h });
    const o = extra({ id: wid, drawn: w.flow && m.drawn < 1 ? m.drawn : undefined, route: bent ? "elbow" : undefined, square: bent && !m.curved ? true : undefined, via: bent && m.via ? (head === "start" ? [...m.via].reverse() : m.via) : undefined, bend: bent && m.curved && m.bend && Math.abs(m.bend - 12) > 0.05 ? m.bend : undefined, heads: head ? "end" : undefined, tone: toneOf(m.st, m.o), line: m.dash ? "dashed" : undefined, fine: { line: m.ss, w: m.sw, o: m.o < 1 ? m.o : undefined, round: m.cap === "round" || undefined, head: head ? Math.round((h1 || h0 ? (Math.abs((h1 ? m.d1 : m.d0)[0]) > Math.abs((h1 ? m.d1 : m.d0)[1]) ? (h1 || h0).w : (h1 || h0).h) : 6.5) * U * 10) / 10 : undefined } });
    out.push([M.indexOf(m), `wire(${join(a, da)}, ${join(b, db)}${o})`]);
  }
  // marks that are part of the figure's motion (a pulse on a wire) are left behind; small fixed ones stay
  for (const m of M) if (free(m) && m.t === "rect" && m.st === "none" && (m.w >= 5 || m.plus) && !(m.f === "brand" && m.w <= 5.5 && m.h <= 5.5)) {
    take(m);
    out.push([M.indexOf(m), `box(${q(id(m.plus ? (m.w > m.h ? "dash" : "stem") : "bar", mid(m)))}, "rect", ${n(m.x)}, ${n(m.y)}, ${n(m.w)}, ${n(m.h)}, ""${extra({ tone: m.f === "brand" ? "accent" : "muted", fill: "solid", fine: { fill: m.sf, fo: m.fo < 1 ? m.fo : undefined, o: m.o < 1 ? m.o : undefined } })})`]);
  }
  // words that belong to no shape
  for (const t of texts) if (free(t)) {
    take(t);
    // kept where they sit on their line, by the edge they are set from
    const x = t.a === "end" ? t.x + t.w : t.a === "middle" ? t.x + t.w / 2 : t.x;
    out.push([M.indexOf(t), `label(${q(id("t", [x, t.base ?? t.y + t.h / 2]))}, ${n(x)}, ${t.base !== undefined ? Math.round((t.base - 0.35 * t.fs) * 100) / 100 : n(t.y + t.h / 2)}, ${q(t.s)}, ${px(t.fs)}, ${q(toneOf(t.c, t.o))}, ${q(t.a || "start")}, ${t.ls}, ${lit({ text: t.sc, fw: t.fw, o: t.o < 1 ? t.o : undefined, prose: t.prose || undefined })})`]);
  }
  for (const h of heads) if (!h.owner) notes.push(`set aside: an arrowhead at ${h.x},${h.y} that no wire of its colour ends at`);
  // a pulse travelling a wire is the figure's motion, not part of its drawing
  for (const m of M) if (free(m) && m.t === "rect" && m.f === "brand" && m.w <= 5.5 && m.h <= 5.5) { take(m); pulses.push(mid(m)); notes.push(`set aside: a pulse in motion at ${m.x},${m.y}`); }
  const left = M.filter(free);
  const visible = ([x, y], [dx, dy]) => {
    const p = shapes.find((s) => s.port && x >= s.x - 2 && x <= s.x + s.w + 2 && y >= s.y - 2 && y <= s.y + s.h + 2);
    if (!p) return { at: [x, y], cut: 0 };
    const at = Math.abs(dx) > Math.abs(dy) ? [dx > 0 ? p.x : p.x + p.w, y] : [x, dy > 0 ? p.y : p.y + p.h];
    return { at, cut: Math.hypot(at[0] - x, at[1] - y) };
  };
  const expect = { wires: wires.filter((w) => w.ends).map((w) => { const a = visible(w.ends[0], [-w.m.d0[0], -w.m.d0[1]]), b = visible(w.ends[1], w.m.d1); return { p0: a.at, p1: b.at, len: w.len - a.cut - b.cut, square: w.m.w > 1 && w.m.h > 1 && Math.abs(w.m.len - Math.hypot(w.m.w, w.m.h)) > 1 && !w.m.curved }; }), rules: M.filter((m) => m.t === "line" && m.h === 0 && m.w > 40).map((m) => ({ y: m.y, x0: m.x, x1: m.x + m.w })), texts: texts.map((t) => ({ s: t.s, x: t.x, cx: t.x + t.w / 2, r: t.x + t.w, cy: t.y + t.h / 2, a: t.a, fs: t.fs })) };
  return { lines: out.sort((a, b) => a[0] - b[0]).map((o) => o[1]), left, expect, notes, pulsed: [...new Set(pulses.map(([x, y]) => wireAt.filter((w) => x >= w.x - 4 && x <= w.x + w.w + 4 && y >= w.y - 4 && y <= w.y + w.h + 4).sort((a, b) => a.w * a.h - b.w * b.h)[0]?.id).filter(Boolean))] };
}

// ── run ─────────────────────────────────────────────────────────────
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 5 })).newPage();
const blocks = [];
const problems = [];
await page.clock.install();
const STEP = 100, restless = [];
for (const f of FIGURES) {
  // the page's clock is held while the figure loads, so every reading starts from the figure's own beginning
  // (left running, it would already be some way into its story, a different way each time)
  await page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + 1000));
  await page.goto("http://localhost:3000" + f.href, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2200);
  // From here the page's clock only moves when it is stepped. Each step: a tenth of a second on, a moment for style transitions
  // to settle, then the figure is read. A reading that matches the one before it is a settled state; it is
  // photographed there and then, so the picture and the reading show the same instant.
  const names = new Map(), samples = [];
  const sample = async () => {
    await page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + STEP));
    await page.waitForTimeout(120);
    const fig = await page.evaluate(read);
    if (!fig) return;
    const r = recognise(fig, names);
    // what a state is told by: everything but the flicker of a compute field
    const sig = r.lines.map((l) => l.replace(/levels: \[[^\]]*\], /, "").replace(/(box\("glyph[^)]*?)fo: [\d.]+/, "$1").replace(/drawn: [\d.]+, /, "")).join("\n");
    const prev = samples[samples.length - 1], s = { fig, r, sig, run: prev && prev.sig === sig ? prev.run : (prev?.run ?? -1) + 1 };
    samples.push(s);
    // photographed when first seen, and again a step later once it has shown itself to be at rest (style
    // transitions have finished by then); the page's own controls are kept out of the picture
    const nth = samples.filter((o) => o.run === s.run).length;
    if (nth <= 3) {
      s.shot = new URL(`./gold/.${f.slug}.run${s.run}.png`, import.meta.url).pathname;
      await page.evaluate(() => { for (const b of document.querySelectorAll("[data-gold-stray]")) b.style.visibility = "hidden"; });
      await page.screenshot({ clip: fig.clip, path: s.shot });
      await page.evaluate(() => { for (const b of document.querySelectorAll("[data-gold-stray]")) b.style.visibility = ""; });
    }
  };
  for (let i = 0; i < 40; i++) await sample();
  const presses = f.press ?? [];
  for (let k = 0; k < presses.length; k++) {
    const btn = page.getByRole("button", { name: new RegExp(presses[k]) }).first();
    if (!(await btn.count())) { problems.push(`${f.slug}: no button matching /${presses[k]}/ to press`); continue; }
    await btn.click();
    for (let i = 0; i < (k === presses.length - 1 ? 80 : 36); i++) await sample();
  }
  if (!presses.length) for (let i = 0; i < 200; i++) await sample();
  await page.clock.resume();
  if (!samples.length) { problems.push(`${f.slug}: no figure found on the page`); continue; }
  // settled states, in the order they came; one seen again right after itself is the same rest, and coming back to the first closes the loop
  const runs = [];
  for (const s of samples) { const last = runs[runs.length - 1]; if (last && last.run === s.run) { last.n++; if (s.shot) { last.shot = s.shot; last.first = s; } last.pulsed = new Set([...last.pulsed, ...s.r.pulsed]); } else runs.push({ run: s.run, n: 1, first: s, shot: s.shot, pulsed: new Set(s.r.pulsed), gap: 0 }); }
  let settled = [];
  let gap = 0, carried = new Set();
  for (const r of runs) {
    if (r.n < 2) { gap += r.n; carried = new Set([...carried, ...r.pulsed]); continue; }
    const last = settled[settled.length - 1];
    if (last && last.first.sig === r.first.sig) { last.n += r.n + gap; gap = 0; continue; }
    settled.push({ ...r, gap, pulsed: new Set([...r.pulsed, ...carried]) }); gap = 0; carried = new Set();
  }
  // a state in which a wire is still being laid is the way to the next one, not a moment of its own: the next
  // moment takes that long to arrive, and a wire that set off later than the first waits that long in it
  { const kept = [], starts = new Map(); let carry = 0;
    for (const r of settled) {
      const laying = r.first.r.lines.filter((l) => /drawn: 0?\.\d+/.test(l));
      if (laying.length) { for (const l of laying) { const k = l.match(/^wire\(([^{]*)\{/)?.[1]; if (k && !starts.has(k)) starts.set(k, carry + r.gap); } carry += r.gap + r.n; continue; }
      kept.push({ ...r, gap: r.gap + carry, waits: new Map(starts) }); carry = 0; starts.clear();
    }
    if (kept.length) settled = kept; }
  // a figure that goes round and round is one turn of its loop: the shortest stretch that the rest repeats
  // a state that only takes the emphasis off the one before it (a lit wire goes out, a lit thing goes quiet, nothing new is
  // said or shown) is that one coming to rest, not a moment of its own: the one before simply rests that much longer.
  // A long rest is kept: weld meant it as a pause.
  { const idOf = (l) => l.match(/^(?:box|card|label)\("([^"]+)"/)?.[1] ?? l.match(/id: "([^"]+)"/)?.[1];
    const said = (l) => l.match(/^(?:card|label)\("[^"]+", [-\d., ]+"([^"]*)"/)?.[1] ?? l.match(/^box\("[^"]+", "[^"]+", [-\d., ]+"([^"]*)"/)?.[1] ?? "";
    const loud = (l) => /(tone|line|lamp|text): "accent"/.test(l), soft = (l) => l.startsWith("wire(") || l.startsWith('box("glyph');
    const settles = (cur, next) => {
      const gone = cur.filter((l) => !next.includes(l)), add = next.filter((l) => !cur.includes(l));
      if (add.some(loud) || !gone.some(loud)) return false;
      const was = new Map(gone.map((l) => [idOf(l), l])), is = new Set(add.map(idOf));
      for (const l of add) if (!soft(l) && (!was.has(idOf(l)) || said(was.get(idOf(l))) !== said(l))) return false;
      for (const l of gone) if (!soft(l) && !is.has(idOf(l))) return false;
      return true;
    };
    const kept = [];
    for (const r of settled) { const last = kept[kept.length - 1]; if (last && (r.n - 1) * STEP < 2000 && settles(last.first.r.lines, r.first.r.lines)) { last.n += r.gap + r.n; continue; } kept.push({ ...r }); }
    settled = kept; }
  // (it may take a state or two to get into its stride: those are not part of the turn)
  turn: for (let L = 0; L <= 2; L++) for (let P = 2; P <= (settled.length - L) / 2; P++) if (settled.every((r, i) => i < L || i + P >= settled.length || r.first.sig === settled[i + P].first.sig)) { settled = settled.slice(L, L + P); break turn; }
  // a story that ends where it began closes its loop on the first moment: the repeat at the end is that same rest
  if (settled.length > 2 && settled[settled.length - 1].first.sig === settled[0].first.sig) { const last = settled.pop(); settled[0] = { ...settled[0], n: settled[0].n + last.n }; }
  // `most`: where a figure's story is told by then (Workers: three cold starts, then one request to a Worker already awake; the other cities' warm requests say the same again)
  { const most = f.most ?? 20; if (settled.length > most) { console.log(`   ${f.slug}: ${settled.length} settled states; the first ${most} are kept`); settled = settled.slice(0, most); } }
  // a figure that never rests (something in it is always on the move) is taken at its fullest reading
  if (!settled.length) { settled.push({ ...runs.reduce((a, b) => (b.first.r.lines.length > a.first.r.lines.length ? b : a)), gap: 0, n: 4 }); restless.push(f.slug); }
  // the fullest of them is the drawing itself
  const full = settled.reduce((bi, r, i) => (r.first.r.lines.length >= settled[bi].first.r.lines.length ? i : bi), 0), best = settled[full].first;
  // the words it must show may come in any of its moments
  const said = settled.flatMap((r) => r.first.fig.marks.filter((m) => m.t === "text").map((m) => m.s));
  for (const w of f.has ?? []) if (!said.some((s) => s.toLowerCase().includes(w.toLowerCase()))) problems.push(`${f.slug}: expected the words “${w}” somewhere in its moments; it shows ${[...new Set(said)].slice(0, 14).join(", ")}`);
  for (const r of settled) if (r.first.r.left.length) problems.push(`${f.slug}: ${r.first.r.left.length} marks not recognised: ${r.first.r.left.map((m) => `${m.t}@${m.x},${m.y} ${m.w}x${m.h}`).join("; ").slice(0, 240)}`);
  const ms = (n, lo, hi) => Math.min(hi, Math.max(lo, n * STEP));
  const moments = settled.map((r, i) => {
    const ref = { w: r.first.fig.w, h: r.first.fig.h, scale: r.first.fig.scale, off: r.first.fig.off, dpr: 5 };
    writeFileSync(new URL(`./gold/${f.slug}.${i}.json`, import.meta.url), JSON.stringify(ref, null, 1));
    if (r.shot) renameSync(r.shot, new URL(`./gold/${f.slug}.${i}.png`, import.meta.url)); else problems.push(`${f.slug}: moment ${i} was never photographed`);
    // a wire that carried a mark on the way here, or while resting here, carries one in this moment
    // What travels a wire is shown by the wire itself (it is laid, or changes colour, in the direction of travel): the small
    // squares weld sends along some wires are left behind. A wire laid on the way here after the first one waits its turn.
    const first = Math.min(...(r.waits?.size ? [...r.waits.values()] : [0]));
    const lines = r.first.r.lines.map((l) => { const k = l.match(/^wire\(([^{]*)\{/)?.[1], w = k && r.waits?.has(k) ? (r.waits.get(k) - first) * STEP : 0; return w > 0 ? l.replace(/\{ id: "([^"]+)"/, `{ id: "$1", wait: ${w}`) : l; });
    return { over: i === 0 ? 400 : ms(r.gap + 1, 200, 1500), hold: ms(r.n - 1, 200, 3000), lines };
  });
  for (const s of samples) if (s.shot && existsSync(s.shot)) rmSync(s.shot);
  if (process.env.TRACE === f.slug) for (let i = 1; i < samples.length; i++) { const a = samples[i - 1].sig.split("\n"), b = samples[i].sig.split("\n"); console.log(`  ${i}: run ${samples[i].run}` + (samples[i].run === samples[i - 1].run ? "" : "  " + b.filter((l) => !a.includes(l)).slice(0, 3).map((l) => l.slice(0, 150)).join("\n        "))); }
  writeFileSync(new URL(`./gold/${f.slug}.json`, import.meta.url), JSON.stringify({ w: best.fig.w, h: best.fig.h, scale: best.fig.scale, off: best.fig.off, dpr: 5, moments: moments.length, full, expect: best.r.expect }, null, 1));
  copyFileSync(new URL(`./gold/${f.slug}.${full}.png`, import.meta.url), new URL(`./gold/${f.slug}.png`, import.meta.url));
  console.log(`${f.slug}: ${samples.length} readings → ${moments.length} moment${moments.length === 1 ? "" : "s"} (${moments.map((m, i) => `${m.lines.length}${i === full ? "*" : ""} shapes, ${m.over}+${m.hold}ms`).join(" · ")})${best.r.notes.length ? `\n   ${[...new Set(best.r.notes)].join("\n   ")}` : ""}`);
  const body = (lines) => `[\n${lines.map((l) => `      ${l},`).join("\n")}\n    ]`;
  blocks.push(`  { slug: ${q(f.slug)}, name: ${q(f.name)}, about: ${q(f.about)}, build: () => ${body(moments[full].lines)},\n    moments: () => ({ at: ${full}, moments: [\n${moments.map((m) => `    { over: ${m.over}, hold: ${m.hold}, shapes: ${body(m.lines)} },`).join("\n")}\n    ] }) },`);
}
await browser.close();
// nothing is written unless every figure came across whole
if (process.env.ONLY) { console.log(problems.join("\n")); process.exit(0); }
if (problems.length || blocks.length !== FIGURES.length) {
  console.error(`\nnot written: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n  ` + problems.join("\n  "));
  process.exit(1);
}
writeFileSync(new URL("../src/canvas/gold.ts", import.meta.url), `// Weld's gold-standard diagrams as stamps: each at its fullest, and the moments it moves through.
// Written by checks/import-gold.mjs from the figures as weld draws them;
// run it again to refresh. It is written whole each time: a correction belongs in the importer.
import { box, card, label, stamp, wire } from "./stamps";
import type { StampDef } from "./stamps";

export const GOLD: StampDef[] = [
${blocks.join("\n")}
].map(stamp);
`);
console.log(`wrote src/canvas/gold.ts (${blocks.length} diagrams)`);
