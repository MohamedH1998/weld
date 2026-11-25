// Patterns: small arrangements of the board's own shapes (a queue, a loop, a tree…) that are put down whole from the
// shape library and then taken apart. Each is its figure at rest: the shapes and wires.
import { arrow, box, card, dot, live, pad, quiet, stamp, U, wire, words } from "./stamps";
import type { Shape } from "./types";
import type { StampDef } from "./stamps";
import { EXTRACTED, MOTIFS } from "./extracted";


// How each home pattern moves: its moments, each the pattern as built with a few of its parts changed (by name). A wire
// runs (pour), answers (back), is refused (squash) or runs out (fizzle); a part lights, fills, moves, or is not there yet (away).
type Patch = Record<string, Record<string, unknown>>;
type Step = { p?: Patch; over?: number; hold?: number };
const moving = (d: StampDef, steps: Step[]): StampDef => ({
  ...d,
  moments: () => {
    // (a moving pattern's wires are quiet at rest: the colour is what runs along them, which a blue wire would hide)
    const base = d.build().map((sh) => (sh.kind === "arrow" && sh.tone === "accent" ? { ...sh, tone: "muted" as const } : sh));
    // (put down showing its last moment, the whole picture; playing starts it from the first)
    return { at: steps.length - 1, moments: steps.map((st) => ({ over: st.over ?? 700, hold: st.hold ?? 900, shapes: base.map((sh) => (st.p?.[sh.id] ? ({ ...sh, ...st.p[sh.id] } as Shape) : sh)) })) };
  },
});
const run = (r: "pour" | "back" | "squash" | "fizzle", ...ids: string[]): Patch => Object.fromEntries(ids.map((i) => [i, { run: r }]));
const away = (...ids: string[]): Patch => Object.fromEntries(ids.map((i) => [i, { away: true }]));
const lit = (...ids: string[]): Patch => Object.fromEntries(ids.map((i) => [i, { tone: "accent" }]));
const ink = (...ids: string[]): Patch => Object.fromEntries(ids.map((i) => [i, { tone: "ink" }]));
// a square mark of size s (weld units) centred on (cx, cy), as board px
const at = (cx: number, cy: number, s: number) => ({ x: (cx - s / 2) * U, y: (cy - s / 2) * U });
const MOVES: Record<string, Step[]> = {
  arrival: [{ p: { ...away("part", "p1", "p2", "w1", "w2") } }, { p: {} }, { p: run("pour", "w1", "w2"), hold: 1400 }],
  boundary: [{ p: { who: at(40, 96, 9) } }, { p: {}, over: 1200, hold: 1400 }],
  "compute-glyph": [{ p: { ...ink("host") } }, { p: { glyph: { busy: true } }, hold: 2400 }],
  connection: [{ p: { ...away("w3"), l: { fill: "none" }, r: { fill: "none" } } }, { p: {} }, { p: run("pour", "w3"), hold: 1400 }],
  containment: [{ p: { ...away("session", "task") } }, { p: away("task") }, { p: {}, hold: 1400 }],
  convergence: [{ p: { ...ink("one") } }, { p: run("pour", "w1", "w2", "w3"), hold: 1400 }],
  "dedup-key": [{ p: run("pour", "w1", "w2") }, { p: run("squash", "w1"), hold: 1400 }],
  divergence: [{ p: {} }, { p: run("pour", "w1", "w2", "w3"), hold: 1400 }],
  echo: [{ p: { ...run("pour", "w1"), got: { fill: "none", tone: "ink" } } }, { p: {}, hold: 1400 }],
  "embedded-phase": [{ p: { mem: { value: 0 }, disk: { fill: "none" } } }, { p: { disk: { fill: "none" } } }, { p: { mem: { value: 0 } }, hold: 1400 }],
  "fallback-flow": [{ p: run("pour", "w2") }, { p: run("pour", "w3") }, { p: { ...run("pour", "w1"), worker: { tone: "muted" }, note: { text: "Worker down: straight to Origin" } }, hold: 1400 }],
  flow: [{ p: run("pour", "w1") }, { p: run("pour", "w2", "w3") }, { p: run("pour", "w4", "w5"), hold: 1400 }],
  loop: [{ p: run("pour", "w1") }, { p: run("pour", "w2") }, { p: run("pour", "w3") }, { p: run("pour", "w4") }, { p: { ...run("pour", "w5"), response: { tone: "accent" } }, hold: 1400 }],
  "occupancy-meter": [{ p: { m: { value: 0.3 } } }, { p: {} }, { p: { m: { value: 1, tone: "red" } }, hold: 1400 }],
  port: [{ p: run("pour", "w1") }, { p: run("back", "w1"), hold: 1400 }],
  pour: [{ p: run("pour", "w2") }, { p: run("pour", "w1"), hold: 1400 }],
  queue: [{ p: { ...run("pour", "w1"), q: { value: 1 } } }, { p: { ...run("pour", "w1"), q: { value: 4 } } }, { p: { ...run("pour", "w2"), q: { value: 2 } }, hold: 1400 }],
  refusal: [{ p: { ...run("squash", "w1"), ...away("flat") } }, { p: run("fizzle", "w2"), hold: 1400 }],
  tap: [{ p: run("pour", "w1", "w2") }, { p: run("pour", "w3"), hold: 1400 }],
  trail: [{ p: { ...away("g1", "g2", "g3"), now: at(90, 60, 11) } }, { p: { ...away("g1", "g2"), now: at(140, 60, 11) } }, { p: { ...away("g1"), now: at(190, 60, 11) } }, { p: {}, hold: 1400 }],
  tree: [{ p: lit("root") }, { p: run("pour", "w1", "w2") }, { p: run("pour", "w3", "w4", "w5", "w6"), hold: 1400 }],
  void: [{ p: lit("s0") }, { p: lit("s1") }, { p: lit("s3") }, { p: lit("s4"), hold: 1400 }],
  waterfall: [{ p: away("bar1", "bar2", "bar3", "bar4") }, { p: away("bar3", "bar4") }, { p: away("bar4") }, { p: {}, hold: 1400 }],
  "welded-card": [{ p: run("back", "w4", "w5") }, { p: run("back", "w1", "w3") }, { p: { ...run("pour", "w2"), node: { tone: "accent" } }, hold: 1400 }],
};

const HOME: StampDef[] = [
  { slug: "arrival", name: "Arrival", about: "A part that arrives whole, with its wires and sockets.", build: () => [
    card("top", 118, 22, 64, 24, "Caller"), card("bot", 118, 156, 64, 24, "Service"), card("part", 114, 86, 72, 30, "Tunnel", { tone: "accent" }),
    wire("top", "part"), wire("part", "bot"), pad("p1", 150, 86, 9, true, "accent"), pad("p2", 150, 116, 9, true, "accent"),
  ] },
  { slug: "boundary", name: "Boundary", about: "A named place: a fence that contains and does nothing.", build: () => [
    box("zone", "boundary", 78, 56, 168, 104, "Zone"), dot("who", 161, 96, true), wire([26, 118], [274, 118], quiet),
  ] },
  { slug: "compute-glyph", name: "Compute glyph", about: "A field of cells showing its host is computing.", build: () => [
    box("host", "panel", 85, 56, 130, 88, "Worker", { tone: "accent" }), box("glyph", "glyph", 110, 97, 80, 30, "", { fill: "solid" }),
  ] },
  { slug: "connection", name: "Connection", about: "A link as hardware: a wire seated in a port at each end.", build: () => [
    wire([70, 62], [70, 138], quiet), wire([230, 62], [230, 138], quiet), pad("l", 70, 100, 12, true, "accent"), pad("r", 230, 100, 12, true, "accent"), wire("l", "r", live),
  ] },
  { slug: "containment", name: "Containment", about: "Nested scopes: the picture is the scope chain.", build: () => [
    box("agent", "machine", 20, 30, 280, 160, "Agent"), box("session", "machine", 50, 62, 220, 116, "Session"), card("task", 90, 108, 140, 50, "Task", { tone: "accent" }),
  ] },
  { slug: "convergence", name: "Convergence", about: "Many sources onto one destination.", build: () => [
    card("a", 46, 20, 60, 22, "Region A"), card("b", 120, 20, 60, 22, "Region B"), card("c", 194, 20, 60, 22, "Region C"),
    box("one", "machine", 74, 110, 152, 64, "DO instance", { tone: "accent" }),
    arrow("a", "one", { ...quiet, heads: "none" }), arrow("c", "one", { ...quiet, heads: "none" }), arrow("b", "one", live),
  ] },
  { slug: "dedup-key", name: "Dedup key", about: "A keyed filter: many arrivals, one effect.", build: () => [
    dot("src", 68.5, 100, true), pad("key", 150, 100, 16), dot("sink", 225, 100, false), wire("src", "key"), wire("key", "sink", { heads: "end" }),
  ] },
  { slug: "divergence", name: "Divergence", about: "One source fanning out to many receivers.", build: () => [
    dot("src", 68.5, 100, true), dot("t1", 225, 55, false), dot("t2", 225, 100, false), dot("t3", 225, 145, false),
    arrow("src", "t1", quiet), arrow("src", "t3", quiet), arrow("src", "t2", live),
  ] },
  { slug: "echo", name: "Echo", about: "Acknowledgment: on arrival the mark itself lights.", build: () => [
    pad("got", 220, 100, 22, true, "accent"), wire([48, 100], "got", quiet),
  ] },
  { slug: "embedded-phase", name: "Embedded phase", about: "A lifecycle written on the card that has it.", build: () => [
    box("host", "panel", 65, 45, 170, 110, "DO instance", { tone: "accent" }),
    words("k1", 79, 68, "ID", 10), words("v1", 162, 68, "session_8x92", 10, "ink"),
    words("k2", 79, 92, "MEMORY", 10), box("mem", "bars", 151, 94, 70, 7, "", { value: 0.8, tone: "accent" }),
    words("k3", 79, 116, "STORAGE", 10), pad("disk", 216, 121, 9, true, "accent"),
  ] },
  { slug: "fallback-flow", name: "Fallback flow", about: "A primary path with a conditional way round.", build: () => [
    card("region", 20, 90, 60, 24, "Region"), card("worker", 120, 30, 60, 24, "Worker", { tone: "accent" }), card("origin", 220, 90, 60, 24, "Origin"),
    wire("region", "origin", { ...quiet, line: "dashed" }), arrow("region", "worker", live), arrow("worker", "origin", live),
    words("note", 96, 160, "Cold miss: via Worker", 11),
  ] },
  { slug: "flow", name: "Flow", about: "A directed graph: structure, not timing.", build: () => [
    card("src", 14, 70, 56, 24, "Source"), card("fork", 102, 70, 48, 24, "Fork"), card("a", 182, 20, 68, 24, "Branch A"), card("b", 182, 120, 68, 24, "Branch B"), card("sink", 282, 70, 46, 24, "Sink"),
    arrow("src", "fork"), arrow("fork", "a"), arrow("fork", "b"), arrow("a", "sink"), arrow("b", "sink"),
  ] },
  { slug: "loop", name: "Loop", about: "Something that repeats until it is done.", build: () => [
    card("prompt", 20, 18, 80, 30, "Prompt"), card("model", 180, 18, 80, 30, "Model"), card("result", 20, 78, 80, 30, "Result"), card("tool", 180, 78, 80, 30, "Tool"), card("response", 20, 140, 80, 30, "Response", { tone: "muted" }),
    arrow("prompt", "model"), arrow("model", "tool"), arrow("tool", "result"), arrow("result", "prompt"), arrow("result", "response", { ...quiet, line: "dashed" }),
  ] },
  { slug: "occupancy-meter", name: "Occupancy meter", about: "A level measured against a hard limit.", build: () => [
    box("m", "meter", 90, 94, 120, 12, "Sessions", { value: 0.6 }),
  ] },
  { slug: "port", name: "Port", about: "A lasting connection: the wire plugs into a socket at each end.", build: () => [
    card("client", 40, 86, 80, 28, "Client"), card("server", 180, 86, 80, 28, "Server"), wire(["client", 1, 0.5], ["server", 0, 0.5], { ...live, ports: "both" }),
  ] },
  { slug: "pour", name: "Pour", about: "A request as colour filling the wire it travels.", build: () => [
    card("src", 116, 30, 68, 26, "Request"), card("a", 46, 140, 68, 26, "Region A"), card("b", 186, 140, 68, 26, "Region B"),
    arrow("src", "b", { ...quiet, heads: "none" }), arrow("src", "a", { ...live, heads: "none" }),
  ] },
  { slug: "queue", name: "Queue", about: "A bounded buffer between a fast source and a slow sink.", build: () => [
    dot("src", 68.5, 100, true), box("q", "queue", 84, 83, 132, 34, "", { value: 3 }), dot("sink", 225, 100, false), wire("src", "q"), wire("q", "sink", { heads: "end" }),
  ] },
  { slug: "refusal", name: "Refusal", about: "A request that fails where its cause is.", build: () => [
    card("callA", 44, 22, 62, 24, "Call"), box("wall", "boundary", 30, 108, 90, 70, "Private"), card("inside", 46, 134, 58, 24, "Inside"),
    wire("callA", [75, 98], quiet), box("flat", "rect", 63, 99, 24, 5, "", { tone: "accent", fill: "solid" }),
    card("callB", 194, 22, 62, 24, "Call"), card("gone", 196, 150, 58, 24, "Gone", { tone: "muted" }),
    wire("callB", [225, 86], quiet), wire([225, 120], "gone", { ...quiet, line: "dashed" }),
  ] },
  { slug: "tap", name: "Tap", about: "A socket on the line that copies a signal down a branch.", build: () => [
    dot("src", 68.5, 70, true), pad("fit", 150, 70, 9), dot("sink", 225, 70, false), pad("watch", 150, 142, 9),
    wire("src", "fit"), wire("fit", "sink", { heads: "end" }), wire("fit", "watch", quiet),
  ] },
  { slug: "trail", name: "Trail", about: "A past for anything that moves.", build: () => [
    dot("g3", 90, 60, false, "muted", 11), box("g2", "rect", 134.5, 54.5, 11, 11, "", { tone: "muted", fill: "tint" }), box("g1", "rect", 184.5, 54.5, 11, 11, "", { tone: "accent", fill: "tint" }), dot("now", 215, 100, true, "accent", 11),
  ] },
  { slug: "tree", name: "Tree", about: "Branching from one root: the picture is decomposition.", build: () => [
    card("root", 125, 14, 50, 26, "Root"), card("l", 60, 76, 50, 26, "Left"), card("r", 190, 76, 50, 26, "Right"),
    card("l1", 30, 138, 46, 26, "A"), card("l2", 94, 138, 46, 26, "B"), card("r1", 160, 138, 46, 26, "C"), card("r2", 224, 138, 46, 26, "D"),
    ...(["l", "r"] as const).map((k) => arrow("root", k, { heads: "none" })), arrow("l", "l1", { heads: "none" }), arrow("l", "l2", { heads: "none" }), arrow("r", "r1", { heads: "none" }), arrow("r", "r2", { heads: "none" }),
  ] },
  { slug: "void", name: "Void", about: "Deliberate emptiness: a place held and not used.", build: () => [
    ...[0, 1, 3, 4].map((k) => box(`s${k}`, "rect", 62 + k * 38, 90, 20, 20)), box("gap", "rect", 62 + 2 * 38, 90, 20, 20, "", { tone: "muted", line: "dashed" }),
  ] },
  { slug: "waterfall", name: "Waterfall", about: "A schedule with no connectors: the offset is the dependency.", build: () => [
    ...[{ x: 60, w: 60, c: true }, { x: 120, w: 50, c: false }, { x: 120, w: 70, c: true }, { x: 170, w: 40, c: false }, { x: 120, w: 100, c: false }].map((r, i) =>
      box(`bar${i}`, "rect", r.x, 44 + i * 24, r.w, 10, "", r.c ? { tone: "accent", fill: "solid" } : { tone: "muted", fill: "tint" })),
    wire([190, 36], [190, 158], { ...quiet, line: "dashed" }),
  ] },
  { slug: "welded-card", name: "Welded card", about: "A node whose outline carries its docking points.", build: () => [
    box("node", "machine", 80, 55, 140, 90, "Node"),
    wire(["node", 0.5, 0], [150, 18], quiet), wire(["node", 1, 0.5], [286, 100], quiet), wire(["node", 0.5, 1], [150, 182], quiet),
    wire(["node", 0, 0.35], [14, 86.5], quiet), wire(["node", 0, 0.7], [14, 118], quiet),
  ] },
].map(stamp).map((d) => (MOVES[d.slug] ? moving(d, MOVES[d.slug]!) : d));

/** The library's patterns: the board's first ones, then those taken from the accepted diagrams. */
export const PATTERNS: StampDef[] = [...HOME, ...EXTRACTED, ...MOTIFS];
