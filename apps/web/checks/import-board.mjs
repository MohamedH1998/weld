// Brings diagrams made on weld's board onto this one, as stamps that move.
//   node checks/import-board.mjs
// Each file in checks/board/ is one diagram as the board holds it: its shapes,
// its wires (with the path the board drew for each) and its states. A state
// becomes a moment. The board's buttons are left behind: the moments are played.
// What is written is src/canvas/board.ts, whole each time.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const dir = new URL("./board/", import.meta.url);
const q = JSON.stringify, n = (v) => String(Math.round(v * 100) / 100);

// A diagram the board held without states is given them here, by the names on its shapes.
const AUTHORED = {
  "websocket-room": (by, wireTo) => {
    const T = by("User · Tokyo"), B = by("User · Berlin"), N = by("User · NYC"), D = by("Durable Object");
    const wt = wireTo(T), wb = wireTo(B), wn = wireTo(N), off = { hidden: true };
    return [
      { name: "empty", states: { [D]: { detail: "users = 0" }, [wt]: off, [wb]: off, [wn]: off } },
      { name: "tokyo joins", states: { [T]: { active: true }, [D]: { active: true, detail: "users = 1" }, [wt]: { pour: true }, [wb]: off, [wn]: off } },
      { name: "berlin joins", states: { [B]: { active: true }, [D]: { active: true, detail: "users = 2" }, [wb]: { pour: true }, [wn]: off } },
      { name: "nyc joins", states: { [N]: { active: true }, [D]: { active: true, detail: "users = 3" }, [wn]: { pour: true } } },
      { name: "connected", states: { [D]: { detail: "users = 3" } } },
      { name: "tokyo speaks", states: { [T]: { active: true }, [D]: { active: true, detail: "hello from Tokyo" }, [wt]: { pour: true } } },
      { name: "everyone hears", states: { [B]: { active: true }, [N]: { active: true }, [D]: { detail: "sent to 2" }, [wb]: { pour: "reverse" }, [wn]: { pour: "reverse" } } },
    ];
  },
};

const LOOK = {
  line: (on) => (on ? `line: "accent", w: 2.5` : `line: "n300", w: 2.5`),
};

function convert(d) {
  const x0 = Math.min(...d.shapes.map((s) => s.x)), y0 = Math.min(...d.shapes.map((s) => s.y)) - 20;
  // stamps are written on a grid drawn at twice its size
  const X = (v) => n((v - x0) / 2), Y = (v) => n((v - y0) / 2), L = (v) => n(v / 2);
  const names = new Map();
  const count = {};
  for (const s of d.shapes) { const k = s.type === "boundary" ? "zone" : "thing"; names.set(s.id, `${k}${(count[k] = (count[k] ?? 0) + 1)}`); }
  d.arrows.forEach((a, i) => names.set(a.id, `w${i + 1}`));
  const shape = new Map(d.shapes.map((s) => [s.id, s]));
  let states = d.states;
  if (!states.length && AUTHORED[d.slug]) states = AUTHORED[d.slug]((label) => d.shapes.find((s) => s.label === label).id, (id) => d.arrows.find((a) => a.a.shape === id || a.b.shape === id).id);
  if (!states.length) states = [{ name: "as drawn", states: {} }];

  // a wire's path as the board drew it: where it leaves and lands, and its corners
  const route = (a) => {
    const nums = [...a.d.matchAll(/([MLQ])\s*([-\d.\s]+)/g)].map(([, c, r]) => [c, r.trim().split(/\s+/).map(Number)]);
    const start = nums[0][1], last = nums[nums.length - 1][1].slice(-2), corners = [];
    let prev = start;
    for (const [c, v] of nums.slice(1)) { if (c === "Q") { const [cx, cy, ex, ey] = v; if (Math.abs((cx - prev[0]) * (ey - prev[1]) - (cy - prev[1]) * (ex - prev[0])) > 0.01) corners.push([cx, cy]); prev = [ex, ey]; } else prev = v; }
    const on = (e, p) => { const s = shape.get(e.shape); if (!s) return `[${X(p[0])}, ${Y(p[1])}]`; const fx = Math.min(1, Math.max(0, (p[0] - s.x) / s.w)), fy = Math.min(1, Math.max(0, (p[1] - s.y) / s.h)); const [ax, ay] = e.side === "n" ? [fx, 0] : e.side === "s" ? [fx, 1] : e.side === "w" ? [0, fy] : [1, fy]; return `[${q(names.get(s.id))}, ${n(ax)}, ${n(ay)}]`; };
    // where it meets each shape's rim, for the ports that sit there
    const rim = (e, p) => { const s = shape.get(e.shape); if (!s) return p; return e.side === "n" ? [p[0], s.y] : e.side === "s" ? [p[0], s.y + s.h] : e.side === "w" ? [s.x, p[1]] : [s.x + s.w, p[1]]; };
    return { a: on(a.a, start), b: on(a.b, last), corners, rims: [rim(a.a, start), rim(a.b, last)] };
  };
  const routes = new Map(d.arrows.map((a) => [a.id, route(a)]));

  const moment = (st) => {
    const lines = [], of = (id, base) => ({ ...base, ...(st.states[id] ?? {}) });
    const ghost = (o) => (o.ghost ? `, o: 0.35` : "");
    for (const s0 of d.shapes) {
      const { style: _s, ...own } = s0, s = of(s0.id, { detail: own.detail, active: own.active, ghost: own.ghost, hidden: own.hidden, mark: own.mark }), id = names.get(s0.id);
      if (s.hidden) continue;
      const on = !!s.active, at = `${X(s0.x)}, ${Y(s0.y)}, ${L(s0.w)}, ${L(s0.h)}`;
      if (s0.type === "boundary") lines.push([0, `box(${q(id)}, "boundary", ${at}, ${q(s0.label.toUpperCase())}, { size: 15, track: 0.14, pad: 24, fine: { line: "n300", w: 2, fill: "none", text: "n700", fw: 500${ghost(s)} } })`]);
      else if (s0.type === "card") lines.push([2, `card(${q(id)}, ${at}, ${q(s0.label)}, { ${on ? `tone: "accent", ` : ""}size: 20, track: 0.06, fine: { ${LOOK.line(on)}, fill: "paper", shadow: true, text: "n900", fw: 400${ghost(s)} } })`]);
      else if (s0.type === "panel" || s0.type === "machine") {
        const panel = s0.type === "panel";
        lines.push([2, `box(${q(id)}, ${q(s0.type)}, ${at}, ${q(s0.label.toUpperCase())}, { ${on ? `tone: "accent", ` : ""}size: 15, track: 0.16, head: ${panel ? 48 : 52}, pad: ${panel ? 16 : 20}, fine: { ${LOOK.line(on)}, fill: "paper", shadow: true, text: ${on && panel ? `"accent"` : `"n700"`}, fw: ${panel ? 500 : 400}${panel ? `, lamp: ${on ? `"accent"` : `"n400"`}` : ""}${ghost(s)} } })`]);
        const mid = s0.y + (panel ? 48 : 52) + (s0.h - (panel ? 48 : 52)) / 2;
        if (s.detail) lines.push([3, `label(${q(id + "d")}, ${X(s0.x + (panel ? 16 : 20))}, ${Y(mid)}, ${q(s.detail)}, 15, "ink", "start", 0.06, { text: ${on ? `"accent"` : `"n500"`}, fw: 400${ghost(s)} })`]);
        if (s.mark === "ok") lines.push([3, `label(${q(id + "m")}, ${X(s0.x + s0.w - 18)}, ${Y(mid)}, "✓", 20, "accent", "end", 0, { text: "accent", fw: 500 })`]);
      } else lines.push([2, `box(${q(id)}, ${q(s0.type === "meter" || s0.type === "queue" ? s0.type : "rect")}, ${at}, ${q(s0.label ?? "")})`]);
    }
    for (const a of d.arrows) {
      const s = of(a.id, { flow: a.flow, ghost: a.ghost, hidden: a.hidden, pour: a.pour }), r = routes.get(a.id), id = names.get(a.id);
      if (s.hidden) continue;
      // whatever travels a wire is shown one way: the line itself runs. The board's steady flow (a heartbeat) is the same thing, sent as the moment arrives.
      const run = s.pour === "reverse" ? `run: "back", ` : s.pour || s.flow ? `run: "pour", ` : "", pulse = "";
      const via = r.corners.length ? `via: [${r.corners.map(([x, y]) => `[${X(x)}, ${Y(y)}]`).join(", ")}], bend: 12, ` : "";
      lines.push([1, `wire(${r.a}, ${r.b}, { id: ${q(id)}, ${a.label ? `text: ${q(a.label)}, size: 17, track: 0.06, ` : ""}${a.head ? `heads: "end", ` : ""}${a.ports ? `ports: "both", ` : ""}${run}${pulse}${via}tone: "muted", fine: { line: "n300", w: 2.5, round: true, text: "n900", fw: 400${a.ports ? `, port: "n300", lamp: "accent"` : ""}${a.head ? ", head: 12" : ""}${ghost(s)} } })`]);
      // (a lasting connection carries a port at each end: that is part of the wire)
    }
    // back to front: fences, wires, things, their words, ports
    return lines.sort((p, r) => p[0] - r[0]).map((l) => l[1]);
  };
  const moments = states.map((st, i) => ({ over: i === 0 ? 400 : 500, hold: i === states.length - 1 ? 2200 : 1300, lines: moment(st) }));
  const full = moments.reduce((bi, m, i) => (m.lines.length >= moments[bi].lines.length ? i : bi), 0);
  const body = (lines) => `[\n${lines.map((l) => `      ${l},`).join("\n")}\n    ]`;
  console.log(`${d.slug}: ${d.shapes.length} shapes, ${d.arrows.length} wires → ${moments.length} moments (${states.map((s) => s.name).join(", ")})`);
  return `  { slug: ${q(d.slug)}, name: ${q(d.name)}, about: ${q(d.about)}, build: () => ${body(moments[full].lines)},\n    moments: () => ({ at: ${full}, moments: [\n${moments.map((m) => `    { over: ${m.over}, hold: ${m.hold}, shapes: ${body(m.lines)} },`).join("\n")}\n    ] }) },`;
}

const ORDER = ["access-then-tunnel", "git-add-commit-push", "leader-election", "websocket-room"];
const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort((a, b) => ORDER.indexOf(a.replace(".json", "")) - ORDER.indexOf(b.replace(".json", "")));
const blocks = files.map((f) => convert(JSON.parse(readFileSync(new URL(f, dir), "utf8"))));
writeFileSync(new URL("../src/canvas/board.ts", import.meta.url), `// Diagrams first made on weld's board, as stamps: each with the moments it moves through.
// Written by checks/import-board.mjs from checks/board/*.json; run it again to refresh.
// It is written whole each time: a correction belongs in the importer.
import { box, card, label, stamp, wire } from "./stamps";
import type { StampDef } from "./stamps";

export const BOARD: StampDef[] = [
${blocks.join("\n")}
].map(stamp);
`);
console.log(`wrote src/canvas/board.ts (${blocks.length} diagrams)`);
