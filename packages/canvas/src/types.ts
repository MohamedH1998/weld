// The document model. Everything on the board is one of three things:
// a box (rect, ellipse, diamond) that can hold a label, free text, or
// an arrow whose ends may be bound to an exact point on a box.

export type Id = string;
export type Tone = "ink" | "accent" | "muted" | "red" | "green" | "amber" | "violet" | "teal";
export type Fill = "none" | "tint" | "solid";
export type BoxKind =
  | "rect" | "ellipse" | "diamond"
  | "card" | "machine" | "panel" | "pill"
  | "boundary" | "frame"
  | "glyph" | "meter" | "bars" | "queue"
  | "pad" | "junction"
  | "button" | "clock"
  | "store" | "page" | "person" | "table"
  | "trace" | "lock" | "tape" | "switch"
  | "timer"
  | "window" | "wave" | "axis" | "plot" | "rule"
  | "hatch" | "guide" | "parts" | "ticks" | "legend"
  | "timeline" | "tank" | "segments" | "units" | "gap" | "postings" | "stair" | "arc" | "spiral" | "lattice" | "cells" | "plane" | "comb" | "columns" | "scatter" | "levels" | "belt" | "shingles" | "wheel" | "walls" | "threshold" | "ratchet" | "overlap" | "field" | "interval" | "fence" | "ringbuf" | "wall" | "wrap" | "tether" | "tokens" | "break" | "trail" | "jaws" | "reaches" | "tries" | "cone" | "rider" | "trie" | "spans" | "minmax" | "countdown" | "orbit" | "bins" | "ripple" | "fingerprint" | "loop" | "roulette" | "wells" | "icicle" | "wedge" | "callstack" | "floor" | "staple" | "odometer" | "dial"
  // a picture: a screenshot, an image, an SVG
  | "image"
  // live things: an agent's conversation, a shell, a page
  | "thread" | "terminal" | "browser";
/** What a live thing is pointed at: the folder it works in, the page it shows. */
/** The colours threads wear (see live/place.ts), by number. */
export const HUES = ["#2f6bff", "#c2410c", "#0f8a5f", "#9333ea", "#be185d", "#0e7490", "#a16207", "#4f46e5"];

export interface Live {
  cwd?: string;
  url?: string;
  /** A command a new terminal runs once, as it opens. */
  run?: string;
  /** The thread it came from (a page an agent opened, a terminal it started), when it came from one. */
  from?: Id;
  /** The thread whose agent put this here (not set when the person did, even from that thread). */
  by?: Id;
  /** The command an agent started this terminal to run. */
  cmd?: string;
  /** A terminal showing a thread's background command: removing it hides the output, it does not stop the command. */
  svc?: boolean;
  /** What a thread has been pointed at (see live/refs.ts), by key. */
  sees?: string[];
  /** A thread made for T3 Code, set up already (its folder, agent and mode): the board's new-thread setup leaves it be. */
  ready?: boolean;
  /** What a thread's agent has drawn on the board (it may change these as it likes). */
  drew?: string[];
  /** A thread's own colour, by number: chosen once, as unlike the others on the board as there are colours to go round. */
  hue?: number;
  /** A thread folded down to its title: the height it had open, to go back to. */
  tall?: number;
}
/** How a line is drawn. Absent means solid. */
export type Line = "dashed" | "dotted";

export interface Box {
  id: Id;
  kind: BoxKind;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  tone: Tone;
  fill: Fill;
  /** Turn about the centre, in radians. Absent means upright. */
  rot?: number;
  line?: Line;
  /** A live thing's folder or page. */
  live?: Live;
  /** A picture's file, kept by its content (see electron/assets.mjs): what it is, how big, where it came from. */
  /** `by`: the thread whose agent put it here (not set when the person did). */
  img?: { hash: string; ext: string; w: number; h: number; name: string; preview?: boolean; origin?: string; by?: Id };
  /** Shapes that share this move, select and copy as one. */
  group?: Id;
  /** Held in place: not picked up, moved or deleted until unlocked. */
  locked?: true;
  /** Not there in this moment of a group that moves (it is in others). */
  away?: true;
  /** In a moment: how long after the moment starts to arrive this part starts its own change (ms). */
  wait?: number;
  /** A compute mark at work while it plays: its cells light in turn. */
  busy?: true;
  /** The level a mark shows: a meter's 0..1, a queue's filled slots, a window's lit row, how far a recording has got, a timer has left to run. */
  value?: number;
  /** Where a meter's limit stands (0 to 1). Absent: three quarters along. At 1 there is no limit to cross: it is a plain gauge of how far something has got. */
  limit?: number;
  /** Its own measures, where they differ from the usual: the size of its
   *  words, the height of its header band, and how far its header's
   *  contents stand in from the left. A diagram brought in from elsewhere
   *  keeps its exact proportions this way. */
  size?: number;
  /** Its words' tracking, in em, where it is not the label face's usual. */
  track?: number;
  fine?: Fine;
  /** Notches beyond the one at the middle of a side: the side, and how far along it (0 to 1). */
  dips?: [string, number][];
  /** A field of cells (a glyph), each lit this much (0 to 1), row by row; or the heights a trace passes through, left to right; or the heights of a unit chart's columns, in whole units; or a gap's two series one after the other, the curve's heights then the stair's (0 to 1, as many of each); or the numbers present in a row of postings; or the levels a stair holds, each from its instant to the next (0 to 1). */
  /** (An arc's are its two angles and its width: from, to, in degrees clockwise from the top, and how wide a band it is, 0 for a line.) */
  /** (A spiral's are where it starts, in degrees clockwise from the top, how much nearer the centre each lap sits, and how wide a band it is, 0 for a line.) */
  /** (A lattice's are how many free cells it is told (−1: where its two sequences agree), those cells [i, j], then its path's crossings [i, j].) */
  /** (A row of cells' are how far each cell is set, then how far each is lit, then how far each is flagged dirty, 0 to 1, one of each per cell.) */
  /** (A plane's are how far its two counts go, across then up, then its points [a, b].) */
  /** (A field's are how many cuts, then each cut [axis (0 across, 1 up), at, corner (0: none)], 0 to 1 of the mark from its bottom left; then each key [x, y, there (0 to 1)].) */
  /** (An interval's are its bracket's width, then the numbers its pins stand at.) */
  /** (A wall's are which side its inside is (0: below or right, 1: above or left), how many openings it has, each opening [at, wide] (0 to 1 along, wide in its thickness), then its hits [at, on].) */
  /** (A cone's are the months its time axis spans, the ceiling (0 to 1), whether an old band stands, its band [from, aim, slope, spread] (the month it starts, its height there, rise and widening a month, 0 to 1), the old band's the same way, then a real point's height for each month from 0.) */
  /** (A loop's are its gap: how far it stands clear of the two things it goes round, px.) */
  /** (A staple's are which way its seam runs (0: across, the two things one under the other; 1: up and down, side by side), how far its brackets bite into both things, px, then where each bracket stands along the seam, 0 to 1.) */
  /** (A rider's are how many points its wire's path has, then each point [x, y] (0 to 1 across and down the mark): a story sets them from the wire it rides.) */
  /** (A trie's are how many prompts it has, how far each has grown out of where it leaves the ones before it (0 to 1), then each part's size, prompt by prompt.) */
  /** (Tries' are the retry limit, then for each run how many tries failed before one passed (at the limit or past it: all of them failed).) */
  /** (Spans' are their scale's first and last numbers, the band [lo, hi], then each row's range [from, to].) */
  /** (A fingerprint's are how far each of its sixteen cells is set, row by row, 0 to 1: the pattern its words make.) */
  /** (A ripple's are each ring's radius, in the units its level, the front's reach, is told in.) */
  /** (A call stack's are how many frames (n), how many slots each has (from the bottom, main first), then how lit each slot is, 0 to 1, frame by frame.) */
  /** (A wedge's are its angles from and to (degrees, 0 at the top, clockwise), then each ring's radius out from the centre, the first its inner edge, the last its rim.) */
  /** (Countdown rings' are each ring's time left, in the units its `span`, one full turn, is told in.) */
  /** (Bins' are how many raw points (n), the points (0 to 1), then for each of the n − 1 gaps between neighbours how far an edge stands there, then how far each point's dot stands, 0 to 1.) */
  /** (A roulette's are how deep its slices are, 0 to 1 of its radius, then each slice's size: they share the ring between them.) */
  /** (An icicle's are how many parts (n), then each part's [size, parent, cut, lit]: its size in the whole's units, the index of the part it cuts (−1: none, a part of the whole), how far it has been cut into its own parts (0 to 1), and how lit it is.) */
  /** (An odometer's are its base, how many digits, its form (0: rows, 1: its product grid), then each cell's side, how far one's left edge is from the next, and the gap: as rows, how far one row's top is from the next; as a grid, between its groups.) */
  /** (A dial's are its round (how many units to a turn), how many sectors, each sector [from, to] in units, then each point [at, the sweep's stand once it has arrived], in the order they arrive.) */
  /** (A floor's are how many columns (n), the top count (m), each column's floor (a whole count: the cells under it are hatched), then each point [column, count], in the order they land.) */
  /** (Wells' are how many pits (n), each pit's depth (0 to 1), how far each is lit, then one or more arrangements of the counters: how many lie in each of the n pits.) */
  /** (An orbit's are the gate on and the gate off (degrees, 0 at the top, clockwise), how far it turns a second (degrees), then each rider's boarding time (seconds).) */
  /** (A minmax's are its scale's first and last numbers, how wide its query is, how far the query is shown (0 to 1), then each point [min, max].) */
  /** (Jaws' are where the lower and the upper jaw stand (positions, from 0), where the probe stands, then how lit it is, 0 to 1.) */
  /** (A trail's are how many places its path has, each place [x, y] (0 to 1 across and down the mark), then whether each is kept (1) or passed over (0).) */
  /** (A break has none: it stands where it was put, across its strip, and its level is how far it has gone: 0 to 1 torn down in red, 1 to 2 settled into a quiet seam.) */
  /** (Tokens' are the first and last numbers on their scale, then the number each token stands at, in the order they come in; their words after the first line are the tokens' names.) */
  /** (A tether's are how many threads hold its block, then each thread [at, held, cut]: where it hangs (0 to 1 across), how far it has grown down to the block, and how far it is cut (0 to 1).) */
  /** (A wrap's are a bit's side, how far one bit is from the next across and one row from the next down, then each bit [set, across, down, lit], its place counted in bits and rows from the top left.) */
  /** (Reaches' are how many reaches, each [x, y, r] (centre 0 to 1 of the mark, r 0 to 1 of its width), then its points [x, y].) */
  /** (A fence's are its reach's centre and radius as a scatter's, how many corners its fence has, each corner [x, y], then its points [x, y], all 0 to 1 of the mark.) */
  /** (An overlap's are how far its two counts go, the second box's point (from 1; 0: none), then its points [a, b].) */
  /** (Walls' are how far their two counts go, across then up, where the wall across and the wall up stand, whether a ray is drawn (1) or not (0), then the slopes, up per across.) */
  /** (A comb's are its teeth's starts, 0 to 1, then, when there are twice its span, how many more each tooth stands for.) */
  /** (Columns' are their bars' heights, 0 to 1 of the mark's height, one a bar, left to right; with a `span` and twice as many, then each bar's ghost, the height it would have reached (or, `split`, the height of the line across it).) */
  /** (Levels' are their bars' heights, the first `span` of them, then their lines' heights, 0 to 1 of the mark's height, then how far each line stands, 0 to 1; and last, if there, how wide a margin its lines' words are set in, left of the bars.) */
  /** (A scatter's are its reach's centre, across then down, 0 to 1 of the mark, and its radius, 0 to 1 of its width; then its points [x, y], the same way.) */
  /** (A belt has none: its tokens are the lines of its words after the first, and its level is how far they have slid.) */
  /** (Shingles' are how many points there are, those points, 0 to 1 along, then each span's from, to and row [from, to, row].) */
  /** (A threshold's are its curve's heights, 0 to 1, as a plot's are.) */
  /** (A ratchet's are the first and last numbers on its scale, then this moment's tokens on each notch, those that found it open, then those that found it shut; its level is the highest number seen.) */
  /** (A ring buffer's are how deep its slots are, 0 to 1 of its radius, then where its head and its tail stand, in slots round from the top.) */
  /** (A wheel's are how deep its slots are, 0 to 1 of its radius, then how far each slot is set, how far each is lit, how many balls found it empty this moment, and how many found it set: one of each per slot.) */
  levels?: number[];
  /** What one step of a timeline stands for ("100 ms"), how many units a tank holds ("10"), the limit a unit chart's columns are read against ("11"), or where a threshold's line stands ("0.34", 0 to 1). */
  unit?: string;
  /** How many steps a timeline is drawn to, or how many places a row of postings has, or how many cells a row of cells has, or how many places a belt shows, or how many cells a mark of shingles is cut into, or how many slots a wheel or a ring buffer has, or how long an interval's scale is, so several stacked share one scale. */
  span?: number;
  head?: number;
  pad?: number;
  /** Which sides carry a notch, as letters of "trbl". Absent: every side of a welded shape, none of any other. */
  notch?: string;
  /** Its words set in one of the board's pairs of faces (by name), not the board's own. */
  face?: string;
  /** Its words shown exactly as typed (not put in capitals by the label face), and their own weight, where chosen. */
  cased?: true;
  weight?: number;
  /** Columns hung from a baseline along their top, each bar reaching down (as a reflection under a row standing on the same line). */
  hang?: true;
  /** Columns with a `span` and twice as many levels read the second half as splits: a line across each bar at that height, the part above it hatched in the accent. */
  split?: true;
  /** A boundary drawn as a frame: a solid edge with its name inside its top corner, not on a plate astride its edge. */
  title?: "corner";
  /** A boundary's ground ruled in diagonals, one way or both (as a construction drawing singles out a region). */
  pattern?: "hatch" | "cross";
}

export interface Text {
  id: Id;
  kind: "text";
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  size: number;
  /** Set in the label face (the mono the shapes' own names use), with this much tracking, in em. */
  track?: number;
  /** Its own weight (400, 500, 700), its own face (one of the board's pairs, by name), and how its lines are set against each other, where these are not the board's usual. */
  weight?: number;
  face?: string;
  align?: "center" | "right";
  fine?: Fine;
  tone: Tone;
  rot?: number;
  group?: Id;
  locked?: true;
  /** Not there in this moment of a group that moves (it is in others). */
  away?: true;
  /** In a moment: how long after the moment starts to arrive this part starts its own change (ms). */
  wait?: number;
}

/** One end of an arrow. Free ends live at (x, y). A bound end points at
 *  an exact spot inside a box, as a fraction of the box's size, so it
 *  follows the box when it moves or resizes. */
export interface End {
  x: number;
  y: number;
  bind?: { id: Id; ax: number; ay: number };
}

/** A named step of the neutral scale (or the accent, or the paper itself): the same name reads right in light and dark. */
export type Shade = "n50" | "n100" | "n200" | "n300" | "n400" | "n500" | "n600" | "n700" | "n900" | "accent" | "paper" | "none";
/** An exact look, for a drawing that must match a reference to the pixel. Anything left out falls back to the shape's tone. */
export interface Fine {
  /** The outline or the wire: its shade and its weight in px. */
  line?: Shade;
  w?: number;
  /** What it is filled with, and how strongly (0 to 1). */
  fill?: Shade;
  fo?: number;
  /** Its words: their shade and font weight, and how far below the middle of their place the baseline sits, in px. */
  text?: Shade;
  fw?: number;
  rise?: number;
  /** Its words shown as they were typed (not set in capitals), even once its colour is the board's to choose. */
  typed?: true;
  /** Set in the reference's prose face, not the board's own. */
  prose?: true;
  /** The small mark it carries: a panel's indicator, a port's centre. */
  lamp?: Shade;
  /** A wire's ports: the shade of their outline (their centre is the lamp). */
  port?: Shade;
  /** How present the whole shape is (0 to 1). */
  o?: number;
  /** A soft shadow under it. */
  shadow?: true;
  /** Its corner radius, in px, where not the kind's usual; and whether its corners are true quarter circles. */
  r?: number;
  arc?: true;
  /** An arrowhead this long, in the reference's own shape. */
  head?: number;
  /** A wire whose ends are rounded off (they are cut square otherwise). */
  round?: true;
  /** A wire that ends on a small dot: a leader, from a few words to the feature they name. */
  dot?: true;
  /** Drawn fine: a head that is a plain small triangle, dashes and dots at a short rhythm, a label that keeps to one line. */
  crisp?: true;
  /** Drawn as a construction drawing draws it: a measure ends in slashes between witness lines. */
  draft?: true;
}

export interface Arrow {
  id: Id;
  kind: "arrow";
  a: End;
  b: End;
  text: string;
  /** Its label's own size, and (set in the label face) its tracking in em, where they are not the usual. */
  size?: number;
  track?: number;
  /** Straight, square-cornered, or a soft curve that leaves and meets each end square to its side. */
  route: "straight" | "elbow" | "curve";
  /** Where it has been pulled to: how far its middle stands from the middle of its two ends (a bend, a bow, or a moved run). */
  bow?: Pt;
  heads: "end" | "both" | "none";
  /** Its ports are drawn empty: nothing is plugged in yet. */
  unlit?: true;
  /** Drawn by Weld, from a thread to what came of it (a page it opened, a branch): where it came from, not something
   *  the person pointed the thread at. */
  made?: true;
  /** Which ends carry a port: the small socket a lasting connection is plugged into, drawn on the rim of what the end joins. */
  ports?: "a" | "b" | "both";
  tone: Tone;
  line?: Line;
  group?: Id;
  locked?: true;
  /** Not there in this moment of a group that moves (it is in others). */
  away?: true;
  /** In a moment: how long after the moment starts to arrive this part starts its own change (ms). */
  wait?: number;
  /** It points at what is no longer there (a slot in a popped frame): its head is drawn open, and stays at rest. */
  dangling?: true;
  /** A bent wire turns its corners square, not rounded. */
  square?: true;
  /** Its words set in one of the board's pairs of faces (by name), not the board's own. */
  face?: string;
  /** Its words ride it in a pill of their own, which the wire docks into at each end. */
  pill?: true;
  fine?: Fine;
  /** How much of it is drawn, from its start (0 to 1): a wire part-way through being laid. */
  drawn?: number;
  /** A mark travels along it while it plays: once every `every` ms, taking `dur` ms. */
  pulse?: { dur: number; every: number };
  /** How far it is cut (0 to 1): a lasting connection dropped, drawn broken with a short red gap at its middle and both ends left standing. */
  cut?: number;
  /** What runs along it as its moment arrives: a request filling the wire (pour), the answer coming back the other way (back), one that runs out at the far end (fizzle), one refused there (squash). */
  run?: "pour" | "back" | "fizzle" | "squash";
  /** The corners of an exact route, in order. Kept only while both ends still line up with it. */
  via?: Pt[];
  /** How far its corners are rounded, in px, where not the usual. */
  bend?: number;
}

export type Shape = Box | Text | Arrow;

/** One moment of an animated group: its shapes as they are then (back to front), how long playing takes to arrive here and how long it rests. */
export interface Moment {
  id: Id;
  shapes: Shape[];
  over: number;
  hold: number;
  /** How it arrives: eased both ways (absent), settling past the mark and back, or at an even pace. */
  ease?: "spring" | "even";
}
/** A group that moves: its moments in order, and the one the board is showing (whose shapes are the board's own). */
export interface Scene {
  moments: Moment[];
  at: number;
  /** Plays through once and rests on the last moment, rather than going round. */
  once?: true;
}
export interface Doc {
  shapes: Record<Id, Shape>;
  /** Back to front. */
  order: Id[];
  /** Animated groups, by group. */
  scenes?: Record<Id, Scene>;
  /** Threads kept off the board: asked from the bar and read there. They belong to the board without standing on it;
   *  where they stand is where their work is put. Not part of what is undone. */
  away?: Record<Id, Box>;
}

/** Screen = (world - camera) * z. The camera is the world point at the
 *  top-left of the viewport. */
export interface Camera {
  x: number;
  y: number;
  z: number;
}

export type Tool = "select" | "hand" | BoxKind | "arrow" | "line" | "text" | "stamp";

export interface Pt {
  x: number;
  y: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const isBox = (s: Shape | undefined): s is Box =>
  !!s && s.kind !== "arrow" && s.kind !== "text";
export const LIVE_KINDS: readonly BoxKind[] = ["thread", "terminal", "browser"];
export const isLive = (s: Shape | undefined): s is Box => !!s && (s.kind === "thread" || s.kind === "terminal" || s.kind === "browser");
export const isArrow = (s: Shape | undefined): s is Arrow => !!s && s.kind === "arrow";
export const isText = (s: Shape | undefined): s is Text => !!s && s.kind === "text";

let counter = 0;
export function newId(): Id {
  counter += 1;
  return `s${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
