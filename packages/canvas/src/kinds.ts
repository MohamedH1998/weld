// The shapes the board knows, in one place: each one's name, where it
// sits in the library, the key that picks it, the size a click makes,
// and where its words go. The toolbar, the library, the keyboard and the
// drawing code all read from here.
import type { BoxKind } from "./types";

export type Group = "Basics" | "Things" | "Places" | "Marks" | "Wiring" | "Controls" | "Live" | "Media" | "Legacy";
/** Where a shape's words sit: in its middle, in a header band, on its
 *  top edge as a name, or above it as a caption. */
export type LabelAt = "centre" | "header" | "name" | "caption";

export interface KindDef {
  kind: BoxKind;
  name: string;
  group: Group;
  key?: string;
  w: number;
  h: number;
  label: LabelAt;
  /** Stands on paper of its own: what is behind it does not show through. */
  paper: boolean;
  /** Carries a level, adjusted in steps. */
  level?: { max: number; step: number; start: number };
  /** Takes a fill (outline, tinted, filled). */
  fills: boolean;
}

const def = (kind: BoxKind, name: string, group: Group, w: number, h: number, label: LabelAt, paper: boolean, fills: boolean, key?: string, level?: KindDef["level"]): KindDef =>
  ({ kind, name, group, key, w, h, label, paper, fills, level });

export const KINDS: Record<BoxKind, KindDef> = {
  rect: def("rect", "Rectangle", "Basics", 160, 72, "centre", false, true, "r"),
  ellipse: def("ellipse", "Ellipse", "Basics", 160, 72, "centre", false, true, "o"),
  diamond: def("diamond", "Diamond", "Basics", 160, 96, "centre", false, true, "d"),
  // things: solid silhouettes that wires dock into
  card: def("card", "Card", "Things", 160, 56, "centre", true, true, "c"),
  machine: def("machine", "Machine", "Things", 176, 100, "header", true, true, "j"),
  panel: def("panel", "Panel", "Things", 160, 84, "header", true, true, "y"),
  // places: fences around things that live together
  boundary: def("boundary", "Boundary", "Places", 300, 176, "name", false, false, "b"),
  frame: def("frame", "Frame", "Places", 400, 250, "name", false, false, "f"),
  pill: def("pill", "Nameplate", "Things", 150, 34, "centre", true, true, "n"),
  // marks: one idea each
  glyph: def("glyph", "Compute", "Marks", 88, 32, "caption", true, true, "g"),
  meter: def("meter", "Meter", "Marks", 160, 16, "caption", true, false, "m", { max: 1, step: 0.05, start: 0.6 }),
  bars: def("bars", "Bars", "Marks", 128, 24, "caption", true, false, "i", { max: 1, step: 0.2, start: 0.6 }),
  queue: def("queue", "Queue", "Marks", 168, 44, "caption", true, false, "q", { max: 5, step: 1, start: 3 }),
  pad: def("pad", "Pad", "Wiring", 28, 28, "caption", true, true, "u"),
  junction: def("junction", "Junction", "Wiring", 12, 12, "caption", true, false, "k"),
  button: def("button", "Button", "Controls", 140, 32, "centre", true, false, "x"),
  clock: def("clock", "Clock", "Controls", 64, 64, "caption", true, false, "z"),
  // what is kept, what is read, who asks
  // marks: one idea each
  timer: def("timer", "Timer", "Marks", 44, 44, "caption", true, false, undefined, { max: 1, step: 0.125, start: 0.75 }),
  // the thing itself, small: a window with its rows, a recording, a measured line, a number line, a curve on its axes
  window: def("window", "Window", "Things", 150, 150, "centre", true, false, undefined, { max: 12, step: 1, start: 0 }),
  wave: def("wave", "Recording", "Marks", 200, 56, "caption", false, false, undefined, { max: 1, step: 0.1, start: 0.7 }),
  rule: def("rule", "Measure", "Marks", 140, 16, "centre", false, false),
  axis: def("axis", "Number line", "Marks", 280, 40, "caption", false, false, undefined, { max: 1, step: 0.05, start: 0.5 }),
  plot: def("plot", "Plot", "Marks", 200, 120, "caption", false, false, undefined, { max: 1, step: 0.1, start: 1 }),
  // live things: they are put down from the toolbar, never from the library
  thread: def("thread", "Thread", "Live", 480, 620, "header", true, false),
  terminal: def("terminal", "Terminal", "Live", 640, 400, "header", true, false),
  browser: def("browser", "Browser", "Live", 880, 620, "header", true, false),
  // kinds the board no longer offers: still drawn, moved and edited where an older board has them, never put down anew
  store: def("store", "Store", "Legacy", 132, 88, "centre", true, true),
  table: def("table", "Table", "Legacy", 176, 78, "centre", true, false, undefined, { max: 12, step: 1, start: 0 }),
  page: def("page", "Page", "Legacy", 60, 76, "caption", true, false, undefined, { max: 1, step: 0.2, start: 0.6 }),
  person: def("person", "Person", "Legacy", 44, 48, "caption", true, true),
  trace: def("trace", "Trace", "Legacy", 160, 44, "caption", false, false, undefined, { max: 1, step: 0.1, start: 1 }),
  tape: def("tape", "Tape", "Legacy", 200, 26, "caption", false, false, undefined, { max: 1, step: 0.1, start: 0.4 }),
  lock: def("lock", "Lock", "Legacy", 34, 42, "caption", true, false, undefined, { max: 1, step: 1, start: 1 }),
  switch: def("switch", "Switch", "Legacy", 44, 24, "caption", true, false, undefined, { max: 1, step: 1, start: 1 }),
  // a picture: pasted, dropped, or taken of a page (never from the library)
  image: def("image", "Picture", "Media", 320, 200, "caption", true, false),
  // a construction drawing's marks: a region singled out, a line the drawing was set out by, a whole cut into its parts
  hatch: def("hatch", "Hatch", "Marks", 120, 80, "caption", false, false, undefined, { max: 1, step: 0.1, start: 1 }),
  guide: def("guide", "Guide", "Marks", 200, 12, "caption", false, false),
  ticks: def("ticks", "Activity", "Marks", 240, 12, "caption", false, false, undefined, { max: 1, step: 0.1, start: 1 }),
  legend: def("legend", "Legend", "Marks", 180, 96, "centre", false, false),
  parts: def("parts", "Parts", "Marks", 240, 28, "caption", false, false, undefined, { max: 8, step: 1, start: 2 }),
  // time laid out to scale, a level that fills and drains, a whole in its welded parts
  timeline: def("timeline", "Timeline", "Marks", 480, 112, "caption", false, false, undefined, { max: 24, step: 1, start: 24 }),
  tank: def("tank", "Tank", "Things", 180, 120, "centre", true, true, undefined, { max: 1, step: 0.1, start: 0.6 }),
  segments: def("segments", "Segments", "Things", 520, 56, "caption", true, false, undefined, { max: 24, step: 1, start: 1 }),
  // a level counted out: a column of units for each step, as many columns as its level
  units: def("units", "Units", "Marks", 168, 132, "caption", false, false, undefined, { max: 24, step: 1, start: 7 }),
  // a curve against a stair on one pair of axes, the space between them hatched where the curve is over and tinted where it is under
  gap: def("gap", "Gap", "Marks", 280, 160, "caption", false, false, undefined, { max: 1, step: 0.1, start: 1 }),
  // a plot of a value that changes in an instant: flat runs joined by square risers, drawn as far as it has got
  stair: def("stair", "Stair", "Marks", 240, 140, "caption", false, false, undefined, { max: 1, step: 0.1, start: 1 }),
  // a plot with a level line across it: each crossing of the line, once the curve has got there, drops a tick to the baseline and lights a dot
  threshold: def("threshold", "Threshold", "Marks", 240, 140, "caption", false, false, undefined, { max: 1, step: 0.1, start: 1 }),
  // one row of numbered points on a scale shared with the rows around it, walked as far as its level
  postings: def("postings", "Postings", "Marks", 264, 28, "caption", false, false, undefined, { max: 24, step: 1, start: 4 }),
  // a stretch of a circle between two angles, drawn as far round as its level; given a width, a hatched band
  arc: def("arc", "Arc", "Marks", 120, 120, "caption", false, false, undefined, { max: 1, step: 0.1, start: 1 }),
  // one line winding inward past a full turn, each lap a step nearer the centre and the laps past the first in their own tone; its level is how many turns are drawn
  spiral: def("spiral", "Spiral", "Marks", 120, 120, "caption", false, false, undefined, { max: 3, step: 0.25, start: 1.75 }),
  // a grid of crossings set out from two sequences, a diagonal in each free cell, and a path along it drawn as many steps as its level
  lattice: def("lattice", "Lattice", "Marks", 192, 144, "caption", false, false, undefined, { max: 24, step: 1, start: 4 }),
  // a row of equal square cells welded into one: some set (hatched), some flagged dirty (a filled corner), one read (lit), its level the cell being read
  cells: def("cells", "Cells", "Marks", 256, 32, "caption", false, false, undefined, { max: 24, step: 1, start: 3 }),
  // two counts on one welded grid, points standing at their pairs, and the box of everything one point holds hatched: its level is that point
  plane: def("plane", "Plane", "Marks", 240, 160, "caption", false, false, undefined, { max: 24, step: 1, start: 3 }),
  // many spans that start where they like and end on one shared edge, each drawn as far as its level, the edge standing when the level reaches 1
  comb: def("comb", "Comb", "Marks", 240, 120, "caption", false, false, undefined, { max: 1, step: 0.1, start: 1 }),
  // an upright bar for each value, standing on one shared baseline: its level is the bar picked
  columns: def("columns", "Columns", "Marks", 240, 96, "caption", false, false, undefined, { max: 24, step: 1, start: 4 }),
  // many named points in one field, and a reach about a centre that lights the points inside it: its level is how far the reach has grown
  scatter: def("scatter", "Scatter", "Marks", 240, 160, "caption", false, false, undefined, { max: 1, step: 0.1, start: 0.6 }),
  // columns with named level lines laid across them: its level is the line in play, and any bar standing over it is red
  levels: def("levels", "Levels", "Marks", 240, 120, "caption", false, false, undefined, { max: 8, step: 1, start: 1 }),
  // a conveyor of tokens (records, barriers between them, short words) that slides one place along for each unit of its level
  belt: def("belt", "Belt", "Marks", 336, 56, "caption", false, false, undefined, { max: 12, step: 1, start: 0 }),
  // spans on one time scale packed into the fewest rows they fit, each the run of cells it covers with the points it holds hatched; its level is how many spans are laid
  shingles: def("shingles", "Shingles", "Marks", 256, 128, "caption", false, false, undefined, { max: 8, step: 1, start: 3 }),
  // equal slots round a ring: some set (hatched), some lit, balls just outside the slots this moment's hits land on (red on a slot already set); its level the slot being read
  wheel: def("wheel", "Wheel", "Marks", 160, 160, "caption", false, false, undefined, { max: 24, step: 1, start: 3 }),
  // equal slots round a ring with a head and a tail pointer outside it: the entries are the stretch from head to tail, hatched; moving either fills or drains slot by slot through the top; its level the slot being read
  ringbuf: def("ringbuf", "Ring buffer", "Marks", 176, 176, "caption", false, false, undefined, { max: 24, step: 1, start: 0 }),
  // a plane with a limit each way drawn as a heavy named edge: a box grows from the corner along a slope until it meets one, which lights; its level is the slope in play
  // a scale of numbered notches with a pawl at the highest seen: every notch at or below it is shut, a token landing on an open one moves the pawl up, one landing on a shut one bounces off red
  ratchet: def("ratchet", "Ratchet", "Marks", 288, 104, "caption", false, false, undefined, { max: 6, step: 1, start: 3 }),
  // a plane keeping two points' boxes at once: what both hold plain, what only one holds tinted its own way, both red when neither holds the other; its level is the first point
  overlap: def("overlap", "Overlap", "Marks", 240, 160, "caption", false, false, undefined, { max: 24, step: 1, start: 3 }),
  // named keys in a field of two measures with keep regions cut across it, a straight band or an L each: a key outside every region fades out; its level is the cut in play
  field: def("field", "Field", "Marks", 240, 160, "caption", false, false, undefined, { max: 8, step: 1, start: 1 }),
  // a number line with a hatched bracket on it and pins dropped on it: a pin is lit while the bracket covers it, settled once its left edge is past; its level is where the left edge is
  interval: def("interval", "Interval", "Marks", 264, 52, "caption", false, false, undefined, { max: 24, step: 1, start: 2 }),
  // a scatter with a fence beside its reach: the reach lights the points it takes, the fence never moves and holds the points inside it; its level is how far the reach has grown
  fence: def("fence", "Fence", "Marks", 240, 160, "caption", false, false, undefined, { max: 1, step: 0.1, start: 0.6 }),
  // one edge of a boundary drawn as a hatched wall with named openings, a thing set across it standing in it: its level is the opening in use, lit; a lost wire leaves a red bar on its outside face
  wall: def("wall", "Wall", "Marks", 240, 20, "caption", false, false, undefined, { max: 4, step: 1, start: 1 }),
  // one run of bits set in rows of a width, each row named at its end: set bits hatched, rows lit; re-wrapped to a new width, every bit travels to its new place; its level the bit being read
  wrap: def("wrap", "Wrap", "Marks", 208, 52, "caption", false, false, undefined, { max: 24, step: 1, start: 3 }),
  // a block hung by named threads from a ceiling: a cut thread snaps red and its halves fall away, and when the last is cut the block drops to the floor and fades; its level is the thread followed, lit
  tether: def("tether", "Tether", "Marks", 320, 260, "caption", false, false, undefined, { max: 4, step: 1, start: 1 }),
  // named tokens on a scale, each at its number: tokens whose places collide stack into a pile there, and they glide when cut afresh; its level is how many have come in, the newest lit
  tokens: def("tokens", "Tokens", "Marks", 320, 96, "caption", false, false, undefined, { max: 6, step: 1, start: 4 }),
  // a torn edge across a strip at one place: it tears down in red the moment a stream is cut, then settles into a quiet seam once the gap is filled; its level is how far it has gone, 0 to 2
  break: def("break", "Break", "Marks", 24, 88, "caption", false, false, undefined, { max: 2, step: 0.25, start: 1 }),
  // one moving point with its name riding beside it, leaving an open point at each kept place it has passed; its level is how far along its path it has got
  trail: def("trail", "Trail", "Marks", 240, 160, "caption", false, false, undefined, { max: 7, step: 0.5, start: 5 }),
  // a scale of positions with a lower and an upper jaw, each a named tab: what lies at or outside them hatched, the probe lit between them, a measure counting what is left
  jaws: def("jaws", "Jaws", "Marks", 400, 84, "caption", false, false),
  // a scatter keeping several named reaches at once, each its own broken circle: a point inside any of them is lit; its level is how many reaches are drawn, a part of one growing the next
  reaches: def("reaches", "Reaches", "Marks", 240, 160, "caption", false, false, undefined, { max: 3, step: 0.25, start: 2.5 }),
  // one column per run, a square per try stacked upward: failed tries hatched, the one that passed solid, a verdict cap on top and a line at the retry limit; its level is how many runs are drawn
  tries: def("tries", "Tries", "Marks", 200, 168, "caption", false, false, undefined, { max: 5, step: 0.25, start: 5 }),
  // a forecast fan: a band from today widening low to high ahead, real points set in month by month (red outside it), a ceiling across and the instant the band's top meets it marked; its level is how many real points are in
  cone: def("cone", "Cone", "Marks", 240, 140, "caption", false, false, undefined, { max: 9, step: 1, start: 9 }),
  walls: def("walls", "Walls", "Marks", 240, 200, "caption", false, false, undefined, { max: 8, step: 0.5, start: 3 }),
  // a small token bound to a wire, its words what it carries; its level is how far along the wire it has got, 0 its start, 1 its end, and it stays parked where it got to
  rider: def("rider", "Rider", "Marks", 240, 40, "caption", false, false, undefined, { max: 1, step: 0.25, start: 0.5 }),
  // a prompt tree: prompts as welded strips of parts, one trunk as far as they agree, a square elbow out of it where they first differ; its level is the prompt in question, its path from the root lit
  // rows of floating ranges on one scale with a band laid across them all: a row lights where it meets the band and fades where it misses; its level is how far the band is in
  spans: def("spans", "Spans", "Marks", 400, 200, "caption", false, false, undefined, { max: 1, step: 0.25, start: 1 }),
  // blocks as points at (min, max) with the diagonal min = max as a centre line: a query hatches the corner min ≤ hi, max ≥ lo and lights the points in it; its level is the query's low end
  // a clock face with a ring for each holder, each from now round to when its time runs out: one hatched slice of time elapsed eats them all at one speed, and a ring it passes vanishes as its name lights; its level is the time elapsed
  countdown: def("countdown", "Countdown", "Marks", 200, 200, "caption", false, false, undefined, { max: 300, step: 30, start: 60 }),
  // riders on a turning circle, boarding at one gate and stepping off at another, the stretch between hatched: its level is the time, so every rider sweeps round the arc, the newest lit and the count aboard in the middle
  orbit: def("orbit", "Orbit", "Marks", 240, 240, "caption", false, false, undefined, { max: 12, step: 0.5, start: 5.5 }),
  // one series as flat steps over bins of uneven width, each at the mean of the raw points under it, the points as dots over their steps: its level is the bin picked, and moving an edge slides the steps together as the dots sink in
  bins: def("bins", "Bins", "Marks", 288, 120, "caption", false, false, undefined, { max: 7, step: 1, start: 0 }),
  // concentric rings to scale about one centre, each named where it crosses an upright ray, and a front growing out through them: its level is the radius reached, the band it is crossing hatched and the rings it has passed in its tone
  ripple: def("ripple", "Ripple", "Marks", 240, 240, "caption", false, false, undefined, { max: 100, step: 10, start: 40 }),
  // a small square of four by four cells whose pattern comes from its words, alike for the same words and plainly unlike for others: its level is how lit it is while being compared
  fingerprint: def("fingerprint", "Fingerprint", "Marks", 48, 48, "caption", false, false, undefined, { max: 1, step: 0.25, start: 0 }),
  // two things that hold each other, one closed square ring standing clear of both with a head on each long side: its level is how far round it is drawn, and at work a light goes round it
  loop: def("loop", "Loop", "Marks", 240, 160, "caption", false, false, undefined, { max: 1, step: 0.25, start: 1 }),
  // a ring cut into named slices as wide as their sizes under a pointer fixed at the top: its level is how far it has turned, in turns, and the slice under the pointer is lit
  roulette: def("roulette", "Roulette", "Marks", 200, 200, "caption", false, false, undefined, { max: 2, step: 0.125, start: 0 }),
  // a square profile of pits along level ground, each as deep as its level and named under it, holding counters: its level is the arrangement shown, and moving it on lifts counters out over the rim into their new pits
  wells: def("wells", "Wells", "Marks", 384, 200, "caption", false, false, undefined, { max: 2, step: 1, start: 0 }),
  // nested proportional strips: each row's parts standing exactly under the part they cut, as wide as their share, ground no part covers hatched as not looked at; its level is the part in question, its path up to the whole lit
  icicle: def("icicle", "Icicle", "Marks", 360, 200, "caption", false, false, undefined, { max: 6, step: 1, start: 0 }),
  // one slice of a ring band cut across by rings, growing outward from its inner edge to its rim ring by ring: its level is how many rings it has reached, the slice it has covered hatched in its tone and the ring it rests on lit
  wedge: def("wedge", "Wedge", "Marks", 240, 240, "caption", false, false, undefined, { max: 3, step: 1, start: 2 }),
  // a call stack: a column of frames from the bottom up, each a slab of named slots; its level is how deep it is, so a frame is pushed onto the top or popped off it, and above the top is free stack
  callstack: def("callstack", "Call stack", "Marks", 200, 168, "caption", false, false, undefined, { max: 6, step: 1, start: 3 }),
  // a grid of whole counts, a column of cells per item counting up from 0, the cells under each column's floor hatched as where a count cannot be: its level is how many points have dropped into their cells, and once a column's last has landed its lowest fills
  // two things clipped together: short square brackets across the seam between them, each bitten into both edges: its level is how far they have closed
  staple: def("staple", "Staple", "Marks", 200, 32, "caption", false, false, undefined, { max: 1, step: 0.25, start: 1 }),
  // nested loops read as a counter: a row of cells per loop, the outermost on top, each hatched up to the try it is on, or its product grid, a cell per count grouped as the loops make them: its level is the count so far, the lowest row spinning and carrying into the row above
  // a measure that goes round as a clock face, sectors as arcs outside the rim, points landing on it in turn and a hatched sweep from the top behind them: its level is how many points have arrived, a point landing where the sweep has been red and a sector lit once the sweep covers it
  dial: def("dial", "Dial", "Marks", 264, 264, "caption", false, false, undefined, { max: 5, step: 1, start: 5 }),
  odometer: def("odometer", "Odometer", "Marks", 112, 116, "caption", false, false, undefined, { max: 27, step: 1, start: 5 }),
  floor: def("floor", "Floor", "Marks", 288, 240, "caption", false, false, undefined, { max: 8, step: 1, start: 8 }),
  minmax: def("minmax", "Minmax", "Marks", 240, 240, "caption", false, false, undefined, { max: 10, step: 1, start: 5 }),
  trie: def("trie", "Trie", "Marks", 520, 240, "caption", false, false, undefined, { max: 4, step: 0.5, start: 1 }),
};

export const BOX_KINDS = Object.keys(KINDS) as BoxKind[];
export const BASICS: readonly BoxKind[] = ["rect", "ellipse", "diamond"];
export const isBasic = (k: BoxKind) => BASICS.includes(k);
/** The library, in the order it is shown: everything beyond the three basics on the toolbar. */
export const LIBRARY: { group: Group; kinds: BoxKind[] }[] = (["Things", "Places", "Marks", "Wiring", "Controls"] as Group[]).map((group) => ({
  group,
  // (a pad is no longer put down by itself: a socket is the end of a wire; a clock is only met in the Clock pattern)
  kinds: BOX_KINDS.filter((k) => KINDS[k].group === group && k !== "pad" && k !== "clock"),
}));
export const KEY_TO_KIND: Record<string, BoxKind> = Object.fromEntries(BOX_KINDS.filter((k) => KINDS[k].key && k !== "pad" && k !== "clock").map((k) => [KINDS[k].key!, k]));

// ── notches ─────────────────────────────────────────────────────────
// Welded shapes carry a shallow notch at the middle of each side, where
// wires dock. Whether they are drawn is one switch; the
// drawing and the arrows both read it, so a wire never aims at a notch
// that is not there.
// weld's measures, at the size its figures are drawn here: a notch 16 wide and 4 deep, corners of 12
export const NOTCH_W = 8, NOTCH_D = 4, WELD_R = 12;
export const weld = { notch: true };
const WELDED: readonly BoxKind[] = ["card", "machine", "pill", "tank"];
/** The radius a welded outline turns its corners with. */
export const weldRadius = (kind: BoxKind, h: number) => (kind === "pill" ? h / 2 - 4 : WELD_R);
/** Does this box carry a notch on `side` ("t", "r", "b" or "l")? */
export function hasNotch(b: { kind: BoxKind; w: number; h: number; notch?: string }, side: string): boolean {
  if (!weld.notch) return false;
  const sides = b.notch ?? (WELDED.includes(b.kind) ? "trbl" : "");
  if (!sides.includes(side)) return false;
  const edge = side === "t" || side === "b" ? b.w : b.h, other = side === "t" || side === "b" ? b.h : b.w;
  const r = Math.max(0, Math.min(weldRadius(b.kind, other), edge / 2, other / 2));
  return edge / 2 >= r + NOTCH_W;
}
