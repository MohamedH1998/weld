// Shorthand for writing a story's things and links: one short call each, at the usual sizes.
import type { Link, Thing } from "./story";
import { DIAL_PAD, fingerprintBits, odometerPlaces, stackKey } from "./shapes";

export const card = (id: string, x: number, y: number, text: string, w = 200, h = 72): Thing => ({ id, kind: "card", x, y, w, h, text });
export const panel = (id: string, x: number, y: number, text: string, detail = "", w = 260, h = 104): Thing => ({ id, kind: "panel", x, y, w, h, text, detail });
export const machine = (id: string, x: number, y: number, text: string, detail = "", w = 250, h = 112): Thing => ({ id, kind: "machine", x, y, w, h, text, detail });
export const pill = (id: string, x: number, y: number, text: string, w = 170, h = 40): Thing => ({ id, kind: "pill", x, y, w, h, text });
export const chip = (id: string, x: number, y: number, text: string, w = 96, h = 40): Thing => ({ id, kind: "chip", x, y, w, h, text });
export const gauge = (id: string, x: number, y: number, text: string, value = 0, w = 220, h = 16): Thing => ({ id, kind: "gauge", x, y, w, h, text, value });
export const meter = (id: string, x: number, y: number, text: string, value = 0, w = 220, h = 16): Thing => ({ id, kind: "meter", x, y, w, h, text, value });
export const bars = (id: string, x: number, y: number, text: string, value = 0, w = 180, h = 16): Thing => ({ id, kind: "bars", x, y, w, h, text, value });
export const queue = (id: string, x: number, y: number, text: string, value = 0, w = 240, h = 60): Thing => ({ id, kind: "queue", x, y, w, h, text, value });
export const glyph = (id: string, x: number, y: number, w = 160, h = 44): Thing => ({ id, kind: "glyph", x, y, w, h, text: "" });
export const label = (id: string, x: number, y: number, text: string): Thing => ({ id, kind: "label", x, y, w: 10, h: 10, text });
export const zone = (id: string, x: number, y: number, w: number, h: number, text: string): Thing => ({ id, kind: "boundary", x, y, w, h, text });
/** The same thing, not there until a beat shows it. */
export const later = <T extends Thing | Link>(t: T): T => ({ ...t, hidden: true });
/** A lasting wire drawn cut from the start (broken, a short red gap at its middle, both ends standing) until a beat runs it; a beat's `sever` cuts one later. */
export const severed = (l: Link): Link => ({ ...l, cut: true });

const SIDE: Record<string, [number, number]> = { r: [1, 0.5], l: [0, 0.5], t: [0.5, 0], b: [0.5, 1] };
const spot = (s: string): [string, number, number] => {
  // (split at the first dot only: the spot along the edge has one of its own)
  let dot = s.indexOf(".");
  // (on a call stack's slot, "st#newPoint.p.l", the slot's name is part of the end, and its side follows it)
  if (dot >= 0 && s.lastIndexOf("#", dot) >= 0 && !SIDE[s.slice(dot + 1).split(/[.@]/)[0]!]) { const d2 = s.indexOf(".", dot + 1); dot = d2 < 0 ? -1 : d2; }
  const id = dot < 0 ? s : s.slice(0, dot), rest = dot < 0 ? "r" : s.slice(dot + 1), [side = "r", along] = rest.split("@"), [ax, ay] = SIDE[side] ?? SIDE.r!;
  // "api.r@0.25" is a quarter of the way down api's right edge: wires between the same two things leave from different spots
  if (along === undefined) return [id!, ax, ay];
  const f = Math.min(1, Math.max(0, +along));
  return side === "l" || side === "r" ? [id!, ax, f] : [id!, f, ay];
};
/** A wire from one thing's side to another's: "api.r" is the middle of api's right edge (r, l, t, b); "api.r@0.25" a quarter of the way along it. */
export const wire = (id: string, a: string, b: string, o: Partial<Omit<Link, "id" | "a" | "b">> = {}): Link => ({ id, a: spot(a), b: spot(b), ...o });

// the newer things

// the thing itself, small
/** Retired: do not use in new diagrams (draw rows as `segments`). Rows are lines of `text`; `value` is the row lit (from 1). */
export const win = (id: string, x: number, y: number, text: string, value = 0, w = 170, h = 0): Thing => ({ id, kind: "window", x, y, w, h: h || 26 + text.split("\n").length * 24, text, value });
export const wave = (id: string, x: number, y: number, text: string, value = 0, w = 220, h = 56): Thing => ({ id, kind: "wave", x, y, w, h, text, value });
/** A measured span; taller than wide, it stands upright. */
export const rule = (id: string, x: number, y: number, text: string, w = 140, h = 16, reach = 0): Thing => ({ id, kind: "rule", x, y, w, h, text, ...(reach ? { reach } : {}) });
export const axis = (id: string, x: number, y: number, text: string, value = 0.5, levels: number[] = [], w = 320, h = 40): Thing => ({ id, kind: "axis", x, y, w, h, text, value, levels });
export const plot = (id: string, x: number, y: number, text: string, levels: number[], value = 0, w = 240, h = 140): Thing => ({ id, kind: "plot", x, y, w, h, text, value, levels });

/** A stepped plot, for a value that changes in an instant (a balance, a version, a count): `levels` are the heights it holds (0 to 1), each from its instant to the next, joined by square risers;
 *  `value` is how far it is drawn (0 to 1), a riser standing whole the moment the line reaches its x. */
export const stair = (id: string, x: number, y: number, text: string, levels: number[], value = 0, w = 240, h = 140): Thing => ({ id, kind: "stair", x, y, w, h, text, value, levels });
/** A plot with a level line across it at `limit` (0 to 1) carrying its `words`: `levels` are the curve's heights (0 to 1), `value` how far it is drawn; each crossing of the line it has reached
 *  drops a tick to the baseline and lights a dot there (filled going over, open coming back under), so plots stacked on one time axis show which crossed and when. */
export const threshold = (id: string, x: number, y: number, text: string, levels: number[], limit: number, words = "", value = 0, w = 240, h = 140): Thing => ({ id, kind: "threshold", x, y, w, h, text: words ? text + "\n" + words : text, value, levels, unit: String(limit) });

// a construction drawing's marks
/** A region singled out: hatched as far as `value` (0 to 1). */
export const hatch = (id: string, x: number, y: number, text: string, value = 1, w = 120, h = 80, marks = 0): Thing => ({ id, kind: "hatch", x, y, w, h, text, value, ...(marks ? { levels: [marks] } : {}) });
/** A line the drawing was set out by; taller than wide, it stands upright. `centre` draws it long and short by turns. */
export const guide = (id: string, x: number, y: number, w: number, h = 0, text = "", centre = false): Thing => ({ id, kind: "guide", x: h ? x - 6 : x, y: h ? y : y - 6, w: h ? 12 : w, h: h || 12, text, ...(centre ? { dashed: true as const } : {}) });
/** A whole cut into shares: `levels` are their sizes, lines of `text` after the first their names, `value` the part in question (from 1). */
export const parts = (id: string, x: number, y: number, text: string, levels: number[], value = 0, w = 320, h = 32): Thing => ({ id, kind: "parts", x, y, w, h, text, value, levels });
/** A point, centred on (x, y). */
export const dot = (id: string, x: number, y: number, text = "", r = 7): Thing => ({ id, kind: "dot", x: x - r, y: y - r, w: r * 2, h: r * 2, text });
/** A circle things stand on, centred on (x, y). */
export const ring = (id: string, x: number, y: number, r: number): Thing => ({ id, kind: "ring", x: x - r, y: y - r, w: r * 2, h: r * 2, text: "" });
/** A stretch of a circle centred on (x, y): from angle `from` round to `to` (degrees, 0 at the top, growing clockwise; `to` past 360 carries on through the top, `to` under `from` goes the other way).
 *  `value` (0 to 1) is how far round it is drawn: at 0 none of it is, so leave it at 0 and `set` it to 1 in a beat and it grows from `from`. `band` gives it a width, standing inside the circle and hatched
 *  (as wide as `r`, a slice to the centre). Lit by `on`, coloured by `colour`; a beat's `cut` moves its angles ([from, to, band]). */
export const arc = (id: string, x: number, y: number, r: number, from: number, to: number, value = 1, band = 0, text = ""): Thing => ({ id, kind: "arc", x: x - r, y: y - r, w: r * 2, h: r * 2, text, value, levels: [from, to, band] });
/** Countdown rings centred on (x, y): a ring for each of `rings` [name, time left] (the first nearest the centre), each from the top round to when its time runs out, one full turn being `ttl`; `value` is the time elapsed (the same units): one hatched slice eats every ring at the same speed, and a ring it passes vanishes, its name lighting and taking `words[1]` for `words[0]`. `set` it with `over` to run the clock. */
export const countdown = (id: string, x: number, y: number, r: number, rings: [string, number][], ttl: number, value = 0, words: [string, string] = ["", ""], text = ""): Thing => ({ id, kind: "countdown", x: x - r - 12, y: y - r - 12, w: r * 2 + 24, h: r * 2 + 24, text: [text, ...words, ...rings.map((g) => g[0])].join("\n"), value, span: ttl, levels: rings.map((g) => g[1]) });
/** A fingerprint of `key`: a `size` square of four by four cells whose pattern comes from the key's words (the same key, the same pattern), `text` its caption; `value` is how lit it is while being compared (0 to 1), and a beat's `tone` green or red says it matched or not. `cut: { id: fingerprintLevels(other) }` changes the key it shows. */
export const fingerprint = (id: string, x: number, y: number, key: string, text = "", size = 48, value = 0): Thing => ({ id, kind: "fingerprint", x, y, w: size, h: size, text, value, levels: fingerprintLevels(key) });
/** A fingerprint's levels: the sixteen cells, row by row, the pattern `key` makes. */
export const fingerprintLevels = (key: string): number[] => fingerprintBits(key);
/** A ripple centred on (x, y): a ring for each of `rings` [name, radius] (in any units; the largest drawn `r` out, the rest to scale), each named where it crosses an upright ray; `value` is the front's reach (the same units): the band from the last ring passed out to it hatched, the rings passed in the beat's tone, the ring it rests on lit, its reach said under it before `unit`. `set` it to grow the front ring to ring. */
export const ripple = (id: string, x: number, y: number, r: number, rings: [string, number][], value = 0, unit = "", text = ""): Thing => ({ id, kind: "ripple", x: x - r - 12, y: y - r - 12, w: r * 2 + 24, h: r * 2 + 24, text: [text, ...rings.map((g) => g[0])].join("\n"), value, levels: rings.map((g) => g[1]), ...(unit ? { unit } : {}) });
/** A call stack: a column of `frames` from the bottom up (main first), each [name, slots' words], a slab of named slots; `value` is how deep it is: `set` it and a frame is pushed on top or popped off, the free stack above dashed. `lit` slots ("main.q") are lit. A wire lands on a slot by frame and slot, "st#newPoint.p" (its right side; "st#main.q.l" its left), and one landing on a popped slot dangles, red with an open head. A beat reuses a popped place with `say: { st: callstackWords(frames) }, cut: { st: callstackLevels(frames) }`. */
export const callstack = (id: string, x: number, y: number, frames: [string, string[]][], value = frames.length, lit: string[] = [], w = 320, h = frames.length * 64, text = ""): Thing => ({ id, kind: "callstack", x, y, w, h, text: callstackWords(frames, text), value, levels: callstackLevels(frames, lit) });
/** A call stack's words: its caption, then each frame's name and its slots'. */
export const callstackWords = (frames: [string, string[]][], text = ""): string => [text, ...frames.flatMap(([n, s]) => [n, ...s])].join("\n");
/** A call stack's levels: how many frames, how many slots each has, then how lit each slot is (`lit`: "frame.slot", by their keys). */
export const callstackLevels = (frames: [string, string[]][], lit: string[] = []): number[] => [frames.length, ...frames.map(([, s]) => s.length), ...frames.flatMap(([n, s]) => s.map((q) => (lit.includes(stackKey(n) + "." + stackKey(q)) ? 1 : 0)))];
/** A wedge centred on (x, y): one slice of a ring band from angle `from` round to `to` (degrees, 0 at the top, clockwise), cut across by rings at `radii` (px out from the centre, the first its inner edge, 0 for a point, the last its rim); `value` is how many rings it has reached past the first: `set` it and the slice grows outward ring by ring (not round), hatched in its `colour`, the rings passed in it and the ring it rests on lit. */
export const wedge = (id: string, x: number, y: number, from: number, to: number, radii: number[], value = 0, text = ""): Thing => { const r = Math.max(1, ...radii); return { id, kind: "wedge", x: x - r, y: y - r, w: r * 2, h: r * 2, text, value, levels: [from, to, ...radii] }; };
/** An orbit centred on (x, y): riders on a circle of radius `r` turning `speed` degrees a second, each of `boarded` (its boarding time, seconds) getting on at `gates[0]` and off at `gates[1]` (degrees, 0 at the top, clockwise), the stretch between hatched and the gates named by `words`; `value` is the time (seconds): `set` it with `over` and every rider sweeps round the arc, the newest aboard lit, how many are aboard said in the middle before `count`. A beat's `cut: { id: orbitLevels(gates, boarded, speed) }` moves the gates or the riders, who slide round the arc to their new places. */
export const orbit = (id: string, x: number, y: number, r: number, gates: [number, number], boarded: number[], speed = 30, value = 0, words: [string, string] = ["", ""], count = "", text = ""): Thing => ({ id, kind: "orbit", x: x - r - 28, y: y - r - 28, w: r * 2 + 56, h: r * 2 + 56, text: [text, count, ...words].join("\n"), value, levels: orbitLevels(gates, boarded, speed) });
/** A roulette centred on (x, y): a ring of radius `r` cut into slices as wide as `sizes`, named by `names`, under a pointer fixed at the top; `value` is how far it has turned clockwise, in turns (slice 1 starts at the top at 0), and the slice under the pointer is lit. A beat's `cut: { id: rouletteLevels(sizes) }` re-sizes the slices and `set` with `over` spins it, the names riding round with their slices. */
export const roulette = (id: string, x: number, y: number, r: number, sizes: number[], names: string[] = [], value = 0, band = 0.32, text = ""): Thing => {
  // (its box leaves room over the ring for the pointer)
  const R = Math.round(r * 1.14);
  return { id, kind: "roulette", x: x - R, y: y - R, w: R * 2, h: R * 2, text: [text, ...names].join("\n"), value, levels: rouletteLevels(sizes, band) };
};
/** A roulette's levels: how deep its slices are (0 to 1 of the radius), then each slice's size (keep the count the same from beat to beat, so they re-size rather than jump). */
export const rouletteLevels = (sizes: number[], band = 0.32): number[] => [band, ...sizes];
/** A floor: a grid of whole counts, a column of cells for each of `floors` (named under it by `names`) counting 0 up to `top`, the cells under each column's floor (a whole count) hatched as where a count cannot be, and `points` [column, count] landing as dots; `value` is how many have landed, in order: `set` it with `over` and each drops into its cell open, and once a column's last has landed its lowest fills (one under its floor is red). A beat's `cut: { id: floorLevels(floors, points, top) }` raises the floors, hatching them up from the bottom. */
export const floor = (id: string, x: number, y: number, floors: number[], points: [number, number][], top = Math.max(1, ...floors, ...points.map((p) => p[1])), names: string[] = [], value = 0, pitch = 112, row = 64, text = ""): Thing => ({ id, kind: "floor", x, y, w: floors.length * pitch, h: (top + 1) * row, text: [text, ...names].join("\n"), value, levels: floorLevels(floors, points, top) });
/** An odometer: `digits` nested loops of `base` tries read as a counter, a row of `base` cells per loop (the outermost on top, `names` to the left), `size` on a side, `pitch` apart across and `row` apart down, each hatched up to the try its loop is on and that cell lit; `value` is the count so far: `set` it with `over` and the lowest row spins, the row above ticking and the rows below resetting as it carries. */
export const odometer = (id: string, x: number, y: number, base: number, digits: number, value = 0, size = 28, pitch = size * 1.25, row = size * 1.5, names: string[] = [], text = ""): Thing => { const p = odometerPlaces(base, digits, false, size, pitch, row); return { id, kind: "odometer", x, y, w: p.w, h: p.h, text: [text, ...names].join("\n"), value, levels: [base, digits, 0, size, pitch, row] }; };
/** An odometer's product grid: base^digits cells, one per count, grouped as the loops make them (the innermost loop a run of cells `pitch` apart, the next those runs side by side `gap` apart, the next those stacked, turning by turns); `value` is the count so far, the cells filled in order and the newest lit: `set` it with the odometer's rows and the two count together. */
export const odometerGrid = (id: string, x: number, y: number, base: number, digits: number, value = 0, size = 24, pitch = size * 1.25, gap = size * 0.8, text = ""): Thing => { const p = odometerPlaces(base, digits, true, size, pitch, gap); return { id, kind: "odometer", x, y, w: p.w, h: p.h, text, value, levels: [base, digits, 1, size, pitch, gap] }; };
/** A dial centred on (x, y): a measure that goes round (event time, a schedule) as a clock face of radius `r`, `round` units to a turn from the top clockwise, `sectors` [from, to, name] arcs outside the rim, `points` [at, sweep, word] arriving in order, each landing on the rim at `at` and the hatched sweep from the top then turning on to `sweep`; `value` is how many have arrived: `set` it with `over` and a point landing where the sweep has been turns red by itself, a sector lighting once the sweep covers it. */
export const dial = (id: string, x: number, y: number, r: number, round: number, points: [number, number, string?][], sectors: [number, number, string?][] = [], value = 0, text = ""): Thing => { const R = r + DIAL_PAD; return { id, kind: "dial", x: x - R, y: y - R, w: R * 2, h: R * 2, text: [text, ...sectors.map((s) => s[2] ?? ""), ...points.map((p) => p[2] ?? "")].join("\n"), value, levels: dialLevels(round, points, sectors) }; };
/** A dial's levels: its round, how many sectors, each sector [from, to], then each point [at, sweep]. */
export const dialLevels = (round: number, points: [number, number, ...unknown[]][], sectors: [number, number, ...unknown[]][] = []): number[] => [round, sectors.length, ...sectors.flatMap((s) => [s[0], s[1]]), ...points.flatMap((p) => [p[0], p[1]])];
/** A floor's levels: how many columns, the top count, each column's floor, then each point [column, count]. */
export const floorLevels = (floors: number[], points: [number, number][], top = Math.max(1, ...floors, ...points.map((p) => p[1]))): number[] => [floors.length, top, ...floors, ...points.flat()];
/** Wells: a square profile of pits along level ground, each as deep as its `depths` (0 to 1) and named under it by `names`, holding counters: `counts` are one or more arrangements, how many lie in each pit; `value` is the arrangement shown (from 0): `set` it with `over` and the counters that change pits rise out over the rim and fall into their new one. `lit` pits (from 0) are lit, their counters too; a beat's `cut: { id: wellsLevels(depths, counts, lit) }` re-digs the pits or lights others (keep the arrangements' count the same). */
export const wells = (id: string, x: number, y: number, depths: number[], counts: number[][], names: string[] = [], value = 0, lit: number[] = [], w = depths.length * 96, h = 200, text = ""): Thing => ({ id, kind: "wells", x, y, w, h, text: [text, ...names].join("\n"), value, levels: wellsLevels(depths, counts, lit) });
/** Wells' levels: how many pits, their depths, how far each is lit, then each arrangement's count in every pit. */
export const wellsLevels = (depths: number[], counts: number[][], lit: number[] = []): number[] => [depths.length, ...depths, ...depths.map((_, i) => (lit.includes(i) ? 1 : 0)), ...counts.flatMap((c) => depths.map((_, i) => c[i] ?? 0))];
/** An icicle: nested proportional strips, `parts` each [name, size, parent] (size in the whole's units; parent: the index in `parts` of the part it cuts, −1 for a part of the whole), each row's parts standing exactly under the part they cut, as wide as their size, and ground no part covers hatched, named by `ground` ("not looked at"); `cut` parts (from 0) are cut, their parts grown down out of them, `lit` ones lit, and `value` is the part in question (from 1), its path up to the whole lit. A beat's `cut: { id: icicleLevels(parts, cut, lit) }` cuts others, their parts growing down out of them. */
export const icicle = (id: string, x: number, y: number, w: number, parts: [string, number, number][], cut: number[] = [], lit: number[] = [], ground = "", value = 0, h = icicleRows(parts) * 96, text = ""): Thing => ({ id, kind: "icicle", x, y, w, h, text: [text, ...parts.map((p) => p[0]), ground].join("\n"), value, levels: icicleLevels(parts, cut, lit) });
/** An icicle's levels: how many parts, then each part's [size, parent, how far it is cut, how lit it is]. */
export const icicleLevels = (parts: [string, number, number][], cut: number[] = [], lit: number[] = []): number[] => [parts.length, ...parts.flatMap(([, size, up], i) => [size, up, cut.includes(i) ? 1 : 0, lit.includes(i) ? 1 : 0])];
/** How many rows an icicle's parts make: one more than the deepest part's depth. */
export const icicleRows = (parts: [string, number, number][]): number => { const d: number[] = []; parts.forEach(([, , up], i) => { d[i] = up >= 0 && up < i ? d[up]! + 1 : 0; }); return 1 + Math.max(0, ...d); };
/** Bins: one series of `raw` points (0 to 1 of `h`), one to each of as many equal slots, drawn as flat steps over bins of uneven width, each bin starting at one of `edges` (indices into raw; 0 always starts one) and standing at the mean of the points under it, the points as small dots over their steps; `value` is the bin picked (from 1; 0: none), lit. A beat's `cut: { id: binsLevels(raw, edges, kept) }` moves the edges: neighbouring steps slide together to their shared mean and the dots not `kept` sink into them. Lines of `text` after the first are set over each bin's top. */
export const bins = (id: string, x: number, y: number, raw: number[], edges: number[], value = 0, w = raw.length * 24, h = 120, text = "", kept?: number[]): Thing => ({ id, kind: "bins", x, y, w, h, text, value, levels: binsLevels(raw, edges, kept) });
/** Bins' levels: how many points, the points, then for each gap between neighbours whether a bin starts after it (1) or not (0), then whether each point's dot still stands (`kept`, from 0; left out: all). */
export const binsLevels = (raw: number[], edges: number[], kept?: number[]): number[] => [raw.length, ...raw, ...raw.slice(1).map((_, j) => (edges.includes(j + 1) ? 1 : 0)), ...raw.map((_, j) => (!kept || kept.includes(j) ? 1 : 0))];
/** An orbit's levels: the gate on and the gate off, how far it turns a second, then each rider's boarding time (keep the count the same from beat to beat, so they slide rather than jump). */
export const orbitLevels = (gates: [number, number], boarded: number[], speed = 30): number[] => [gates[0], gates[1], speed, ...boarded];
/** A spiral centred on (x, y): one line from angle `from` (degrees, 0 at the top, clockwise) on radius `r` that keeps winding inward, each lap `step` nearer the centre; `value` is in turns (1.75: a lap and three quarters),
 *  so leave it at 0 and `set` it in a beat and it grows. `band` gives it a width, hatched. Its first lap is drawn as an arc is (lit by `on`), the laps past it in its `colour` (amber when none); a beat's `cut` changes [from, step, band]. */
export const spiral = (id: string, x: number, y: number, r: number, value = 0, step = 22, band = 0, from = 0, text = ""): Thing => ({ id, kind: "spiral", x: x - r, y: y - r, w: r * 2, h: r * 2, text, value, levels: [from, step, band] });
/** A leader from a label to the feature it names. */
export const leader = (id: string, a: string, b: string, o: Partial<Omit<Link, "id" | "a" | "b">> = {}): Link => ({ ...wire(id, a, b, o), leader: true });
/** A leader that lands on a chosen point of a thing (0 to 1 across and down it). */
export const pointTo = (id: string, a: string, b: string, ax: number, ay: number): Link => ({ ...leader(id, a, b), b: [b, ax, ay] });
/** A sentence under a picture. */
export const caption = (id: string, x: number, y: number, text: string): Thing => ({ ...label(id, x, y, text), plain: true });

// the motifs (see DIAGRAMS.md, "Motifs"): one call each
/** Where wires meet and branch, centred on (x, y): fan out from it, or gather into it. */
export const junction = (id: string, x: number, y: number): Thing => ({ id, kind: "junction", x: x - 5, y: y - 5, w: 10, h: 10, text: "" });
/** One thing wired to many through a junction at (x, y): a trunk that branches. `into` gathers the many into the one instead. */
export const fan = (id: string, one: string, many: string[], x: number, y: number, o: { into?: true; tone?: Link["tone"]; dotted?: true } = {}): { things: Thing[]; links: Link[] } => {
  const j = id + "j", side = (s: string) => `${s}.r`, look = { ...(o.tone ? { tone: o.tone } : {}), ...(o.dotted ? { dotted: true as const } : {}) };
  const trunk = o.into ? wire(id + "0", `${j}.r`, `${one}.l`, look) : wire(id + "0", side(one), `${j}.l`, { ...look, plain: true });
  const branches = many.map((m, i) => (o.into ? wire(id + (i + 1), side(m), `${j}.l`, { ...look, elbow: true, plain: true }) : wire(id + (i + 1), `${j}.r`, `${m}.l`, { ...look, elbow: true })));
  return { things: [junction(j, x, y)], links: [trunk, ...branches] };
};
/** A key to the wires' colours: its lines name the colours in use, in the palette's order (blue, green, amber, red, violet, teal). */
export const legend = (id: string, x: number, y: number, names: string[]): Thing => ({ id, kind: "legend", x, y, w: 180, h: names.length * 22, text: names.join("\n") });
/** A row of instants, busy where `spans` (from-to pairs, 0 to 1) say. */
export const activity = (id: string, x: number, y: number, w: number, spans: number[]): Thing => ({ id, kind: "ticks", x, y, w, h: 16, text: "", levels: spans, value: 1 });
/** A lane: a hatched band that work steps into and out of, its name on its edge as any place's is. */
export const lane = (id: string, x: number, y: number, w: number, h: number, name: string): Thing[] => [{ id, kind: "boundary", x, y, w, h, text: name, ground: "hatch" }];
/** A hand-over between two activity rows: an upright wire at x from one row (y0) to the other (y1), at the instant the work changes hands. Run it in that moment. */
export const handover = (id: string, x: number, y0: number, y1: number, text = ""): Link => ({ id, a: [x, y0], b: [x, y1], ...(text ? { text } : {}) });
/** A moment the reader would notice: an upright line from y0 to y1 at x, its name set over its top. */
export const moment = (id: string, x: number, y0: number, y1: number, name: string): { things: Thing[]; links: Link[] } => ({ things: [{ ...label(id + "n", x, y0 - 26, name), anchor: "mid" }], links: [{ id, a: [x, y0], b: [x, y1], plain: true, dashed: true }] });
/** A frame of its own inside another: a boundary a step lighter. */
export const inner = (id: string, x: number, y: number, w: number, h: number, text: string): Thing => ({ ...zone(id, x, y, w, h, text), ground: "tint" });
/** Retired: do not use in new diagrams (draw time as `segments`, the periods template). Time to scale: stops at their times in steps of `unit` ("100 ms"), named in order; its level is how many have been reached. A stop named "✕ Try 1" failed: it is drawn red. */
export const timeline = (id: string, x: number, y: number, w: number, at: number[], names: string[], unit = "", reached = at.length, span = 0): Thing => ({ id, kind: "timeline", x, y, w, h: 112, text: names.join("\n"), levels: at, value: reached, ...(unit ? { unit } : {}), ...(span ? { span } : {}) });
/** Retired: do not use in new diagrams (draw a level as `segments` or a `queue`). A vessel filled to `value` (0 to 1) of the `holds` units it takes. */
export const tank = (id: string, x: number, y: number, text: string, value: number, holds: number, w = 180, h = 140): Thing => ({ id, kind: "tank", x, y, w, h, text, value, unit: String(holds) });
/** A whole in its welded parts, each as wide as its size; a part is "what it holds  what it is called". */
export const segments = (id: string, x: number, y: number, w: number, sizes: number[], names: string[], picked = 0, h = 56): Thing => ({ id, kind: "segments", x, y, w, h, text: names.join("\n"), levels: sizes, value: picked });
/** Segments with several parts picked at once (`picks`, from 0), each lit as the one picked part is; a beat lights others with `cut: { id: segmentLevels(sizes, picks) }`, and they light as they come. */
export const picked = (id: string, x: number, y: number, w: number, sizes: number[], names: string[], picks: number[] = [], h = 56): Thing => ({ ...segments(id, x, y, w, sizes, names, 0, h), levels: segmentLevels(sizes, picks) });
/** A strip's levels with parts picked: its sizes, then how far each part is picked (the `picks`, from 0, fully). */
export const segmentLevels = (sizes: number[], picks: number[] = []): number[] => [...sizes, ...sizes.map((_, i) => (picks.includes(i) ? 1 : 0))];
/** A level counted out: a column of units for each step. `levels` are the columns' heights in whole units, `value` how many columns are drawn (a part of one grows the next unit by unit),
 *  `limit` a line across it: units standing past it are red. Each column's count is set under it; a unit is `h - 24` over the tallest column (or the limit) high. */
export const units = (id: string, x: number, y: number, text: string, levels: number[], value = 0, limit = 0, w = levels.length * 40, h = 184): Thing => ({ id, kind: "units", x, y, w, h, text, value, levels, ...(limit ? { unit: String(limit) } : {}) });
/** A curve against a stair on one pair of axes: `levels` are the curve's heights and `steps` the stair's (0 to 1, one of each per instant, 32 at most; a step holds until the next),
 *  `value` how far both are drawn (0 to 1). Between them it is hatched red where the curve is over the stair (a shortfall) and tinted where it is under (spare). */
export const gap = (id: string, x: number, y: number, text: string, levels: number[], steps: number[], value = 0, w = 280, h = 160): Thing => ({ id, kind: "gap", x, y, w, h, text, value, levels: [...levels, ...levels.map((_, i) => steps[Math.min(i, steps.length - 1)] ?? 0)] });
/** One row of numbered points on a scale shared with the rows above and below it: `present` are the numbers in this row, `span` the scale's length (rows given one x, `w` and `span` line up
 *  number for number). `value` is the number the walk has got to (0: not begun; `span + 1`: done; fractions are between two): the point under it is lit, points behind it settled, points ahead waiting. */
export const postings = (id: string, x: number, y: number, present: number[], span: number, value = 0, w = span * 48, h = 28, text = ""): Thing => ({ id, kind: "postings", x, y, w, h, text, value, levels: present, span });
/** A number line 0 to `span` with a hatched bracket `wide` across on it and `pins` dropped on it (numbers on the scale): `value` is where the bracket's left edge is (slide it with `set`); a pin is lit
 *  while the bracket covers it, settled once the left edge is past it, open while ahead. Rows given one x, `w` and `span` share the scale, one row a clock. */
export const interval = (id: string, x: number, y: number, span: number, wide: number, pins: number[] = [], value = 0, w = span * 40, h = 52, text = ""): Thing => ({ id, kind: "interval", x, y, w, h, text, value, levels: [wide, ...pins], span });
/** A lattice of crossings set out from two sequences, `across` its top and `down` its side (a letter a place, or words split at spaces), `cell` apart, with a diagonal in each `free` cell ([i, j]; left out, where the two agree) and a `path` of crossings ([i, j], [0, 0] the top left corner); `value` is how many steps of it are drawn (a part of one grows the next), paid steps heavier than free ones. */
export const lattice = (id: string, x: number, y: number, across: string, down: string, path: [number, number][], value = 0, free?: [number, number][], cell = 64): Thing => {
  const count = (s: string) => (s.trim().includes(" ") ? s.trim().split(/\s+/).length : [...s.trim()].length);
  return { id, kind: "lattice", x, y, w: count(across) * cell, h: count(down) * cell, text: across + "\n" + down, value, levels: [free ? free.length : -1, ...(free ?? []).flat(), ...path.flat()] };
};
/** A row of `n` equal square cells drawn as one thing, `size` on a side and `pitch` apart (left edge to left edge): `set` are the cells hatched in (from 0), `read` the cells lit, `dirty` set cells flagged (a filled corner), `value` one cell being read (from 1; 0: none).
 *  A wire lands on a cell by its index ("bits#5.t", "bits#5.b@0.3"); a beat sets cells in, hatching them, lights and flags them with `cut: { bits: cellLevels(n, set, read, dirty) }` (a flag fades as it clears), and its `tone` colours the lit ones and the flags. */
export const cells = (id: string, x: number, y: number, n: number, set: number[] = [], value = 0, size = 48, pitch = size, read: number[] = [], text = "", dirty: number[] = []): Thing => ({ id, kind: "cells", x, y, w: (n - 1) * pitch + size, h: size, text, value, span: n, levels: cellLevels(n, set, read, dirty) });
/** Two counts on one welded grid, `across` counted 0 to `na` and `up` 0 to `nb` (each named at its end), with a point at each of `points` ([a, b]; `names` beside them in turn):
 *  `value` is the point (from 1; 0: none) whose box, everything at or below it in both counts, is hatched; a part of one slides the box to the next, and a beat's `cut` adds points (`planeLevels`). */
export const plane = (id: string, x: number, y: number, across: string, up: string, na: number, nb: number, points: [number, number][], value = 0, names: string[] = [], w = (na + 1) * 120, h = (nb + 1) * 96): Thing => ({ id, kind: "plane", x, y, w, h, text: [across, up, ...names].join("\n"), value, levels: planeLevels(na, nb, points) });
/** A plane `across` 0 to `na` and `up` 0 to `nb` with a limit each way, `wa` a heavy edge standing at `a` across and `wb` one at `b` up, each named: `slopes` (up per across; `names` beside them) are tried in turn,
 *  `value` the slope in play (from 1; 0: none), a part of one how far its box has grown from the corner along it; at a whole one it has met the first wall in its way, which lights, and `ray` draws on past it where it would have gone. */
export const walls = (id: string, x: number, y: number, across: string, up: string, na: number, nb: number, wa: string, a: number, wb: string, b: number, slopes: number[], value = 0, names: string[] = [], ray = true, w = na * 80, h = nb * 80): Thing => ({ id, kind: "walls", x, y, w, h, text: [across, up, wa, wb, ...names].join("\n"), value, levels: [na, nb, a, b, ray ? 1 : 0, ...slopes] });
/** Many spans that end on one shared edge, its right side: a tooth a row for each of `starts` (0 to 1 across it), `more` how many others each tooth stands for ("+43 more"), drawn to its words' left;
 *  `value` is how far time has got (0 to 1): every tooth that has started grows to it, and at 1 the shared edge stands and every tooth is lit. Leave it at 0 and `set` it in beats.
 *  `names` name the teeth, one each from the top, set just left of where each starts (beside its count), appearing as it starts and lit with it. */
export const comb = (id: string, x: number, y: number, starts: number[], value = 0, more: number[] = [], w = 320, h = Math.max(32, Math.min(240, starts.length * 24)), text = "", names: string[] = []): Thing => ({ id, kind: "comb", x, y, w, h, text: names.length ? [text, ...names].join("\n") : text, value, span: starts.length, levels: [...starts, ...(more.length ? starts.map((_, i) => more[i] ?? 0) : [])] });
/** An upright bar for each of `levels` (its height, 0 to 1 of `h`) on one shared baseline, a bar centred in each of as many equal slots (given a segments strip's x and width, one sits under each part);
 *  `value` is the bar picked (from 1; 0: none), lit in the accent. Change the heights with a beat's `cut`; lines of `text` after the first are set over each bar's top. */
export const columns = (id: string, x: number, y: number, levels: number[], value = 0, w = levels.length * 76, h = 96, text = ""): Thing => ({ id, kind: "columns", x, y, w, h, text, value, levels });
/** Columns hung from a baseline along their top, each bar reaching down from it (under a row of columns on the same line, its reflection); `levels`, `value`, `cut` and words as columns', its name under it. */
export const hanging = (id: string, x: number, y: number, levels: number[], value = 0, w = levels.length * 76, h = 96, text = ""): Thing => ({ id, kind: "columns", x, y, w, h, text, value, levels, hang: true });
/** Columns with a ghost on each bar: a dashed outline up from its top to `ghosts[i]`, the height it would have reached (0 to 1; at or under the bar, none), in the columns' colour if given one;
 *  `levels` and `value` as columns'. A beat's `cut: { id: ghostLevels(heights, ghosts) }` changes both, a ghost growing up from its bar's top. */
export const ghosted = (id: string, x: number, y: number, levels: number[], ghosts: number[], value = 0, w = levels.length * 76, h = 96, text = ""): Thing => ({ id, kind: "columns", x, y, w, h, text, value, span: levels.length, levels: ghostLevels(levels, ghosts) });
/** Columns split: each bar crossed by a line at `splits[i]` (0 to 1 of the mark's height, at most the bar's), the part above it hatched in the accent (or the columns' colour) as the share in question; `levels` and `value` as columns', and a beat's `cut: { id: ghostLevels(heights, splits) }` moves the lines, rising from the base. */
export const split = (id: string, x: number, y: number, levels: number[], splits: number[], value = 0, w = levels.length * 76, h = 96, text = ""): Thing => ({ id, kind: "columns", x, y, w, h, text, value, span: levels.length, split: true, levels: ghostLevels(levels, splits) });
/** A ghosted columns' levels: the bars' `heights`, then each one's ghost (0 to 1; missing: none). */
export const ghostLevels = (heights: number[], ghosts: number[] = []): number[] => [...heights, ...heights.map((_, i) => ghosts[i] ?? 0)];
/** Many named points in one field, `points` [x, y, word] (0 to 1 across and down it), and a reach about `centre` [x, y, r] (the same way; r 0 to 1 of `w`): `value` is how far the reach has grown (0 to 1 of r),
 *  the points inside it lit in the accent and its centre standing once it has begun. Leave it at 0 and `set` it in beats; a beat's `cut: { id: scatterLevels(points, centre) }` moves the reach or the points. */
export const scatter = (id: string, x: number, y: number, points: [number, number, string][], centre: [number, number, number], value = 0, w = 480, h = 320, text = ""): Thing => ({ id, kind: "scatter", x, y, w, h, text: [text, ...points.map((p) => p[2])].join("\n"), value, levels: scatterLevels(points, centre) });
/** Columns with named level lines across them: `heights` the bars (`x`, `w` theirs, the words in a margin to their left), `lines` [height, word] (0 to 1 of `h`), `shown` the lines standing (from 0); `value` is the line in play (from 1), and every bar over it is red. */
export const levels = (id: string, x: number, y: number, heights: number[], lines: [number, string][], shown: number[] = [], value = 0, w = heights.length * 76, h = 96, text = ""): Thing => {
  const lv = levelLines(heights, lines, shown), gut = lv[lv.length - 1]!;
  return { id, kind: "levels", x: x - gut, y, w: w + gut, h, text: [text, ...lines.map((l) => l[1])].join("\n"), value, span: heights.length, levels: lv };
};
/** A conveyor of `tokens` ("record", "barrier", or a short word each), `span` places of `pitch` showing; `value` is the offset: the first token stands in the rightmost place at 0 and each unit slides them all one place right (in at the left, out at the right), a barrier an upright bar between two cells. `set` it in beats; held, the belt stands still. */
export const belt = (id: string, x: number, y: number, tokens: string[], value = 0, span = 7, pitch = 48, text = ""): Thing => ({ id, kind: "belt", x, y, w: span * pitch, h: Math.round(pitch * 0.84) + 10, text: [text, ...tokens].join("\n"), value, span });
/** Spans on one shared time scale (`n` cells of `size`), packed into the fewest rows they fit without overlapping, under the stream of `points` they are cut from (0 to 1 along): each of `spans` [from, to] is the run of cells it covers, the points it holds hatched in;
 *  `value` is how many spans are laid (a part of one grows the next). A beat's `cut: { id: shingleLevels(points, spans, slots) }` re-cuts them and they slide and re-pack: give every cut the same `slots` (the most spans any cut has). */
export const shingles = (id: string, x: number, y: number, n: number, points: number[], spans: [number, number][], value = 0, size = 40, slots = spans.length, text = ""): Thing => {
  const lv = shingleLevels(points, spans, slots), rows = Math.max(1, ...lv.slice(1 + points.length).filter((_, i) => i % 3 === 2).map((r) => r + 1));
  return { id, kind: "shingles", x, y, w: n * size, h: Math.round(size * ((points.length ? 1.6 : 0) + rows * 1.2 - 0.2)), text, value, span: n, levels: lv };
};
/** Shingles' levels: the points, then the spans (clipped to 0 to 1) each with the row it packs into (the lowest free one, taken in order of start), padded to `slots` with empty spans at the last one's end. */
export const shingleLevels = (points: number[], spans: [number, number][], slots = spans.length): number[] => {
  const c = (v: number) => Math.min(1, Math.max(0, v)), cut = spans.map(([a, b]) => [c(Math.min(a, b)), c(Math.max(a, b))] as const), ends: number[] = [], row: number[] = [];
  for (const i of cut.map((_, i) => i).sort((i, j) => cut[i]![0] - cut[j]![0] || i - j)) { const [a, b] = cut[i]!; let r = ends.findIndex((e) => e <= a + 1e-9); if (r < 0) r = ends.push(b) - 1; else ends[r] = b; row[i] = r; }
  const last = cut.length ? [cut[cut.length - 1]![1], cut[cut.length - 1]![1], row[cut.length - 1]!] : [1, 1, 0];
  return [points.length, ...points.map(c), ...cut.flatMap(([a, b], i) => [a, b, row[i]!]), ...Array.from({ length: Math.max(0, slots - cut.length) }, () => last).flat()];
};
/** A scale of numbered notches, `from` to `to` (each its number under it), with a pawl, an upright bar, at `value`, the highest number seen: every notch at or below it is hatched shut. `tokens` are this moment's arrivals,
 *  taken in order against `value`: one dropping on an open notch seats there and the pawl clicks up to it, one on a shut notch bounces off red. Send tokens in with a beat's `cut: { id: ratchetLevels(from, to, seen, tokens) }`
 *  (`seen` the highest before them) and `set` it to the highest after; a later cut without them lifts them away. */
export const ratchet = (id: string, x: number, y: number, from: number, to: number, value = 0, tokens: number[] = [], pitch = 48, h = 104, text = ""): Thing => ({ id, kind: "ratchet", x, y, w: Math.max(1, Math.round(to - from) + 1) * pitch, h, text, value, levels: ratchetLevels(from, to, value, tokens) });
/** A ratchet's levels: its first and last numbers, then on each notch the tokens that found it open (each raising the highest seen) and those that found it shut, taken in order from `seen`. */
export const ratchetLevels = (from: number, to: number, seen: number, tokens: number[] = []): number[] => {
  const n = Math.max(1, Math.round(to - from) + 1), open = Array.from({ length: n }, () => 0), shut = open.slice();
  let high = seen;
  for (const k of tokens) { const i = Math.round(k - from); if (i < 0 || i >= n) continue; if (k > high) { open[i]!++; high = k; } else shut[i]!++; }
  return [from, to, ...open, ...shut];
};
/** A wheel of `n` equal slots round a ring centred on (x, y), `r` its outer radius and `band` a slot's depth (0 to 1 of r): `set` slots hatched, `lit` ones lit, `hits` this moment's balls just outside their slots (slot indexes: one finding its slot empty is filled and sets it, one finding it set is red); `value` the slot being read (from 1; 0: none).
 *  A beat's `cut: { id: wheelLevels(n, set, hits, lit) }` (`set` as it was before the hits) drops the new balls in from outside, lifts the last moment's away, and sweeps full each empty slot a ball lands on. */
export const wheel = (id: string, x: number, y: number, r: number, n: number, set: number[] = [], hits: number[] = [], lit: number[] = [], value = 0, band = 0.3, text = ""): Thing => {
  // (its box leaves room round the ring for a ball)
  const R = Math.round(r * 1.12);
  return { id, kind: "wheel", x: x - R, y: y - R, w: R * 2, h: R * 2, text, value, span: n, levels: wheelLevels(n, set, hits, lit, band) };
};
/** A wheel's levels: its slots' depth, then each slot set (`set`, and every slot a hit finds empty), lit, the hits that found it empty, and the hits that found it set (taken in order: a second ball on a slot the first just set is red). */
export const wheelLevels = (n: number, set: number[] = [], hits: number[] = [], lit: number[] = [], band = 0.3): number[] => {
  const now = new Set(set), fresh = Array.from({ length: n }, () => 0), wasted = fresh.slice();
  for (const h of hits) { if (h < 0 || h >= n) continue; if (now.has(h)) wasted[h]!++; else { fresh[h]!++; now.add(h); } }
  return [band, ...fresh.map((_, i) => (now.has(i) ? 1 : 0)), ...fresh.map((_, i) => (lit.includes(i) ? 1 : 0)), ...fresh, ...wasted];
};
/** A ring buffer of `n` equal slots round a ring centred on (x, y), `r` its outer radius and `band` a slot's depth (0 to 1 of r), with a head and a tail pointer outside it at slot boundaries (0 the top, counting clockwise):
 *  the entries are the slots from `head` round to `tail`, hatched; `value` the slot being read (from 1; 0: none). Wires land on "id#head" and "id#tail". A beat's `cut: { id: ringLevels(head, tail) }` moves the pointers
 *  round slot by slot, filling or draining the stretch between them; let them count on past n (9 of 8 is slot 1, once more round) so they keep going clockwise through the top. `names` rename the pointers. */
export const ringbuf = (id: string, x: number, y: number, r: number, n: number, head = 0, tail = 0, value = 0, band = 0.3, text = "", names: [string, string] = ["head", "tail"]): Thing => {
  // (its box leaves room round the ring for the pointers and their names)
  const R = Math.round(r * 1.24);
  return { id, kind: "ringbuf", x: x - R, y: y - R, w: R * 2, h: R * 2, text: [text, ...names].join("\n"), value, span: n, levels: ringLevels(head, tail, band) };
};
/** A ring buffer's levels: its slots' depth, then where the head and the tail stand (in slots). */
export const ringLevels = (head: number, tail: number, band = 0.3): number[] => [band, head, tail];
/** Levels' levels, for a beat's `cut`: the bars' heights, then the lines', then which lines stand (from 0; they fade in as they come), then the words' margin. */
export const levelLines = (heights: number[], lines: [number, ...unknown[]][], shown: number[] = []): number[] => [...heights, ...lines.map((l) => l[0]), ...lines.map((_, i) => (shown.includes(i) ? 1 : 0)), lines.reduce((m, l) => Math.max(m, typeof l[1] === "string" && l[1] ? Math.ceil(l[1].length * 6.6) + 20 : 0), 0)];
/** A scatter with a fence: `points` and `centre` as scatter's, and a closed hatched region through `corners` [x, y] (0 to 1 of the mark), `name` on its top edge: `value` is how far the reach has grown, lighting the points it takes; the fence never moves, and the points inside it are drawn held. */
export const fence = (id: string, x: number, y: number, points: [number, number, string][], centre: [number, number, number], corners: [number, number][], name: string, value = 0, w = 480, h = 320, text = ""): Thing => ({ id, kind: "fence", x, y, w, h, text: [text, name, ...points.map((p) => p[2])].join("\n"), value, levels: fenceLevels(points, centre, corners) });
/** A scatter keeping several reaches: `points` [x, y, word] as scatter's and `reaches` [x, y, r, name] (r 0 to 1 of `w`), each its own named broken circle, a point lit when any of them holds it: `value` is how many reaches are drawn (a part of one grows the next), the newest in the accent. */
export const reaches = (id: string, x: number, y: number, points: [number, number, string][], rs: [number, number, number, string][], value = 0, w = 480, h = 320, text = ""): Thing => ({ id, kind: "reaches", x, y, w, h, text: [text, ...rs.map((r) => r[3]), ...points.map((p) => p[2])].join("\n"), value, levels: reachLevels(points, rs) });
/** Reaches' levels: how many reaches, each [x, y, r], then the points. */
export const reachLevels = (points: [number, number, ...unknown[]][], rs: [number, number, number, ...unknown[]][]): number[] => [rs.length, ...rs.flatMap((r) => [r[0], r[1], r[2]]), ...points.flatMap((p) => [p[0], p[1]])];
/** A fence's levels: its reach's centre and radius, how many corners, the corners, then its points. */
export const fenceLevels = (points: [number, number, ...unknown[]][], centre: [number, number, number], corners: [number, number][]): number[] => [...centre, corners.length, ...corners.flat(), ...points.flatMap((p) => [p[0], p[1]])];
/** One straight edge of a boundary as a hatched wall, `len` long and `thick` through, with named `openings` [at, name, wide?] (0 to 1 along; wide in thicknesses, 2 if left out) and `hits` [at, on]: `side` is where the inside is
 *  ("b", "t": it lies across; "r", "l": upright); `value` is the opening a wire is using (from 1), lit, and a hit is a short red bar on the outside face where a lost wire struck (wire it to that face and `refuse` it; `cut` the hit's on from 0 to 1).
 *  A thing set across it, drawn after it, stands in it. */
export const wall = (id: string, x: number, y: number, len: number, openings: [number, string, number?][] = [], side: "t" | "b" | "l" | "r" = "b", value = 0, hits: [number, number][] = [], text = "", thick = 20): Thing => {
  const across = side === "t" || side === "b";
  return { id, kind: "wall", x, y, w: across ? len : thick, h: across ? thick : len, text: [text, ...openings.map((o) => o[1])].join("\n"), value, levels: wallLevels(side, openings, hits) };
};
/** A wall's levels: which side the inside is, how many openings, each [at, wide], then its hits [at, on]. */
export const wallLevels = (side: "t" | "b" | "l" | "r", openings: [number, string, number?][] = [], hits: [number, number][] = []): number[] => [side === "t" || side === "l" ? 1 : 0, openings.length, ...openings.flatMap((o) => [o[0], o[2] ?? 2]), ...hits.flat()];
/** A block hung by `threads` [name, at] (0 to 1 across) from a ceiling rule, each named over it, the block carrying `words` and a `detail` line (say one line to change it): `value` is the thread followed (from 1), lit;
 *  `held` threads (from 0; left out: all) hang to the block, `cut` ones snap red and fall away (`cut: { id: tetherLevels(threads, held, cut) }`), and when none holds it the block drops to the floor and fades. A reference count, drawn as what holds a thing up. */
export const tether = (id: string, x: number, y: number, words: string, detail: string, threads: [string, number][], held?: number[], cut: number[] = [], value = 0, w = 600, h = 260): Thing => ({ id, kind: "tether", x, y, w, h, text: [words, detail, ...threads.map((q) => q[0])].join("\n"), value, levels: tetherLevels(threads, held, cut) });
/** A tether's levels: how many threads, then each [at, held, cut], the `held` ones (from 0; left out: all) hanging and the `cut` ones cut. */
export const tetherLevels = (threads: [string, number][], held?: number[], cut: number[] = []): number[] => [threads.length, ...threads.flatMap((q, i) => [q[1], !held || held.includes(i) || cut.includes(i) ? 1 : 0, cut.includes(i) ? 1 : 0])];
/** Named tokens on a scale `from` to `to`, each of `keys` [number, word] standing at its number, tokens whose places collide stacked into a pile there (the later on top): `value` is how many have come in (a part of one: the next dropping in), the newest lit; past the last, none. A beat's `cut: { id: tokenLevels(from, to, keys) }` moves them and they glide. */
export const tokens = (id: string, x: number, y: number, from: number, to: number, keys: [number, string][], value = keys.length + 1, w = 480, h = 96, text = ""): Thing => ({ id, kind: "tokens", x, y, w, h, text: [text, ...keys.map((k) => k[1])].join("\n"), value, levels: tokenLevels(from, to, keys) });
/** A break: a torn edge across `strip` (a strip or a row of cells) at `at` (0 to 1 along it), `text` over its top: `value` 0 to 1 tears it down in red, 1 to 2 settles it into a quiet seam once the gap is filled. */
export const tear = (id: string, strip: Thing, at: number, value = 0, text = ""): Thing => ({ id, kind: "break", x: strip.x + at * strip.w - 8, y: strip.y - 10, w: 16, h: strip.h + 20, text, value });
/** A trail: one moving point named `name`, riding beside it, along `path` [x, y] (0 to 1 across and down the mark), leaving an open point at each `kept` place it has passed (from 0; left out: all): `value` is how far along it has got (0 the first place, a part of one gliding it to the next), so `set` it with `over` and it rides the path; a strobe of the same moves is a trail with fewer places kept. */
export const trail = (id: string, x: number, y: number, name: string, path: [number, number][], kept?: number[], value = 0, w = 480, h = 320): Thing => ({ id, kind: "trail", x, y, w, h, text: name, value, levels: trailLevels(path, kept) });
/** Tries: one column per run, a square per try stacked upward: each of `fails` is how many tries failed before one passed (at `limit` or past it: all of them failed), a failed try hatched, the one that passed solid,
 *  a verdict cap on top (green: a try passed, red: none did) and a dashed line at `limit`. `value` is how many runs are drawn, a part of one growing the next try by try and then its cap; a beat's `cut: { id: [limit, ...fails] }` changes them. */
export const tries = (id: string, x: number, y: number, fails: number[], limit = 3, value = 0, w = fails.length * 56, h = limit * 44 + 44, text = ""): Thing => ({ id, kind: "tries", x, y, w, h, text, value, levels: [limit, ...fails] });
/** A cone: a forecast fan over a time axis of `span` months, `points` the real heights month by month (0 to 1) and a ceiling across at `ceiling` carrying its `words`: `band` [from, slope, spread] starts at month `from` on its point and rises `slope` a month,
 *  widening `spread` a month each way; a real point outside it (or, up to its month, outside the `old` band it was re-aimed from, left standing faint) is red, and the instant the band's top meets the ceiling is marked on the axis with `when` under it.
 *  `value` is how many real points are in (a part of one fading the next in); a beat's `cut: { id: coneLevels(...) }` re-aims the band and it swings. */
export const cone = (id: string, x: number, y: number, text: string, points: number[], span: number, ceiling: number, band: [number, number, number], old?: [number, number, number], value = 1, words = "", when = "", w = span * 30, h = 150): Thing => ({ id, kind: "cone", x, y, w, h, text: [text, words, when].join("\n"), value, levels: coneLevels(span, points, ceiling, band, old) });
/** A cone's levels: its span, the ceiling, whether an old band stands, the band [from, aim, slope, spread] (aim: its point's height at `from`), the old band the same way, then the points. */
/** A trie (a prompt tree): `prompts`, each a list of parts ("Contract.pdf", or "You are a lawyer…  system" with its name under it), drawn as welded strips that share one trunk as far as they agree and split where they first differ; `value` is the prompt in question (from 1), its path from the root lit, and a beat's `cut: { id: trieLevels(prompts, grown) }` grows each prompt (0 to 1) out of where it leaves the ones before it. */
export const trie = (id: string, x: number, y: number, w: number, h: number, prompts: string[][], value = 0, grown?: number[], sizes?: number[][]): Thing => ({ id, kind: "trie", x, y, w, h, text: prompts.map((p) => p.join(" | ")).join("\n"), value, levels: trieLevels(prompts, grown, sizes) });
/** A trie's levels: how many prompts, how far each has grown (left out: all of them), then each part's size (left out: 1; a part shared with an earlier prompt keeps that one's). */
export const trieLevels = (prompts: string[][], grown: number[] = prompts.map(() => 1), sizes?: number[][]): number[] => [prompts.length, ...prompts.map((_, i) => grown[i] ?? 0), ...prompts.flatMap((p, i) => p.map((_, j) => sizes?.[i]?.[j] ?? 1))];
/** Spans: rows of floating ranges, each of `ranges` [from, to], on one scale `from` to `to` (`unit` after each number), named by `names` in a margin, with a band `band` [lo, hi] called `words` laid across every row: `value` is how far the band is in (0 to 1);
 *  a row lights where its range meets the band and fades where it misses, and a beat's `cut: { id: spanLevels(from, to, band, ranges) }` slides and resizes the band, the rows judged again as it passes. */
export const spans = (id: string, x: number, y: number, from: number, to: number, ranges: [number, number][], band: [number, number], value = 1, names: string[] = [], words = "", unit = "", w = 720, h = ranges.length * 48 + 54, text = ""): Thing => ({ id, kind: "spans", x, y, w, h, text: [text, words, ...names].join("\n"), value, levels: spanLevels(from, to, band, ranges), ...(unit ? { unit } : {}) });
/** Spans' levels: the scale's first and last numbers, the band [lo, hi], then each row's range. */
export const spanLevels = (from: number, to: number, band: [number, number], ranges: [number, number][]): number[] => [from, to, band[0], band[1], ...ranges.flat()];
/** A minmax: blocks as points at (min, max), each of `points` [min, max, name], on one scale `from` to `to` both ways (`unit` after each number), the diagonal min = max a centre line: `value` is a query's low end lo and `wide` its width (0: one value), its crosshair at (lo + wide, lo);
 *  the corner min ≤ lo + wide, max ≥ lo is hatched and the points in it lit, `words` beside it. `set` slides it along the diagonal; a beat's `cut: { id: minmaxLevels(from, to, wide, shown, points) }` changes its width or shows it (0 to 1). */
export const minmax = (id: string, x: number, y: number, from: number, to: number, points: [number, number, string?][], value = from, wide = 0, words = "", shown = 1, unit = "", axes: [string, string] = ["min", "max"], w = 400, h = 400, text = ""): Thing => ({ id, kind: "minmax", x, y, w, h, text: [text, ...axes, words, ...points.map((p) => p[2] ?? "")].join("\n"), value, levels: minmaxLevels(from, to, wide, shown, points), ...(unit ? { unit } : {}) });
/** A minmax's levels: the scale's first and last numbers, the query's width, how far it is shown (0 to 1), then each point [min, max]. */
export const minmaxLevels = (from: number, to: number, wide: number, shown: number, points: [number, number, ...unknown[]][]): number[] => [from, to, wide, shown, ...points.flatMap((p) => [p[0], p[1]])];
/** A rider: a small token bound to the wire `wire`, carrying `words` ("cookie 7b1e4a02"): `value` is how far along the wire it is (0 its start, 1 its end); a beat that runs the wire carries it to the end and one that runs back along it to the start, in that moment, and it stays parked there. */
/** A loop: one closed square ring round the things `a` and `b` that hold each other, standing `gap` px clear of both and moving with them, a head on each long side so it reads as going round: `value` is how far round it is drawn (0 to 1), and a beat's `busy` sends a light round it without stopping. */
export const loop = (id: string, a: string, b: string, gap = 24, value = 1, text = ""): Thing => ({ id, kind: "loop", x: 0, y: 0, w: 10, h: 10, text, value, levels: [gap], loops: [a, b] });
/** A staple: short square brackets clipping `a` and `b` together across the seam between them (one under the other or side by side), one at each of `at` along their shared edge (0 to 1), moving with them wherever they go; `value` is how far it has closed (0 open; 1 each spine bitten `bite` px into both edges, its legs folded in), and a `later` one closes as it is `show`n. */
export const staple = (id: string, a: string, b: string, at: number[] = [0.25, 0.75], value = 1, bite = 12, text = ""): Thing => ({ id, kind: "staple", x: 0, y: 0, w: 10, h: 10, text, value, levels: [bite, ...at], staples: [a, b] });
export const rider = (id: string, wire: string, words: string, value = 0): Thing => ({ id, kind: "rider", x: 0, y: 0, w: 10, h: 10, text: words, value, rides: wire });
export const coneLevels = (span: number, points: number[], ceiling: number, band: [number, number, number], old?: [number, number, number]): number[] => {
  const aim = (b: [number, number, number]) => [b[0], points[Math.max(0, Math.min(points.length - 1, Math.round(b[0])))] ?? 0, b[1], b[2]];
  return [span, ceiling, old ? 1 : 0, ...aim(band), ...aim(old ?? band), ...points];
};
/** Jaws: a scale of `n` positions (`size` square, `pitch` apart, as `cells`) with a lower and an upper jaw at positions `lo` and `hi`, each a small tab under it named by `names`: every position at or past a jaw is hatched,
 *  the `probe` (from 0; left out: none) lit between them, and a measure between the jaws counts what is left ("7 left"). A beat's `cut: { id: jawLevels(lo, hi, probe) }` slides the jaws in, the hatching following. */
export const jaws = (id: string, x: number, y: number, n: number, lo: number, hi: number, probe = -1, names: [string, string] = ["lo", "hi"], size = 40, pitch = 64, left = "left", text = ""): Thing => ({ id, kind: "jaws", x, y, w: (n - 1) * pitch + size, h: size + 44, text: [text, ...names, left].join("\n"), span: n, levels: jawLevels(lo, hi, probe) });
/** Jaws' levels: where the lower and upper jaw stand, where the probe stands (with none, half way between them, where the next one will land), then how lit it is. */
export const jawLevels = (lo: number, hi: number, probe = -1): number[] => [lo, hi, probe >= 0 ? probe : (lo + hi) / 2, probe >= 0 ? 1 : 0];
/** A trail's levels: how many places, each place [x, y], then whether each is kept (from 0; left out: all). */
export const trailLevels = (path: [number, number][], kept?: number[]): number[] => [path.length, ...path.flat(), ...path.map((_, i) => (!kept || kept.includes(i) ? 1 : 0))];
/** Tokens' levels: the scale's first and last numbers, then each token's number, in the order they come in. */
export const tokenLevels = (from: number, to: number, keys: [number, ...unknown[]][]): number[] => [from, to, ...keys.map((k) => k[0])];
/** A scatter's levels: its reach's centre and radius, then its points. */
export const scatterLevels = (points: [number, number, ...unknown[]][], centre: [number, number, number]): number[] => [...centre, ...points.flatMap((p) => [p[0], p[1]])];
/** A plane keeping two boxes at once, its grid and points as `plane`'s: `value` is one point (from 1; 0: none) and `other` the second (from 1; 0: none); what both boxes hold stays plain, what only one holds is tinted its own way,
 *  and both turn red when neither box holds the other. A part of either slides that box to the next point; slide the second with a beat's `cut` (`overlapLevels`). */
export const overlap = (id: string, x: number, y: number, across: string, up: string, na: number, nb: number, points: [number, number][], value = 0, other = 0, names: string[] = [], w = (na + 1) * 120, h = (nb + 1) * 96): Thing => ({ id, kind: "overlap", x, y, w, h, text: [across, up, ...names].join("\n"), value, levels: overlapLevels(na, nb, points, other) });
/** An overlap's levels: how far its counts go, its second point (from 1; 0: none), then its points. */
export const overlapLevels = (na: number, nb: number, points: [number, number][], other: number): number[] => [na, nb, other, ...points.flat()];
/** A field of named keys placed by two measures, `keys` [x, y, word, there?] (0 to 1 across and up from its bottom left; there 0: not yet in), with keep regions `cuts`: across keeps what is right of `at` (with `corner`, also what is above it, an L),
 *  up keeps what is above `at` (with `corner`, also what is right of it); a key outside every region fades out, and `value` is the cut in play (from 1; 0: none), its region and the keys inside it lit. A beat's `cut: { id: fieldLevels(keys, cuts) }` moves the keys across the edges. */
export const field = (id: string, x: number, y: number, across: string, up: string, keys: FieldKey[], cuts: FieldCut[], value = 0, w = 480, h = 320): Thing => ({ id, kind: "field", x, y, w, h, text: [across, up, ...cuts.map((c) => c.name), ...keys.map((k) => k[2])].join("\n"), value, levels: fieldLevels(keys, cuts) });
export type FieldKey = [number, number, string, number?];
export type FieldCut = { axis: "across" | "up"; at: number; corner?: number; name: string };
/** A field's levels: how many cuts, each cut [axis, at, corner], then each key [x, y, there]. */
export const fieldLevels = (keys: [number, number, ...unknown[]][], cuts: Omit<FieldCut, "name">[]): number[] => [cuts.length, ...cuts.flatMap((c) => [c.axis === "up" ? 1 : 0, c.at, c.corner ?? 0]), ...keys.flatMap((k) => [k[0], k[1], typeof k[3] === "number" ? k[3] : 1])];
/** A plane's levels: how far its counts go, then its points. */
export const planeLevels = (na: number, nb: number, points: [number, number][]): number[] => [na, nb, ...points.flat()];
/** A row of cells' levels: the `set` cells (from 0) hatched, the `read` ones lit, the `dirty` ones flagged. */
export const cellLevels = (n: number, set: number[] = [], read: number[] = [], dirty: number[] = []): number[] => [set, read, dirty].flatMap((on) => Array.from({ length: n }, (_, i) => (on.includes(i) ? 1 : 0)));
/** One run of `bits` ("0100…": a 1 hatched) set `width` to a row from (x, y), each bit `size` on a side, `pitch` apart across and rows `rowPitch` apart, each row named by `names` at its end; `lit` rows (from 0) lit, `value` one bit being read (from 1; 0: none).
 *  A beat's `cut: { id: wrapLevels(bits, width, lit) }` with a new width re-wraps it, every bit travelling from its old place to its new one; `say` the new rows' names (after an empty first line) in the same beat, and they wait out the move. */
export const wrap = (id: string, x: number, y: number, bits: string, width: number, names: string[] = [], lit: number[] = [], value = 0, size = 21, pitch = 25, rowPitch = 31, text = ""): Thing => ({ id, kind: "wrap", x, y, w: (Math.min(width, bits.length) - 1) * pitch + size, h: (Math.ceil(bits.length / width) - 1) * rowPitch + size, text: [text, ...names].join("\n"), value, levels: wrapLevels(bits, width, lit, size, pitch, rowPitch) });
/** A wrap's levels: a bit's side, the pitch across and down, then each bit [set, across, down, lit], set `width` to a row with the `lit` rows lit. */
export const wrapLevels = (bits: string, width: number, lit: number[] = [], size = 21, pitch = 25, rowPitch = 31): number[] => [size, pitch, rowPitch, ...[...bits].flatMap((c, i) => { const row = Math.floor(i / width); return [c === "1" ? 1 : 0, i % width, row, lit.includes(row) ? 1 : 0]; })];
/** A panel holding a mark (a gauge, a queue…) in its body, under its detail line: the panel grows downward to fit (its top, and the notch wires meet, stay where they were) and the mark stands inside it. */
export const holding = (p: Thing, m: Thing): Thing[] => {
  // (a mark whose words are its data, its rows or its parts' names, keeps them; a mark's own caption gives way to the panel's detail)
  const data = m.kind === "window" || m.kind === "segments" || m.kind === "parts" || m.kind === "timeline", text = p.detail !== undefined && !data ? "" : m.text, w = p.w - 32, off = 52 + 46 + (text && !data ? 20 : 0), h = Math.max(p.h, off + m.h + 20), y = p.y;
  return [{ ...p, y, h }, { ...m, text, x: p.x + 16, y: y + off, w }];
};
/** A hierarchy laid out for you, root on top: `levels` is one row per level, each node [id, name, parent's index in the row above].
 *  Light the path with `on` and run its edges (`<child id>-up`, from parent to child) with `run`, one level per moment. */
export const tree = (x: number, y: number, levels: [string, string, number][][], o: { w?: number; h?: number; gap?: number; drop?: number } = {}): { things: Thing[]; links: Link[] } => {
  const w = o.w ?? 170, h = o.h ?? 56, gap = o.gap ?? 40, drop = o.drop ?? 120, widest = Math.max(...levels.map((r) => r.length)), full = widest * w + (widest - 1) * gap;
  const things: Thing[] = [], links: Link[] = [];
  levels.forEach((row, d) => {
    const span = row.length * w + (row.length - 1) * gap, x0 = x + (full - span) / 2;
    row.forEach(([id, name, p], i) => {
      things.push(card(id, x0 + i * (w + gap), y + d * drop, name, w, h));
      if (d > 0) { const parent = levels[d - 1]![p]; if (parent) links.push(wire(id + "-up", `${parent[0]}.b`, `${id}.t`, { elbow: true, plain: true })); }
    });
  });
  return { things, links };
};
/** A party's line in a sequence of turns: dashed, from the middle of its bottom edge straight down to `y1`; `x` is its panel's middle. */
export const lifeline = (id: string, party: string, x: number, y1: number): Link => ({ id, a: [party, 0.5, 1], b: [x, y1], plain: true, dashed: true });
/** A message across from the sender's line (at x1) to the receiver's (at x2), at height `y`; not there until a beat shows it, and stays once shown.
 *  Always `run` it, never `back` or `refuse` it: an answer is a message of its own, a row lower. A no or a failure: `tone` "red". */
export const message = (id: string, x1: number, x2: number, y: number, text: string, tone?: Link["tone"]): Link => ({ id, a: [x1, y], b: [x2, y], text, hidden: true, ...(tone ? { tone } : {}) });
