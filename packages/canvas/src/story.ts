// A diagram told as a story: things, the wires between them, and what each moment lights, says and sends.
// It is written out as an ordinary stamp (in the board's own look), so a diagram
// can be composed by hand in a few lines instead of shape by shape, moment by moment.
import { stamp } from "./stamps";
import type { StampDef } from "./stamps";
import { layoutText } from "./render";
import { cellPlaces, ringSpot, stackSpot } from "./shapes";
import { arrowPath } from "./geometry";
import type { Arrow, Box, Doc, Shade, Shape, Text, Tone } from "./types";

// the system look's own colours: one white for every line and word, one grey for every edge, a lighter field for a frame inside a frame
const W = "#ededed" as Shade, EDGE = "#333333" as Shade, LIT = "#7a7a7a" as Shade, DEEP = "#1a1a1a" as Shade, SOFT = "#a1a1a1" as Shade, DOT = "#8f8f8f" as Shade, RED = "#d9363e" as Shade, REDW = "#ff6166" as Shade, GREEN = "#3e9b6e" as Shade;

export interface Thing {
  id: string;
  /** A card holds a name; a panel and a machine hold a name and a line of detail; a boundary fences others in.
   *  The marks say one thing each: a meter a level against a limit, a gauge and bars a level (0 to 1), a queue how many of its five slots are taken,
   *  a glyph that work is being done. A pill and a chip are small names; a label is words alone. */
  kind: "card" | "panel" | "machine" | "boundary" | "meter" | "gauge" | "bars" | "queue" | "glyph" | "pill" | "chip" | "label"
    /** The thing itself, small: a window (its rows are lines of text; its level the row lit), a wave (how far a recording has got), a rule (a measured span, its words the measure),
     *  an axis (a number line: `levels` are points marked on it, its level the point in question, both 0 to 1), a plot (a curve through `levels`, drawn as far as its level). */
    | "window" | "wave" | "rule" | "axis" | "plot"
    /** A construction drawing's marks: a hatch is a region singled out (hatched as far as its level, 0 to 1); a guide a line the drawing was set out by (`dashed` makes it a centre line);
     *  parts a whole cut into shares (`levels` are their sizes, lines of text after the first their names, its level the part in question, from 1); a dot a point on a line; a ring a circle things stand on. */
    | "hatch" | "guide" | "parts" | "dot" | "ring"
    /** Activity over time: a track with a tick for every instant at work (`levels` are the busy spans, as from-to pairs, 0 to 1), drawn as far as its level. */
    | "ticks"
    /** Where wires meet and branch (a point), and a key to the wires' colours (its lines are their names, in the palette's order). */
    | "junction" | "legend"
    /** A timeline: points at their times (`levels`, in steps of `unit`), a line of text each for their names, its level how many have happened.
     *  A tank: a vessel filled to its level (0 to 1) holding `unit` units. Segments: a whole in its welded parts (`levels` their sizes; a line of text each, "what it holds  its name"), its level the part in question, from 1;
     *  given twice as many levels as lines, the second half picks parts too (how far each is lit, 0 to 1). */
    | "timeline" | "tank" | "segments"
    /** Units: a level counted out, a column of units for each step (`levels` are the columns' heights in whole units), its level how many columns are drawn (a part of one grows the next
     *  unit by unit); `unit` is a limit, and units standing past it are red. */
    | "units"
    /** A gap: a curve against a stair on one pair of axes (`levels` are the curve's heights and then the stair's, 0 to 1, as many of each), both drawn as far as its level;
     *  between them it is hatched red where the curve is over the stair, tinted where it is under. */
    | "gap"
    /** A stair: a plot of a value that changes in an instant (`levels` are the heights it holds, 0 to 1, each from its instant to the next), square risers between them, drawn as far as its level. */
    | "stair"
    /** A threshold: a plot with a level line across it (`unit` is where it stands, 0 to 1; the second line of `text` its words); as the curve is drawn, each crossing of the line drops
     *  a tick to the baseline and lights a dot there (filled going over, open coming back under). */
    | "threshold"
    /** Postings: one row of numbered points on a scale shared with the rows above and below it (`levels` are the numbers present, `span` the scale's length: rows of one x, width and span
     *  line up number for number); its level is the number the walk has got to (0: not begun; past the span: done). The point under the walk is lit, points behind it settled. */
    | "postings"
    /** An arc: a stretch of the circle its box holds (`levels` are from, to and width: degrees, 0 at the top, growing clockwise; a width makes it a hatched band inside the circle), drawn as far round as its level (0 to 1). */
    | "arc"
    /** A spiral: one line that keeps winding inward past a full turn (`levels` are where it starts, how much nearer the centre each lap sits, and its width), drawn as many turns as its level;
     *  the first lap in the hand the wires are (the accent when it is on), the laps past it in its colour (amber when none). */
    | "spiral"
    /** A lattice: a grid of crossings set out from two sequences (the first line of `text` across its top, the second down its side), a diagonal in each free cell (`levels`: how many free cells
     *  are told, −1 for where the two agree, those cells [i, j], then a path's crossings [i, j]); its level is how many steps of the path are drawn, paid steps heavier than free ones. */
    | "lattice"
    /** Cells: a row of `span` equal square cells welded into one (`levels`: how far each is set, hatched, then how far each is lit, then how far each is flagged dirty, a filled corner, 0 to 1); its level is the cell being read, from 1.
     *  A wire lands on one cell by its index: "bits#5.t" is the middle of the top of the sixth. */
    | "cells"
    /** A plane: two counts on one grid (the first line of `text` names the count across, the second the count up, the rest the points; `levels`: how far each count goes, then the points [a, b]);
     *  its level is the point, from 1, whose box (everything at or below it in both counts) is hatched, sliding to the next between two. */
    | "plane"
    /** A comb: many spans, one a row, that start where they like and end on one shared edge (`levels`: their starts, 0 to 1, then, with `span` the teeth, how many more each stands for);
     *  its level is how far time has got, 0 to 1: every tooth that has started grows to it, and at 1 the shared edge stands and every tooth is lit. */
    | "comb"
    /** Columns: an upright bar for each value on one shared baseline (`levels`: their heights, 0 to 1; a beat's `cut` changes them), a bar centred in each of as many equal slots across it;
     *  its level is the bar picked, from 1 (0: none), sliding to the next between two. Lines of `text` after the first are set over each bar's top.
     *  With `span` the bars and twice as many `levels`, the second half are ghosts: a dashed outline up from each bar's top to the height it would have reached.
     *  With `hang`, the baseline runs along its top and every bar (ghost and words too) reaches down from it.
     *  With `split` (and `span`), the second half are splits instead: a line across each bar at that height, the part above it hatched in the accent as the share in question. */
    | "columns"
    /** A scatter: many named points in one field (`levels`: a reach's centre and radius, then the points [x, y], 0 to 1 of the mark; a beat's `cut` moves them), a point's word in each line of `text` after the first;
     *  its level is how far the reach has grown, 0 to 1 of its radius: the points inside it are lit, and its centre stands once it has begun. */
    | "scatter"
    /** Levels: columns with named level lines laid across them (`levels`: the bars' heights, the first `span` of them, then the lines' heights, 0 to 1, then how far each line stands, then the words' margin; a beat's `cut` changes them),
     *  a line's word in each line of `text` after the first; its level is the line in play, from 1 (0: none): it stands firm, and every bar standing over it is drawn red. */
    | "levels"
    /** A belt: a conveyor `span` places wide carrying a sequence of tokens (lines of `text` after the first: "record", "barrier", or a short word each), the first in its rightmost place;
     *  its level is the offset, how many places the sequence has slid right (tokens come in at the left and leave at the right). A barrier is an upright bar between two cells. Hold the level and it stands still. */
    | "belt"
    /** Shingles: spans on one shared time scale cut into `span` cells, packed into the fewest rows they fit, under the stream of points they are cut from (`levels`: how many points, the points 0 to 1 along,
     *  then each span [from, to, row]); a span is the run of cells it covers, the points it holds hatched in. Its level is how many spans are laid; a beat's `cut` re-cuts them, and they slide and re-pack. */
    | "shingles"
    /** A wheel: `span` equal slots round a ring (`levels`: how deep a slot is, 0 to 1 of the radius, then how far each slot is set, hatched, how far each is lit, and this moment's balls on each, those that found it empty, filled,
     *  then those that found it set, red); a ball drops in from outside and an empty slot it lands on sweeps full. Its level is the slot being read, from 1. */
    | "wheel"
    /** Walls: a plane with two limits on it, each a heavy named edge (`text`: the count across, the count up, the wall across, the wall up, then the slopes' names; `levels`: how far each count goes,
     *  where the walls stand, a ray or not, then the slopes, up per across). Its level is the slope in play, from 1: its box grows from the corner along it and lights the first wall it meets. */
    | "walls"
    /** A ratchet: a scale of numbered notches (`levels`: its first and last numbers, then this moment's tokens on each notch, those that found it open, then those that found it shut) with a pawl at the highest
     *  number seen, its level; every notch at or below the pawl is hatched shut. A token drops in from above: on an open notch it seats and the pawl clicks up to it, on a shut one it bounces off red. */
    | "ratchet"
    /** An overlap: a plane keeping two boxes at once (`text` as a plane's; `levels`: how far each count goes, the second point, from 1, 0 for none, then the points [a, b]). Its level is the first point, from 1:
     *  what both boxes hold stays plain, what only one holds is tinted its own way (the first the accent, the second ink, hatched the other way), and both red when neither holds the other. */
    | "overlap"
    /** A field: named keys placed by two measures, with keep regions cut across it (`text`: the measure across, the measure up, each cut's name, then each key's word; `levels`: how many cuts, each cut [axis, at, corner],
     *  then each key [x, y, there]; a beat's `cut` moves the keys). A key outside every region fades out; its level is the cut in play, from 1 (0: none): its region and the keys inside it are lit. */
    | "field"
    /** An interval: a number line 0 to `span` with a hatched bracket on it and pins dropped on it (`levels`: the bracket's width, then the numbers the pins stand at); its level is where the bracket's
     *  left edge is. A pin is lit while the bracket covers it, settled once the left edge is past it; rows of one x, width and span share the scale. */
    | "interval"
    /** A fence: a scatter whose field also holds a closed hatched region named on its edge (`text`: a name, the fence's name, then a word for each point; `levels`: the reach's centre and radius, how many corners,
     *  each corner [x, y], then the points [x, y]); its level is how far the reach has grown, lighting the points it takes, while the fence stays still and the points inside it are drawn held. */
    | "fence"
    /** A ring buffer: `span` equal slots round a ring with a head and a tail pointer outside it (`levels`: a slot's depth, 0 to 1 of the radius, then the head and the tail, in slots round from the top);
     *  the entries are the stretch from head to tail, hatched. A wire may land on a pointer ("sq#head", "sq#tail") and follows it round. Its level is the slot being read, from 1. */
    | "ringbuf"
    /** A wall: one straight edge of a boundary drawn as a hatched wall a thing set across it stands in (`text`: its name, then each opening's; `levels`: which side the inside is, 0 below or right,
     *  1 above or left, how many openings, each [at, wide], then this moment's hits [at, on]); its level is the opening a wire is using, from 1, lit, and a hit is a short red bar on its outside face. */
    | "wall"
    /** A wrap: one run of bits set in rows, each row named at its end (`text`: its name, then each row's; `levels`: a bit's side, the pitch across and down, then each bit [set, across, down, lit]);
     *  a set bit is hatched, a lit one takes the accent. A beat's `cut` re-wraps it and every bit travels to its new place, the names waiting out the move. Its level is the bit being read, from 1. */
    | "wrap"
    /** A tether: a block hung by named threads from a ceiling (`text`: the block's name, its detail line, then each thread's name; `levels`: how many threads, then each [at, held, cut]); a cut thread
     *  snaps red and its halves fall away, and once none holds it the block drops to the floor and fades. A beat that says one line says the block's detail line. Its level is the thread followed, from 1. */
    | "tether"
    /** Tokens: named tokens on a scale, each standing at its number (`text`: a name, then each token's word; `levels`: the scale's first and last numbers, then each token's number, in the order they come in);
     *  tokens whose places collide stack into a pile there, the later on top. A beat's `cut` moves them and they glide, piles settling as they part. Its level is how many have come in (a part of one: the next dropping in), the newest lit; past the last, none. */
    | "tokens"
    /** A break: a torn edge down across a strip or a row of cells at one place (`tear` sets it on its strip), its words over its top; its level is how far it has gone: 0 to 1 it tears down in red,
     *  the strip parted either side, 1 to 2 it settles into a quiet ink seam once the gap is filled. */
    | "break"
    /** A trail: one moving point with its name riding beside it (`text`: its name; `levels`: how many places its path has, each [x, y], 0 to 1 of the mark, then whether each is kept),
     *  leaving an open point at each kept place it has passed. Its level is how far along the path it has got (a part of one glides it to the next): `set` it with `over` and it rides the path. */
    | "trail"
    /** Jaws: a scale of positions (`span` of them) with a lower and an upper jaw on it, each a small named tab under its position (`text`: its name, the two jaws' names, then what the measure counts;
     *  `levels`: where the jaws stand, where the probe stands, how lit it is). Every position at or outside a jaw is hatched, and a measure between them counts what is left: a beat's `cut` slides them in. */
    | "jaws"
    /** Reaches: a scatter keeping several reaches at once (`text`: a name, a name for each reach, then a word for each point; `levels`: how many reaches, each [x, y, r], then the points [x, y]),
     *  each its own named broken circle about its own centre, a point lit when any of them holds it. Its level is how many reaches are drawn, a part of one growing the next. */
    | "reaches"
    /** Tries: one column per run, a square per try stacked upward (`levels`: the retry limit, then each run's failed tries): a failed try hatched, the try that passed solid with nothing above it,
     *  and the run's verdict a cap on top, green when a try passed, red when none did; a line marks the limit. Its level is how many runs are drawn, a part of one growing the next try by try. */
    | "tries"
    /** A cone: a forecast fan on a time axis (`text`: a name, the ceiling's words, the words at the instant it fills; `levels`: as coneLevels), a band from its month widening low to high ahead,
     *  real points set in month by month (a point outside the band, or the old band it was re-aimed from, red), a ceiling across and the instant the band's top meets it marked on the axis. Its level is how many real points are in. */
    | "cone"
    /** A rider: a small token bound to a wire (`rides`: the wire's id; `text`: what it carries), standing on it clear of either end. Its level is how far along the wire it is, 0 its start, 1 its end:
     *  a beat that runs the wire carries it to the end and one that runs back along it to the start, in that moment, and it stays parked where it got to. */
    | "rider"
    /** A trie: a prompt tree (`text`: one prompt a line, its parts between " | "; `levels`: as trieLevels), welded strips of parts that share one trunk as far as they agree and split, by a square elbow
     *  out of the trunk's end, where they first differ. Its level is the prompt in question (from 1), its path from the root lit; a cut grows each prompt out of where it leaves the ones before it. */
    | "trie"
    /** Spans: rows of floating ranges on one shared scale with a band across every row (`text`: a caption, the band's name, then each row's name; `levels`: as spanLevels; `unit`: said after each number).
     *  Its level is how far the band is in, 0 to 1: a row lights where its range meets the band and fades where it misses; a beat's `cut` slides and resizes the band and the rows are judged again as it passes. */
    | "spans"
    /** A minmax: blocks as points at (min, max) with the diagonal min = max as a centre line (`text`: a caption, the measure across, the measure up, the query's words, then each point's name; `levels`: as minmaxLevels;
     *  `unit`: said after each number). Its level is the query's low end lo: the corner min ≤ lo + wide, max ≥ lo is hatched and the points in it lit; `set` slides the crosshair along the diagonal. */
    | "minmax"
    /** Countdown rings: one clock face with a ring for each holder, the first nearest the centre, each drawn from the top round to when its time runs out (`levels`: each ring's time left; `span`: one full turn;
     *  `text`: a caption, the word before, the word after, then each ring's name). Its level is the time elapsed: one hatched slice eats every ring at the same speed, and a ring it passes vanishes, its name lighting and taking the word after. */
    | "countdown"
    /** An orbit: riders on a circle that turns, boarding at one gate and stepping off at another (`levels`: as orbitLevels; `text`: a caption, the count's word, then the gates' names). Its level is the time:
     *  each rider has gone round (time − boarding) × speed from the gate on, so set with `over` they sweep round the arc; the newest aboard is lit and the count aboard said in the middle. */
    | "orbit"
    /** Bins: one series as flat steps over bins of uneven width, each at the mean of the raw points under it, the points small dots over their steps (`levels`: as binsLevels; `text`: a caption, then a word over each bin).
     *  Its level is the bin picked, from 1 (0: none); a beat's `cut` moves the edges, and neighbouring steps slide together to their shared mean as the dots sink into them. */
    | "bins"
    /** A ripple: concentric rings about one centre, each as far out as its level (`levels`: each ring's radius, to scale; `text`: a caption, then each ring's name, set where it crosses an upright ray; `unit`: said after the front's reach).
     *  Its level is the radius the front has reached: the band from the last ring passed out to the front is hatched, the rings passed take its tone and the ring it rests on is lit. */
    | "ripple"
    /** A fingerprint: a four by four square of cells whose pattern comes from its words (`levels`: each cell, row by row, 0 to 1, as fingerprintLevels gives; `text`: its caption).
     *  Its level is how lit it is while being compared; its tone, green or red, says whether it matched. A beat's `cut` changes its pattern, the cells shrinking out and growing in. */
    | "fingerprint"
    /** A loop: two things that hold each other (`loops`: their ids; `levels`: [gap], px), drawn as one closed square ring standing that far clear of both, a head on each long side so it reads
     *  as going round; it is set round them afresh in every moment, so it moves when they move. Its level is how far round it is drawn, 0 to 1; a beat's `busy` (or `run`) sends a light round it without stopping. */
    | "loop"
    /** A roulette: a ring cut into slices as wide as their sizes under a pointer fixed at the top (`levels`: as rouletteLevels; `text`: a caption, then each slice's name). Its level is how far it has
     *  turned clockwise, in turns, so set with `over` it spins; the slice under the pointer is lit, and a beat's `cut` re-sizes the slices, their names riding round with them. */
    | "roulette"
    /** Wells: a square profile of pits along level ground, each as deep as its level and named under it, holding counters (`levels`: as wellsLevels; `text`: a caption, then each pit's name).
     *  Its level is the arrangement shown, from 0: set with `over`, the counters that change pits rise out over the rim and fall into their new one; a beat's `cut` re-digs the pits or lights others. */
    | "wells"
    /** An icicle: nested proportional strips, a tree cut row by row (`levels`: as icicleLevels; `text`: a caption, each part's name, then the ground's words). Each part stands exactly under the part it
     *  cuts, as wide as its size of the whole; ground no part covers is hatched. Its level is the part in question (from 1), its path up to the whole lit; a beat's `cut` cuts parts, theirs growing down out of them. */
    | "icicle"
    /** A wedge: one slice of a ring band cut across by rings (`levels`: its angles from and to, then each ring's radius, the first its inner edge, the last its rim). Its level is how many rings it has
     *  reached past the first: set, it grows outward ring by ring, the slice covered hatched in its tone, the rings passed in it and the ring it rests on lit. */
    | "wedge"
    /** A call stack: a column of frames from the bottom up (`levels`: as callstackLevels; `text`: a caption, then each frame's name followed by its slots' words). Its level is how deep it is: set,
     *  a frame is pushed on top or popped off. A wire lands on a slot by frame and slot ("st#newPoint.p", "st#main.q.l"); one landing on a slot in a popped frame dangles, red with an open head. */
    | "callstack"
    /** A floor: a grid of whole counts, a column of cells per item counting 0 up to a top count, the cells under each column's floor hatched (`levels`: as floorLevels; `text`: a caption, then each
     *  column's name). Its level is how many points have landed: set, each drops into its cell open, and once a column's last has landed its lowest fills; a point under its floor is red. */
    | "floor"
    /** A staple: two things clipped together (`staples`: their ids; `levels`: [bite, px, then each bracket's place along their shared edge, 0 to 1]), drawn as short square brackets across the seam between them,
     *  set on that seam afresh in every moment, so it moves with them; one not there yet is kept away, open, so when it is shown it closes as it comes in. Its level is how far it has closed, 0 to 1. */
    | "staple"
    /** An odometer: nested loops read as a counter (`levels`: its base, digits, form (0 rows, 1 grid), cell side, pitch and gap; `text`: a caption, then each row's name), a row of `base` cells per loop, the outermost on top, or its product grid, a cell per count.
     *  Its level is the count so far: set with `over`, the lowest row spins, and as it carries the row above ticks and the rows below reset; the grid fills a cell per count, the newest lit. */
    | "odometer"
    /** A dial: a measure that goes round as a clock face (`levels`: as dialLevels; `text`: a caption, each sector's name, then each point's word). Its level is how many points have arrived: set, each
     *  drops onto the rim and the hatched sweep turns on to its stand; a point landing where the sweep has been is red, and a sector arc lights once the sweep covers it. */
    | "dial";
  /** The wire a rider rides. */
  rides?: string;
  /** The two things a loop goes round. */
  loops?: [string, string];
  /** The two things a staple clips together. */
  staples?: [string, string];
  /** A colour of its own from the board's swatches, for as long as it is there. */
  colour?: Tone;
  /** What one step of a timeline stands for, how many units a tank holds, or the limit a unit chart is read against. */
  unit?: string;
  /** How many steps a timeline is drawn to: give stacked timelines the same span so they share one scale. The length of a row of postings' scale, likewise; how many cells a row of cells has. */
  span?: number;
  /** A guide drawn long and short by turns: a centre line. On a box: an outline of dashes (a step taken inside something, or a thing that stands in for another). */
  dashed?: true;
  /** A container inside another: its field a step lighter than the one it stands in. */
  deep?: true;
  /** Columns hung from a baseline along their top, each bar reaching down from it. */
  hang?: true;
  /** Columns whose second half of levels are splits: a line across each bar, the part above it hatched in the accent. */
  split?: true;
  /** A boundary's ground: tinted, shaded, or ruled in diagonals one way or both. */
  ground?: "tint" | "solid" | "hatch" | "cross";
  /** Words in a colour of their own (a legend's entry, a name's first part), or a point in one. */
  ink?: string;
  /** Words at a size of their own; set heavier; set in the label face; or turned to read upward (a lane's name). */
  size?: number;
  bold?: true;
  mono?: true;
  turn?: true;
  /** Where a label's x is on it, when not its left edge: its right edge, or its middle. */
  anchor?: "end" | "mid";
  /** A measure's edges carried to it from the feature this far away (px; above it when negative). */
  reach?: number;
  /** The heights a trace passes through, left to right (0 to 1). */
  levels?: number[];
  /** A mark's level to begin with. */
  value?: number;
  /** Not there until a beat shows it. */
  hidden?: true;
  /** A label set in the reading face, heavier: for words that are themselves the thing shown. */
  prose?: true;
  /** A label set as a sentence under a picture: the reading face, at reading size. */
  plain?: true;
  x: number; y: number; w: number; h: number;
  /** As it is to read: a name in capitals where it is a role (WORKER), in its own case where it is code (getUser()). */
  text: string;
  detail?: string;
}
/** An end joined to a thing (its id, and how far across and down it), or a free end at a point. */
type Spot = [string, number, number] | [number, number];
const freeEnd = (s: Spot): s is [number, number] => typeof s[0] === "number";
export interface Link {
  id: string;
  a: Spot; b: Spot;
  text?: string;
  /** No arrowhead: a lasting connection, not a step. */
  plain?: true;
  /** Drawn dashed: a way that is there but not the usual one. Ported: a socket at each end. */
  dashed?: true;
  ported?: true;
  /** Drawn in dots: something that happens out of sight, or only sometimes. */
  dotted?: true;
  /** Its words ride it in a pill. */
  pill?: true;
  /** A colour of its own beyond the three results (a legend names it). */
  ink?: string;
  /** A head at both ends: it goes both ways. How far its corners are rounded, where not the usual. */
  both?: true;
  bend?: number;
  /** Turns square corners to get there (for ends that do not line up). */
  elbow?: true;
  via?: [number, number][];
  /** A colour of its own (a line drawing keeps colour on its wires: red for the way a miss takes, green for a hit). */
  tone?: "red" | "green" | "amber" | "accent" | "violet" | "teal";
  /** A soft curve, square out of each end; and how far its middle has been pulled from the middle of its ends. */
  curve?: true;
  bow?: [number, number];
  /** A leader: a thin line from a few words to the feature they name, ending on it in a dot. */
  leader?: true;
  /** Not there until a beat shows it. */
  hidden?: true;
  /** Cut from the start: drawn broken until a beat runs it. */
  cut?: true;
}
export interface Beat {
  /** Things lit in this moment. */
  on?: string[];
  /** What a thing's detail line says from this moment on. */
  say?: Record<string, string>;
  /** Wires a request runs along (start to end), or an answer runs back along. */
  run?: string[];
  back?: string[];
  /** Wires on which a request is refused at the far end, or runs out before it. */
  refuse?: string[];
  lost?: string[];
  /** Lasting wires cut in this moment: a dropped connection, drawn broken with a short red gap at its middle, until a later beat runs it (or runs back along it) again. */
  sever?: string[];
  /** A mark's level from this moment on; glyphs at work in this moment; a thing's colour in this moment; where a thing stands from this moment on. */
  set?: Record<string, number>;
  busy?: string[];
  tone?: Record<string, "red" | "green" | "amber">;
  at?: Record<string, [number, number]>;
  /** How large a thing is from this moment on (width, height): the same thing, grown or shrunk. */
  size?: Record<string, [number, number]>;
  /** Things that are there from this moment on, or gone from this moment on. */
  /** A whole cut afresh from this moment on: segments' or a timeline's sizes, which grow and shrink between moments. */
  cut?: Record<string, number[]>;
  show?: string[];
  drop?: string[];
  /** Things and wires not there in this moment, or there but faint. */
  hide?: string[];
  faint?: string[];
  over?: number;
  hold?: number;
}

/** Every diagram told so far, as it was written: so one can be told again in another look, or printed as a story (weld guide). */
export const TOLD = new Map<string, Parameters<typeof story>[0]>();
/** A name shouted in capitals, said plainly: RATE LIMITER is Rate limiter. Short ones (API, DB) are names in their own right and stay. */
const plainly = (s: string) => (s.length > 4 && s === s.toUpperCase() && /[A-Z]/.test(s) ? s[0] + s.slice(1).toLowerCase() : s);
/** How heavy the board's own look draws an outline and a wire. */
const EDGEW = 1.5, WIRE = 2;
/** A box widened (about its middle) to hold its words, as the board's own hand sets them: a card's name; a panel's or machine's name and detail line. */
function fitWords<T extends Thing>(t: T, detail: string | undefined): T {
  const k = t.kind;
  if (k !== "card" && k !== "panel" && k !== "machine" && k !== "pill" && k !== "chip") return t;
  const wide = (text: string, size: number, track: number, fw: number) => Math.max(0, ...text.split("\n").map((line) => layoutText(line, Infinity, size, track, fw).w));
  const need = k === "card" ? wide(detail && detail.length > t.text.length ? detail : t.text, 19, 0.04, 400) + 40 : k === "pill" || k === "chip" ? wide(t.text, 14, 0.1, 500) + 32
    : Math.max(wide(t.text, 15, 0.16, 500) + PAD[k] * 2 + (k === "panel" ? 28 : 0), wide(detail ?? "", 15, 0.04, 400) + PAD[k] * 2);
  return need > t.w ? { ...t, x: t.x - (need - t.w) / 2, w: Math.ceil(need) } : t;
}
const HEAD = { panel: 52, machine: 52 } as const, PAD = { panel: 16, machine: 20 } as const;
const MARKS = new Set<Thing["kind"]>(["meter", "gauge", "bars", "queue", "glyph", "window", "wave", "plot", "ticks", "timeline", "segments", "tank", "rule", "axis", "units", "gap", "postings", "stair", "lattice", "cells", "plane", "comb", "columns", "scatter", "levels", "belt", "shingles", "wheel", "walls", "threshold", "ratchet", "overlap", "field", "interval", "fence", "reaches", "ringbuf", "wall", "wrap", "tether", "tokens", "break", "trail", "jaws", "tries", "cone", "trie", "spans", "minmax", "countdown", "orbit", "bins", "ripple", "fingerprint", "roulette", "wells", "icicle", "wedge", "callstack", "floor", "odometer", "dial"]);

/** `look: "line"` draws it as a line drawing: hairline boxes, containers named in small capitals at their top corner, thin wires with their words in capsules;
 *  colour is kept for wires and for what failed or passed. `look: "figure"` is the same hand for a figure a textbook would print: plain words, nothing coloured that is not a result.
 *  `look: "draft"` is a construction drawing: dark outlines for the thing, quiet broken lines for how it was set out, measures in units, hatching for the one part in question;
 *  with a `code`, its code and name are set under it. */
/** Wires that join the same two things at the middles of the same sides would lie on top of each other: they leave from spots spread along those sides instead. */
function sideBySide(links: Link[]): Link[] {
  const mid = (p: Link["a"]) => !freeEnd(p) && ((p[1] === 0.5 && (p[2] === 0 || p[2] === 1)) || (p[2] === 0.5 && (p[1] === 0 || p[1] === 1)));
  const key = (l: Link) => (freeEnd(l.a) || freeEnd(l.b) || !mid(l.a) || !mid(l.b) || l.leader ? "" : [l.a.join(","), l.b.join(",")].sort().join("|"));
  const groups = new Map<string, number[]>();
  links.forEach((l, i) => { const k = key(l); if (k) groups.set(k, [...(groups.get(k) ?? []), i]); });
  const out = [...links];
  for (const ids of groups.values()) {
    if (ids.length < 2) continue;
    ids.forEach((i, n) => {
      const f = (n + 1) / (ids.length + 1), along = (p: Link["a"]): Link["a"] => { const q = p as [string, number, number]; return q[1] === 0.5 ? [q[0], f, q[2]] : [q[0], q[1], f]; };
      const l = out[i]!;
      out[i] = { ...l, a: along(l.a), b: along(l.b) };
    });
  }
  return out;
}

/** A small mark left just under a panel (a gauge, bars, a queue, a glyph) is that panel's: it is drawn inside it, under its detail line, and the panel grows to hold it. */
const SMALL = new Set<Thing["kind"]>(["meter", "gauge", "bars", "queue", "glyph", "window"]);
function foldIn(things: Thing[]): Thing[] {
  const out = [...things];
  out.forEach((m, i) => {
    if (!SMALL.has(m.kind)) return;
    const k = out.findIndex((p) => (p.kind === "panel" || p.kind === "machine") && m.y >= p.y + p.h - 4 && m.y - (p.y + p.h) <= 80 && Math.min(m.x + m.w, p.x + p.w) - Math.max(m.x, p.x) > Math.min(m.w, p.w) * 0.5);
    if (k < 0) return;
    // (a mark with a caption of its own stands lower, so its caption clears the detail line)
    // it grows about its middle, so what was lined up with it still is
    // (the panel's detail line says how much: the mark keeps no words of its own, so nothing is said twice)
    const p = out[k]!, said = p.detail !== undefined && m.kind !== "window", text = said ? "" : m.text, w = p.w - 32, off = 48 + 46 + (text && m.kind !== "window" ? 20 : 0), h = Math.max(p.h, off + m.h + 20), y = p.y - (h - p.h) / 2;
    out[i] = { ...m, text, x: p.x + 16, y: y + off, w };
    out[k] = { ...p, y, h };
  });
  return out;
}

/** Wires from different places that land on the middle of the same side of one thing would bunch their heads into one: they land spread along that side instead, in the order they come from, so none cross. */
function spreadEnds(links: Link[], things: Thing[]): Link[] {
  const at = (id: string) => things.find((t) => t.id === id);
  const mid = (p: Link["a"]) => !freeEnd(p) && ((p[1] === 0.5 && (p[2] === 0 || p[2] === 1)) || (p[2] === 0.5 && (p[1] === 0 || p[1] === 1)));
  // (an end on a call stack's slot keeps to its slot: wires that share one go to the same place, at different moments)
  const onSlot = (p: Link["a"]) => { const h = freeEnd(p) ? -1 : (p[0] as string).lastIndexOf("#"); return h >= 0 && at((p[0] as string).slice(0, h))?.kind === "callstack"; };
  const out = [...links], ends = new Map<string, { i: number; end: "a" | "b" }[]>();
  out.forEach((l, i) => { if (l.leader) return; for (const end of ["a", "b"] as const) { const p = l[end]; if (mid(p) && at(p[0] as string)?.kind !== "junction" && !onSlot(p)) { const k = (p as unknown[]).join(","); ends.set(k, [...(ends.get(k) ?? []), { i, end }]); } } });
  for (const list of ends.values()) {
    // only wires that come from different things (two between the same pair are spread already)
    const other = (e: { i: number; end: "a" | "b" }) => out[e.i]![e.end === "a" ? "b" : "a"];
    if (list.length < 2 || new Set(list.map((e) => (freeEnd(other(e)) ? "" : other(e)[0]))).size < list.length) continue;
    const p0 = out[list[0]!.i]![list[0]!.end] as [string, number, number], upright = p0[1] === 0 || p0[1] === 1;
    const where = (e: { i: number; end: "a" | "b" }) => { const q = other(e); if (freeEnd(q)) return upright ? q[1] : q[0]; const t = at(q[0]); return t ? (upright ? t.y + t.h / 2 : t.x + t.w / 2) : 0; };
    [...list].sort((x, y) => where(x) - where(y)).forEach((e, n) => {
      const f = 0.5 + (n - (list.length - 1) / 2) * Math.min(0.22, 0.6 / list.length), l = out[e.i]!, q = l[e.end] as [string, number, number];
      out[e.i] = { ...l, [e.end]: upright ? [q[0], q[1], f] : [q[0], f, q[2]] };
    });
  }
  return out;
}

/** Two things joined side to side whose notches are nearly level are put level, so the wire between them runs straight into both: the smaller moves to the larger. */
function lineUp(things: Thing[], links: Link[]): Thing[] {
  const out = [...things], ix = (id: string) => out.findIndex((t) => t.id === id);
  for (const l of links) {
    if (freeEnd(l.a) || freeEnd(l.b) || l.leader) continue;
    const i = ix(l.a[0]), j = ix(l.b[0]);
    if (i < 0 || j < 0) continue;
    const A = out[i]!, B = out[j]!, across = (l.a[1] === 0 || l.a[1] === 1) && (l.b[1] === 0 || l.b[1] === 1) && l.a[2] === 0.5 && l.b[2] === 0.5;
    if (!across || A.kind === "boundary" || B.kind === "boundary" || A.kind === "label" || B.kind === "label") continue;
    // (where a wire meets each side: a panel at its header line, anything else at its middle)
    const notch = (t: Thing) => (t.kind === "panel" && t.h >= HEAD.panel + 12 ? t.y + HEAD.panel : t.y + t.h / 2);
    const d = notch(A) - notch(B);
    if (Math.abs(d) < 0.5 || Math.abs(d) > 36) continue;
    if (B.h <= A.h) out[j] = { ...B, y: B.y + d }; else out[i] = { ...A, y: A.y - d };
  }
  return out;
}

/** Wire ends on one cell of a row of cells ("bits#5.t@0.3", read as across and down that cell) are made ends on the row itself, at that cell. */
function cellEnds(links: Link[], things: Thing[]): Link[] {
  const on = (p: Spot): Spot => {
    if (freeEnd(p)) return p;
    const hash = p[0].lastIndexOf("#"), row = hash < 0 ? undefined : things.find((t) => t.id === p[0].slice(0, hash) && t.kind === "cells");
    if (!row) return p;
    const { n, size, pitch } = cellPlaces(row), i = Math.min(n - 1, Math.max(0, Math.round(+p[0].slice(hash + 1) || 0)));
    return [row.id, (i * pitch + p[1] * size) / row.w, (p[2] * size) / row.h];
  };
  return links.map((l) => ({ ...l, a: on(l.a), b: on(l.b) }));
}

/** A rider goes where its wire's request or answer goes: a beat that runs its wire carries it to the end (1), one that runs back along it to the start (0), unless the beat sets it itself. */
function ride(beats: Beat[], things: Thing[]): Beat[] {
  const riders = things.filter((t) => t.kind === "rider" && t.rides);
  if (!riders.length) return beats;
  return beats.map((b) => {
    const go = Object.fromEntries(riders.flatMap((t) => (b.back?.includes(t.rides!) ? [[t.id, 0]] : b.run?.includes(t.rides!) ? [[t.id, 1]] : [])));
    return Object.keys(go).length ? { ...b, set: { ...go, ...b.set } } : b;
  });
}

export function story(d0: { slug: string; name: string; about: string; things: Thing[]; links: Link[]; beats: Beat[]; at?: number; look?: "line" | "figure" | "draft" | "system" | "quiet"; code?: string }, o: { remember?: boolean } = {}): StampDef {
  const things0 = lineUp(foldIn(d0.things), d0.links), d = { ...d0, beats: ride(d0.beats, d0.things), things: things0, links: cellEnds(spreadEnds(sideBySide(d0.links), things0), things0) };
  // a wire may share its name with a thing (a request and the wire it runs along): on the board they are kept apart
  const clash = new Set(d.links.map((l) => l.id).filter((id) => d.things.some((t) => t.id === id)));
  /** Is a mark drawn inside this thing's body? */
  const holdsMark = (t: Thing) => d.things.some((u) => u.id !== t.id && MARKS.has(u.kind) && u.x >= t.x && u.y >= t.y + 40 && u.x + u.w <= t.x + t.w + 1 && u.y + u.h <= t.y + t.h + 1);
  // (a diagram told by a stranger, on the server, is not kept: only the board's own are told again)
  if (o.remember !== false) TOLD.set(d.slug, d0);
  const quiet = d.look === "quiet", sys = d.look === "system", draft = d.look === "draft", thin = d.look === "line" || d.look === "figure" || draft || sys, fig = d.look === "figure" || draft, fig0 = fig;
  // the longest thing each box ever says, so it is wide enough in every moment (and does not change width between them)
  const longest: Record<string, string> = {};
  for (const t of d.things) if (t.detail) longest[t.id] = t.detail;
  for (const b of d.beats) for (const [id, v] of Object.entries(b.say ?? {})) if (v.length > (longest[id]?.length ?? 0)) longest[id] = v;
  const said: Record<string, string> = Object.fromEntries(d.things.filter((t) => t.detail !== undefined).map((t) => [t.id, t.detail!]));
  const level: Record<string, number> = Object.fromEntries(d.things.filter((t) => t.value !== undefined).map((t) => [t.id, t.value!]));
  const stand: Record<string, [number, number]> = {};
  const span: Record<string, [number, number]> = {};
  const cuts: Record<string, number[]> = {};
  const gone = new Set([...d.things, ...d.links].filter((t) => t.hidden).map((t) => t.id)), broken = new Set(d.links.filter((l) => l.cut).map((l) => l.id));
  const frames = d.beats.map((b) => { for (const id of [...(b.run ?? []), ...(b.back ?? [])]) broken.delete(id); for (const id of b.sever ?? []) broken.add(id); const moved = Object.entries(b.set ?? {}).filter(([k, v]) => level[k] !== v).map(([k]) => k), told = Object.entries(b.say ?? {}).filter(([k, v]) => said[k] !== v).map(([k]) => k); Object.assign(said, b.say ?? {}); Object.assign(level, b.set ?? {}); Object.assign(stand, b.at ?? {}); Object.assign(span, b.size ?? {}); Object.assign(cuts, b.cut ?? {}); for (const id of b.show ?? []) gone.delete(id); for (const id of b.drop ?? []) gone.add(id); return { b, moved, told, said: { ...said }, level: { ...level }, stand: { ...stand }, span: { ...span }, cuts: { ...cuts }, gone: new Set(gone), severed: new Set(broken) }; });
  const shapes = ({ b, moved, told, said, level, stand, span, cuts, gone, severed }: (typeof frames)[number]): Shape[] => {
    // a small mark whose level changes in this moment is lit in it, and so is a panel whose detail line changes (unless it is coloured or faded): the change is where the eye should go
    const kindOf = (id: string) => d.things.find((t) => t.id === id)?.kind ?? "label";
    const on = new Set([...(b.on ?? []), ...moved.filter((id) => SMALL.has(kindOf(id))), ...told.filter((id) => (kindOf(id) === "panel" || kindOf(id) === "machine") && !b.tone?.[id] && !b.faint?.includes(id))]), hide = new Set([...(b.hide ?? []), ...gone]), faint = new Set(b.faint), o = (id: string) => (faint.has(id) ? { o: 0.35 } : {});
    const fences: Shape[] = [], wires: Shape[] = [], things: Shape[] = [], words: Shape[] = [], leads: Shape[] = [], rode: Shape[] = [];
    // (riders stand on their wires, so they are placed once the wires are; one not there yet is kept away, so it glides in from where it was left)
    const riding: { t: Thing; tone: Tone; away: boolean }[] = [];
    // (loops go round things, so they are set once the things are)
    const looping: Thing[] = [], round: Record<string, { x: number; y: number; w: number; h: number }> = {}, rings: Shape[] = [];
    // (staples clip things together across the seam between them, so they are set once the things are)
    const stapling: { t: Thing; away: boolean }[] = [], clips: Shape[] = [];
    for (const t0 of d.things) {
      if (t0.kind === "loop") { if (!hide.has(t0.id)) looping.push(t0); continue; }
      if (t0.kind === "staple") { stapling.push({ t: t0, away: hide.has(t0.id) }); continue; }
      if (t0.kind === "rider") riding.push({ t: t0, tone: b.tone?.[t0.id] ?? t0.colour ?? "ink", away: hide.has(t0.id) });
      if (hide.has(t0.id)) continue;
      const t1 = { ...t0, ...(stand[t0.id] ? { x: stand[t0.id]![0], y: stand[t0.id]![1] } : {}), ...(span[t0.id] ? { w: span[t0.id]![0], h: span[t0.id]![1] } : {}) };
      // in the board's own hand a box is never narrower than its words: it grows about its middle to hold its name and what it says
      const t = !thin ? fitWords(t1, longest[t0.id]) : t1;
      round[t0.id] = t;
      if (t.kind === "rider" || t.kind === "loop" || t.kind === "staple") continue;
      const hue = b.tone?.[t.id] ?? t.colour, lit = on.has(t.id) || !!hue, line = lit ? ("accent" as const) : ("n300" as const), base = { id: t.id, x: t.x, y: t.y, w: t.w, h: t.h, fill: "none" as const, tone: hue ?? (lit ? ("accent" as const) : ("ink" as const)) };
      if (quiet && (t.kind === "card" || t.kind === "pill" || t.kind === "chip" || t.kind === "panel" || t.kind === "machine")) {
        // the quiet look: every box is the same hairline, lower than it was, its name said plainly; what is happening shows in its words and on the wire, never in its outline
        const small = t.kind === "pill" || t.kind === "chip", detail = small || t.kind === "card" ? "" : (said[t.id] ?? ""), name = plainly(small || t.kind === "card" ? (said[t.id] ?? t.text) : t.text);
        // (one that holds something keeps its height, with its name at the top)
        const holds = !small && d.things.some((u) => u.id !== t.id && !hide.has(u.id) && u.x >= t.x && u.y >= t.y && u.x + u.w <= t.x + t.w && u.y + u.h <= t.y + t.h);
        const H = holds ? t.h : Math.min(t.h, small ? 28 : detail ? 60 : 46), y = t.y + (t.h - H) / 2;
        things.push({ ...base, y, h: H, kind: "rect", text: detail || holds ? "" : name, size: small ? 12 : 15, ...(small ? { track: 0.02 } : {}), fine: { line: lit && !hue ? "n500" : "n300", fill: "paper", w: 1, r: small ? H / 2 : 6, ...(hue ? {} : { text: "n900" as const }), fw: 400, crisp: true, ...o(t.id) } } satisfies Box);
        if (detail || holds) {
          const n = layoutText(name, Infinity, 15, undefined, 400), dl = layoutText(detail || " ", Infinity, 13, undefined, 400), cx = t.x + t.w / 2;
          words.push({ id: t.id + "n", kind: "text", x: cx - n.w / 2, y: y + 10, w: n.w, h: n.h, text: name, size: 15, tone: "ink", fine: { text: "n900", fw: 400, ...o(t.id) } } satisfies Text);
          if (detail) words.push({ id: t.id + "d", kind: "text", x: cx - dl.w / 2, y: y + H - 10 - dl.h, w: dl.w, h: dl.h, text: detail, size: 13, tone: hue ?? "ink", fine: hue ? { fw: 400, ...o(t.id) } : { text: lit ? "accent" : "n500", fw: 400, ...o(t.id) } } satisfies Text);
        }
        continue; }
      if (quiet && t.kind === "boundary") {
        // a container is a hairline and a step of lightness, named in small capitals at its corner
        fences.push({ ...base, kind: "rect", text: "", fine: { line: "n300", w: 1, r: 4, fill: "n50", crisp: true, ...o(t.id) } } satisfies Box);
        const l = layoutText(t.text, Infinity, 11, 0.06, 500); words.push({ id: t.id + "n", kind: "text", x: t.x + 14, y: t.y + 12, w: l.w, h: l.h, text: t.text, size: 11, track: 0.06, tone: "ink", fine: { text: "n600", fw: 500, ...o(t.id) } } satisfies Text);
        continue; }
      if (quiet && t.kind === "label" && !t.prose) { const words0 = said[t.id] ?? t.text; if (!words0) continue; const l = layoutText(words0, Infinity, 13, undefined, 400); words.push({ id: t.id, kind: "text", x: t.x, y: t.y, w: l.w, h: l.h, text: words0, size: 13, tone: hue ?? "ink", fine: hue ? { fw: 400, ...o(t.id) } : { text: lit ? "accent" : "n500", fw: 400, ...o(t.id) } } satisfies Text); continue; }
      if (sys && (t.kind === "card" || t.kind === "pill" || t.kind === "chip")) {
        // the system: every box the same hairline, its words white; a small name is a capsule set in the label face; dashes for a step inside something
        const small = t.kind !== "card", red = hue === "red", c = red ? RED : hue ? undefined : t.ink ? (t.ink as Shade) : small || lit ? W : EDGE;
        things.push({ ...base, kind: "rect", text: said[t.id] ?? t.text, size: small || t.mono ? 13 : 14, ...(small || t.mono ? { track: 0 } : {}), ...(t.dashed ? { line: "dashed" as const } : {}), ...(hue && !red ? { fill: "tint" as const } : {}),
          fine: { ...(c ? { line: c } : {}), ...(red ? { fill: RED, fo: 0.2, text: REDW } : hue ? {} : { fill: "paper" as const, text: W }), w: 1, r: small ? t.h / 2 : 5, fw: 400, crisp: true, ...o(t.id) } } satisfies Box); continue; }
      if (thin && (t.kind === "card" || t.kind === "pill" || t.kind === "chip")) {
        // a line drawing: a box is a hairline and its words; a small name is the same, rounded right off
        const small = t.kind !== "card";
        things.push({ ...base, kind: "rect", text: said[t.id] ?? t.text, size: small ? 13 : 16, ...(small ? { track: 0.03 } : {}),
          ...(draft ? { size: small ? 12 : 14, track: undefined } : {}),
          fine: { ...(hue ? {} : { line: lit ? ("n900" as const) : draft ? ("n700" as const) : ("n400" as const) }), fill: "paper", w: draft ? (lit || hue ? 1.75 : 1) : hue || lit ? 1.5 : 1, r: small ? t.h / 2 : draft ? 7 : 5, text: lit || hue || draft ? "n900" : "n700", fw: small && !draft ? 500 : 400, ...o(t.id) } } satisfies Box); continue; }
      if (t.kind === "dot" || t.kind === "ring") {
        // a point on a line, filled once it counts; or the circle things stand on, which is construction
        if (t.kind === "ring") fences.push({ ...base, kind: "ellipse", text: "", tone: "muted", line: "dashed", fine: { line: "n400", w: 1, fill: "none", ...o(t.id) } } satisfies Box);
        else if (t.ink) things.push({ ...base, kind: "ellipse", text: "", fine: { line: t.ink as Shade, fill: t.ink as Shade, w: 1, ...o(t.id) } } satisfies Box);
        else things.push({ ...base, kind: "ellipse", text: said[t.id] ?? t.text, size: 11, ...(hue ? { fill: "solid" as const, fine: { w: 1.25, ...o(t.id) } } : { fine: { line: lit ? "n900" : "n700", w: 1, fill: lit ? "n900" : "paper", text: lit ? "paper" : "n700", ...o(t.id) } }) } satisfies Box);
        continue; }
      if (t.kind === "timeline" || t.kind === "tank" || t.kind === "segments" || t.kind === "units") { things.push({ ...base, kind: t.kind, text: said[t.id] ?? t.text, tone: hue ?? "ink", value: level[t.id] ?? 0, ...(cuts[t.id] ?? t.levels ? { levels: cuts[t.id] ?? t.levels } : {}), ...(t.unit ? { unit: t.unit } : {}), ...(t.span ? { span: t.span } : {}) } satisfies Box); continue; }
      // an arc is drawn in the hand the wires are: their line and their weight, the accent when it is lit
      if (t.kind === "arc") { things.push({ ...base, kind: "arc", text: said[t.id] ?? t.text, value: level[t.id] ?? 0, ...(cuts[t.id] ?? t.levels ? { levels: cuts[t.id] ?? t.levels } : {}), fine: { ...(hue ? {} : { line: lit ? ("accent" as const) : sys ? W : draft ? ("n700" as const) : thin ? ("n400" as const) : ("n300" as const) }), w: thin ? 1 : WIRE, ...o(t.id) } } satisfies Box); continue; }
      // a spiral's first lap is drawn as an arc is; the laps past it take its colour, amber when it has none
      if (t.kind === "spiral") { things.push({ ...base, kind: "spiral", text: said[t.id] ?? t.text, tone: hue ?? "amber", value: level[t.id] ?? 0, ...(cuts[t.id] ?? t.levels ? { levels: cuts[t.id] ?? t.levels } : {}), fine: { line: on.has(t.id) ? ("accent" as const) : sys ? W : draft ? ("n700" as const) : thin ? ("n400" as const) : ("n300" as const), w: thin ? 1 : WIRE, ...o(t.id) } } satisfies Box); continue; }
      if (t.kind === "lattice") { things.push({ ...base, kind: "lattice", text: said[t.id] ?? t.text, tone: hue ?? "ink", value: level[t.id] ?? 0, ...(cuts[t.id] ?? t.levels ? { levels: cuts[t.id] ?? t.levels } : {}), fine: { ...o(t.id) } } satisfies Box); continue; }
      if (t.kind === "overlap") { things.push({ ...base, kind: "overlap", text: said[t.id] ?? t.text, tone: hue ?? "ink", value: level[t.id] ?? 0, ...(cuts[t.id] ?? t.levels ? { levels: cuts[t.id] ?? t.levels } : {}), fine: { ...o(t.id) } } satisfies Box); continue; }
      if (t.kind === "plane") { things.push({ ...base, kind: "plane", text: said[t.id] ?? t.text, tone: hue ?? "ink", value: level[t.id] ?? 0, ...(cuts[t.id] ?? t.levels ? { levels: cuts[t.id] ?? t.levels } : {}), fine: { ...o(t.id) } } satisfies Box); continue; }
      if (t.kind === "comb") { things.push({ ...base, kind: "comb", text: said[t.id] ?? t.text, tone: hue ?? "ink", value: level[t.id] ?? 0, ...(cuts[t.id] ?? t.levels ? { levels: cuts[t.id] ?? t.levels } : {}), ...(t.span ? { span: t.span } : {}), fine: { ...o(t.id) } } satisfies Box); continue; }
      if (t.kind === "field") { things.push({ ...base, kind: "field", text: said[t.id] ?? t.text, tone: hue ?? "ink", value: level[t.id] ?? 0, ...(cuts[t.id] ?? t.levels ? { levels: cuts[t.id] ?? t.levels } : {}), fine: { ...o(t.id) } } satisfies Box); continue; }
      if (t.kind === "scatter") { things.push({ ...base, kind: "scatter", text: said[t.id] ?? t.text, tone: hue ?? "ink", value: level[t.id] ?? 0, ...(cuts[t.id] ?? t.levels ? { levels: cuts[t.id] ?? t.levels } : {}), fine: { ...o(t.id) } } satisfies Box); continue; }
      if (t.kind === "columns") { things.push({ ...base, kind: "columns", text: said[t.id] ?? t.text, tone: hue ?? "ink", value: level[t.id] ?? 0, ...(cuts[t.id] ?? t.levels ? { levels: cuts[t.id] ?? t.levels } : {}), ...(t.span ? { span: t.span } : {}), ...(t.hang ? { hang: true as const } : {}), ...(t.split ? { split: true as const } : {}), fine: { ...o(t.id) } } satisfies Box); continue; }
      if (t.kind === "levels") { things.push({ ...base, kind: "levels", text: said[t.id] ?? t.text, tone: hue ?? "ink", value: level[t.id] ?? 0, ...(cuts[t.id] ?? t.levels ? { levels: cuts[t.id] ?? t.levels } : {}), ...(t.span ? { span: t.span } : {}), fine: { ...o(t.id) } } satisfies Box); continue; }
      if (t.kind === "shingles") { things.push({ ...base, kind: "shingles", text: said[t.id] ?? t.text, tone: hue ?? "ink", value: level[t.id] ?? 0, ...(cuts[t.id] ?? t.levels ? { levels: cuts[t.id] ?? t.levels } : {}), ...(t.span ? { span: t.span } : {}), fine: { ...o(t.id) } } satisfies Box); continue; }
      if (t.kind === "ratchet") { things.push({ ...base, kind: "ratchet", text: said[t.id] ?? t.text, tone: hue ?? "ink", value: level[t.id] ?? 0, ...(cuts[t.id] ?? t.levels ? { levels: cuts[t.id] ?? t.levels } : {}), fine: { ...o(t.id) } } satisfies Box); continue; }
      if (t.kind === "walls") { things.push({ ...base, kind: "walls", text: said[t.id] ?? t.text, tone: hue ?? "ink", value: level[t.id] ?? 0, ...(cuts[t.id] ?? t.levels ? { levels: cuts[t.id] ?? t.levels } : {}), fine: { ...o(t.id) } } satisfies Box); continue; }
      if (t.kind === "ringbuf") { things.push({ ...base, kind: "ringbuf", text: said[t.id] ?? t.text, tone: hue ?? "ink", value: level[t.id] ?? 0, ...(cuts[t.id] ?? t.levels ? { levels: cuts[t.id] ?? t.levels } : {}), ...(t.span ? { span: t.span } : {}), fine: { ...o(t.id) } } satisfies Box); continue; }
      if (t.kind === "wheel") { things.push({ ...base, kind: "wheel", text: said[t.id] ?? t.text, tone: hue ?? "ink", value: level[t.id] ?? 0, ...(cuts[t.id] ?? t.levels ? { levels: cuts[t.id] ?? t.levels } : {}), ...(t.span ? { span: t.span } : {}), fine: { ...o(t.id) } } satisfies Box); continue; }
      if (t.kind === "belt") { things.push({ ...base, kind: "belt", text: said[t.id] ?? t.text, tone: hue ?? "ink", value: level[t.id] ?? 0, ...(t.span ? { span: t.span } : {}), fine: { ...o(t.id) } } satisfies Box); continue; }
      if (t.kind === "cells") { things.push({ ...base, kind: "cells", text: said[t.id] ?? t.text, tone: hue ?? "ink", value: level[t.id] ?? 0, ...(cuts[t.id] ?? t.levels ? { levels: cuts[t.id] ?? t.levels } : {}), ...(t.span ? { span: t.span } : {}), fine: { ...o(t.id) } } satisfies Box); continue; }
      if (t.kind === "wrap") { things.push({ ...base, kind: "wrap", text: said[t.id] ?? t.text, tone: hue ?? "ink", value: level[t.id] ?? 0, ...(cuts[t.id] ?? t.levels ? { levels: cuts[t.id] ?? t.levels } : {}), fine: { ...o(t.id) } } satisfies Box); continue; }
      // (a tether told one line is told its block's detail line; its name and its threads' names stay)
      if (t.kind === "tether") { const w0 = said[t.id], l0 = t.text.split("\n"), text = w0 !== undefined && !w0.includes("\n") ? [l0[0] ?? "", w0, ...l0.slice(2)].join("\n") : (w0 ?? t.text); things.push({ ...base, kind: "tether", text, tone: hue ?? "ink", value: level[t.id] ?? 0, ...(cuts[t.id] ?? t.levels ? { levels: cuts[t.id] ?? t.levels } : {}), fine: { ...o(t.id) } } satisfies Box); continue; }
      if (t.kind === "break") { things.push({ ...base, kind: "break", text: said[t.id] ?? t.text, tone: hue ?? "ink", value: level[t.id] ?? 0, fine: { ...o(t.id) } } satisfies Box); continue; }
      // (a cone told one line is told its name; its ceiling's words and its instant's stay)
      if (t.kind === "cone") { const w0 = said[t.id], l0 = t.text.split("\n"), text = w0 !== undefined && !w0.includes("\n") ? [w0, ...l0.slice(1)].join("\n") : (w0 ?? t.text); things.push({ ...base, kind: "cone", text, tone: hue ?? "ink", value: level[t.id] ?? 0, ...(cuts[t.id] ?? t.levels ? { levels: cuts[t.id] ?? t.levels } : {}), fine: { ...o(t.id) } } satisfies Box); continue; }
      if (t.kind === "tries") { things.push({ ...base, kind: "tries", text: said[t.id] ?? t.text, tone: hue ?? "ink", value: level[t.id] ?? 0, ...(cuts[t.id] ?? t.levels ? { levels: cuts[t.id] ?? t.levels } : {}), fine: { ...o(t.id) } } satisfies Box); continue; }
      if (t.kind === "fingerprint") { things.push({ ...base, kind: "fingerprint", text: said[t.id] ?? t.text, tone: hue ?? "ink", value: level[t.id] ?? 0, ...(cuts[t.id] ?? t.levels ? { levels: cuts[t.id] ?? t.levels } : {}), fine: { ...o(t.id) } } satisfies Box); continue; }
      if (t.kind === "callstack") { things.push({ ...base, kind: "callstack", text: said[t.id] ?? t.text, tone: hue ?? "ink", value: level[t.id] ?? 0, ...(cuts[t.id] ?? t.levels ? { levels: cuts[t.id] ?? t.levels } : {}), fine: { ...o(t.id) } } satisfies Box); continue; }
      if (t.kind === "wedge") { things.push({ ...base, kind: "wedge", text: said[t.id] ?? t.text, tone: hue ?? "ink", value: level[t.id] ?? 0, ...(cuts[t.id] ?? t.levels ? { levels: cuts[t.id] ?? t.levels } : {}), fine: { ...o(t.id) } } satisfies Box); continue; }
      if (t.kind === "ripple") { things.push({ ...base, kind: "ripple", text: said[t.id] ?? t.text, tone: hue ?? "ink", value: level[t.id] ?? 0, ...(cuts[t.id] ?? t.levels ? { levels: cuts[t.id] ?? t.levels } : {}), ...(t.unit ? { unit: t.unit } : {}), fine: { ...o(t.id) } } satisfies Box); continue; }
      if (t.kind === "roulette") { things.push({ ...base, kind: "roulette", text: said[t.id] ?? t.text, tone: hue ?? "ink", value: level[t.id] ?? 0, ...(cuts[t.id] ?? t.levels ? { levels: cuts[t.id] ?? t.levels } : {}), fine: { ...o(t.id) } } satisfies Box); continue; }
      if (t.kind === "icicle") { things.push({ ...base, kind: "icicle", text: said[t.id] ?? t.text, tone: hue ?? "ink", value: level[t.id] ?? 0, ...(cuts[t.id] ?? t.levels ? { levels: cuts[t.id] ?? t.levels } : {}), fine: { ...o(t.id) } } satisfies Box); continue; }
      if (t.kind === "dial") { things.push({ ...base, kind: "dial", text: said[t.id] ?? t.text, tone: hue ?? "ink", value: level[t.id] ?? 0, ...(cuts[t.id] ?? t.levels ? { levels: cuts[t.id] ?? t.levels } : {}), fine: { ...o(t.id) } } satisfies Box); continue; }
      if (t.kind === "odometer") { things.push({ ...base, kind: "odometer", text: said[t.id] ?? t.text, tone: hue ?? "ink", value: level[t.id] ?? 0, ...(cuts[t.id] ?? t.levels ? { levels: cuts[t.id] ?? t.levels } : {}), fine: { ...o(t.id) } } satisfies Box); continue; }
      if (t.kind === "floor") { things.push({ ...base, kind: "floor", text: said[t.id] ?? t.text, tone: hue ?? "ink", value: level[t.id] ?? 0, ...(cuts[t.id] ?? t.levels ? { levels: cuts[t.id] ?? t.levels } : {}), fine: { ...o(t.id) } } satisfies Box); continue; }
      if (t.kind === "wells") { things.push({ ...base, kind: "wells", text: said[t.id] ?? t.text, tone: hue ?? "ink", value: level[t.id] ?? 0, ...(cuts[t.id] ?? t.levels ? { levels: cuts[t.id] ?? t.levels } : {}), fine: { ...o(t.id) } } satisfies Box); continue; }
      if (t.kind === "bins") { things.push({ ...base, kind: "bins", text: said[t.id] ?? t.text, tone: hue ?? "ink", value: level[t.id] ?? 0, ...(cuts[t.id] ?? t.levels ? { levels: cuts[t.id] ?? t.levels } : {}), fine: { ...o(t.id) } } satisfies Box); continue; }
      if (t.kind === "orbit") { things.push({ ...base, kind: "orbit", text: said[t.id] ?? t.text, tone: hue ?? "ink", value: level[t.id] ?? 0, ...(cuts[t.id] ?? t.levels ? { levels: cuts[t.id] ?? t.levels } : {}), fine: { ...o(t.id) } } satisfies Box); continue; }
      if (t.kind === "countdown") { things.push({ ...base, kind: "countdown", text: said[t.id] ?? t.text, tone: hue ?? "ink", value: level[t.id] ?? 0, ...(cuts[t.id] ?? t.levels ? { levels: cuts[t.id] ?? t.levels } : {}), ...(t.span ? { span: t.span } : {}), fine: { ...o(t.id) } } satisfies Box); continue; }
      if (t.kind === "spans" || t.kind === "minmax") { things.push({ ...base, kind: t.kind, text: said[t.id] ?? t.text, tone: hue ?? "ink", value: level[t.id] ?? 0, ...(cuts[t.id] ?? t.levels ? { levels: cuts[t.id] ?? t.levels } : {}), ...(t.unit ? { unit: t.unit } : {}), fine: { ...o(t.id) } } satisfies Box); continue; }
      if (t.kind === "trie") { things.push({ ...base, kind: "trie", text: said[t.id] ?? t.text, tone: hue ?? "ink", value: level[t.id] ?? 0, ...(cuts[t.id] ?? t.levels ? { levels: cuts[t.id] ?? t.levels } : {}), fine: { ...o(t.id) } } satisfies Box); continue; }
      if (t.kind === "jaws") { things.push({ ...base, kind: "jaws", text: said[t.id] ?? t.text, tone: hue ?? "ink", value: level[t.id] ?? 0, ...(cuts[t.id] ?? t.levels ? { levels: cuts[t.id] ?? t.levels } : {}), ...(t.span ? { span: t.span } : {}), fine: { ...o(t.id) } } satisfies Box); continue; }
      if (t.kind === "trail") { things.push({ ...base, kind: "trail", text: said[t.id] ?? t.text, tone: hue ?? "ink", value: level[t.id] ?? 0, ...(cuts[t.id] ?? t.levels ? { levels: cuts[t.id] ?? t.levels } : {}), fine: { ...o(t.id) } } satisfies Box); continue; }
      if (t.kind === "tokens") { things.push({ ...base, kind: "tokens", text: said[t.id] ?? t.text, tone: hue ?? "ink", value: level[t.id] ?? 0, ...(cuts[t.id] ?? t.levels ? { levels: cuts[t.id] ?? t.levels } : {}), fine: { ...o(t.id) } } satisfies Box); continue; }
      if (t.kind === "wall") { things.push({ ...base, kind: "wall", text: said[t.id] ?? t.text, tone: hue ?? "ink", value: level[t.id] ?? 0, ...(cuts[t.id] ?? t.levels ? { levels: cuts[t.id] ?? t.levels } : {}), fine: { ...o(t.id) } } satisfies Box); continue; }
      if (t.kind === "reaches") { things.push({ ...base, kind: "reaches", text: said[t.id] ?? t.text, tone: hue ?? "ink", value: level[t.id] ?? 0, ...(cuts[t.id] ?? t.levels ? { levels: cuts[t.id] ?? t.levels } : {}), fine: { ...o(t.id) } } satisfies Box); continue; }
      if (t.kind === "fence") { things.push({ ...base, kind: "fence", text: said[t.id] ?? t.text, tone: hue ?? "ink", value: level[t.id] ?? 0, ...(cuts[t.id] ?? t.levels ? { levels: cuts[t.id] ?? t.levels } : {}), fine: { ...o(t.id) } } satisfies Box); continue; }
      if (t.kind === "interval") { things.push({ ...base, kind: "interval", text: said[t.id] ?? t.text, tone: hue ?? "ink", value: level[t.id] ?? 0, ...(cuts[t.id] ?? t.levels ? { levels: cuts[t.id] ?? t.levels } : {}), ...(t.span ? { span: t.span } : {}), fine: { ...o(t.id) } } satisfies Box); continue; }
      if (t.kind === "postings") { things.push({ ...base, kind: "postings", text: said[t.id] ?? t.text, tone: hue ?? "ink", value: level[t.id] ?? 0, ...(cuts[t.id] ?? t.levels ? { levels: cuts[t.id] ?? t.levels } : {}), ...(t.span ? { span: t.span } : {}), fine: { ...o(t.id) } } satisfies Box); continue; }
      if (t.kind === "junction") { things.push({ ...base, kind: "junction", text: "", tone: hue ?? "ink" } satisfies Box); continue; }
      if (t.kind === "legend") { things.push({ ...base, kind: "legend", text: said[t.id] ?? t.text, tone: "ink", ...(t.size ? { size: t.size } : {}) } satisfies Box); continue; }
      if (t.kind === "ticks") { things.push({ ...base, kind: "ticks", text: "", tone: hue ?? "ink", value: level[t.id] ?? 1, ...(t.levels ? { levels: t.levels } : {}), fine: { ...o(t.id) } } satisfies Box); continue; }
      if (sys && t.kind === "hatch") { fences.push({ ...base, kind: "hatch", text: "", tone: "muted", value: 1, fine: { line: "none", fill: "none", w: 1, crisp: true, ...o(t.id) } } satisfies Box); continue; }
      if (t.kind === "hatch" || t.kind === "guide" || t.kind === "parts") {
        // (a hatched field that other things stand in lies under the wires, as a boundary does)
        const field = t.kind === "hatch" && d.things.some((u) => u.id !== t.id && u.kind !== "label" && u.x >= t.x && u.y >= t.y && u.x + u.w <= t.x + t.w && u.y + u.h <= t.y + t.h);
        (field ? fences : things).push({ ...base, kind: t.kind, text: said[t.id] ?? t.text, tone: hue ?? (t.kind === "guide" ? "muted" : "ink"), ...(t.kind === "guide" ? (t.dashed ? { line: "dashed" as const } : {}) : { value: level[t.id] ?? 0 }), ...(t.levels ? { levels: t.levels } : {}),
          fine: { prose: true, ...(t.kind === "guide" || hue ? {} : { line: "n700" as const, fill: "paper" as const }), w: 1, ...o(t.id) } } satisfies Box); continue; }
      if (sys && (t.kind === "panel" || t.kind === "machine" || t.kind === "boundary")) {
        // a frame: a hairline with its name in heavy small capitals at the top corner; one inside another is a step lighter
        fences.push({ ...base, kind: "rect", text: "", ...(t.kind === "boundary" ? { line: "dashed" as const } : {}), fine: { ...(hue ? {} : { line: lit ? LIT : EDGE }), w: 1, r: 2, crisp: true, fill: t.deep ? DEEP : t.kind === "boundary" ? "none" : "paper", ...o(t.id) } } satisfies Box);
        if (t.text) { const l = layoutText(t.text, Infinity, 12, 0.03, 700); words.push({ id: t.id + "n", kind: "text", x: t.x + 15, y: t.y + 13, w: l.w, h: l.h, text: t.text, size: 12, track: 0.03, tone: hue ?? "ink", fine: hue ? { fw: 700, ...o(t.id) } : { text: W, fw: 700, ...o(t.id) } } satisfies Text); }
        continue; }
      if (thin && (t.kind === "panel" || t.kind === "machine" || t.kind === "boundary")) {
        // a container: a quiet field with its name in small capitals at the top corner, and what it says under the name
        fences.push({ ...base, kind: "rect", text: "", ...(t.kind === "boundary" ? { line: "dashed" as const } : {}), fine: { ...(hue ? {} : { line: lit ? ("n500" as const) : ("n300" as const) }), w: 1, r: 3, fill: t.kind === "boundary" ? "none" : "n100", ...o(t.id) } } satisfies Box);
        const l = layoutText(t.text, Infinity, 12, 0.05, 500);
        words.push({ id: t.id + "n", kind: "text", x: t.x + 16, y: t.y + 14, w: l.w, h: l.h, text: t.text, size: 12, track: 0.05, tone: hue ?? "ink", fine: hue ? { fw: 500, ...o(t.id) } : { text: lit ? "n900" : "n600", fw: 500, ...o(t.id) } } satisfies Text);
        const detail = said[t.id];
        if (detail) { const dl = layoutText(detail, Infinity, 13, undefined, 400); words.push({ id: t.id + "d", kind: "text", x: t.x + 14, y: t.y + t.h - 14 - dl.h, w: dl.w, h: dl.h, text: detail, size: 13, tone: hue ?? "ink", fine: hue ? { fw: 400, ...o(t.id) } : { text: "n500", fw: 400, ...o(t.id) } } satisfies Text); }
        continue; }
      // a colour of its own (red for what failed, green for what passed) is drawn in the board's own look, so the colour shows
      if (hue && (t.kind === "card" || t.kind === "pill" || t.kind === "chip")) { things.push({ ...base, kind: t.kind === "pill" ? "pill" : "card", text: said[t.id] ?? t.text, size: t.kind === "card" ? 19 : 14, track: t.kind === "card" ? 0.04 : 0.1, fill: "tint", ...(t.kind === "chip" ? { notch: "" } : {}), fine: { text: "n900", w: EDGEW, fw: t.kind === "card" ? 400 : 500 } } satisfies Box); continue; }
      // a meter is read against a limit; a gauge only says how far something has got
      if (t.kind === "meter" || t.kind === "gauge" || t.kind === "bars" || t.kind === "queue") { things.push({ ...base, kind: t.kind === "gauge" ? "meter" : t.kind, text: quiet ? plainly(said[t.id] ?? t.text) : (said[t.id] ?? t.text), value: level[t.id] ?? 0, tone: hue ?? (fig ? "muted" : lit ? "accent" : "muted"), ...(t.kind === "gauge" ? { limit: 1 } : {}) } satisfies Box); continue; }
      if (t.kind === "window" || t.kind === "wave" || t.kind === "rule" || t.kind === "axis" || t.kind === "plot" || t.kind === "gap" || t.kind === "stair" || t.kind === "threshold") {
        // (a threshold's line keeps its words when a beat says something else of the plot)
        const words = t.kind === "threshold" && said[t.id] !== undefined && !said[t.id]!.includes("\n") ? t.text.split("\n").slice(1).join("\n") : "";
        things.push({ ...base, kind: t.kind, text: words ? said[t.id] + "\n" + words : (said[t.id] ?? t.text), tone: hue ?? (lit && !fig ? "accent" : t.kind === "window" || t.kind === "wave" || t.kind === "axis" || t.kind === "plot" || t.kind === "gap" || t.kind === "stair" || t.kind === "threshold" || fig ? "ink" : "muted"), ...(t.kind === "rule" ? {} : { value: level[t.id] ?? 0 }), ...(t.levels ? { levels: t.levels } : {}), ...(t.kind === "threshold" && t.unit ? { unit: t.unit } : {}), ...(t.kind === "rule" && t.reach ? { pad: t.reach } : {}),
          // the things among them are outlined as the cards beside them are; the marks keep a mark's lighter line
          ...(t.kind === "window" ? { fine: { ...(hue ? {} : { line: thin ? (lit ? ("n900" as const) : ("n400" as const)) : line }), w: thin ? 1 : Math.min(2, EDGEW), ...(thin ? { fill: "paper" as const } : { fill: "paper" as const, shadow: true as const }), ...o(t.id) } } : fig ? { fine: { prose: true as const, ...(draft ? { draft: true as const } : {}), ...(hue ? {} : { lamp: "n900" as const }), ...o(t.id) } } : faint.has(t.id) ? { fine: { o: 0.35 } } : {}) } satisfies Box); continue; }
      if (t.kind === "glyph") { // blue only while it works: at rest it is a quiet grey field
        things.push({ ...base, kind: "glyph", text: "", tone: lit || b.busy?.includes(t.id) ? "accent" : "muted", ...(b.busy?.includes(t.id) ? { busy: true as const } : {}) } satisfies Box); continue; }
      if (t.kind === "pill" || t.kind === "chip") { things.push({ ...base, kind: t.kind === "pill" ? "pill" : "card", text: said[t.id] ?? t.text, size: 14, track: 0.1, ...(t.kind === "chip" ? { notch: "" } : {}), fine: { line, w: Math.min(2, EDGEW), fill: "paper", text: lit ? "accent" : "n700", fw: 500, ...o(t.id) } } satisfies Box); continue; }
      if (t.kind === "label") { const words0 = said[t.id] ?? t.text; if (!words0) continue; if (t.prose) { const lp = layoutText(words0, Infinity, 22, undefined, 700, true); words.push({ id: t.id, kind: "text", x: t.x, y: t.y, w: lp.w, h: lp.h, text: words0, size: 22, tone: hue ?? "ink", fine: hue ? { fw: 700, prose: true, ...o(t.id) } : { text: lit ? "accent" : "n900", fw: 700, prose: true, ...o(t.id) } } satisfies Text); continue; }
        if (sys) { const fs = t.size ?? 13, fw = t.bold ? 500 : 400, l = layoutText(words0, Infinity, fs, t.mono ? 0 : undefined, fw); words.push({ id: t.id, kind: "text", x: t.x - (t.anchor === "end" ? l.w : t.anchor === "mid" ? l.w / 2 : 0), y: t.y, w: l.w, h: l.h, text: words0, size: fs, ...(t.mono ? { track: 0 } : {}), ...(t.turn ? { rot: -Math.PI / 2 } : {}), tone: hue ?? "ink", fine: hue ? { fw, ...o(t.id) } : { text: (t.ink as Shade) ?? (t.bold || lit ? W : SOFT), fw, ...o(t.id) } } satisfies Text); continue; }
        const fig = fig0 || !!t.plain, fs = draft ? 11 : 13, l = fig ? layoutText(words0, Infinity, fs, undefined, 400) : layoutText(words0, Infinity, 15, 0.04, 400); words.push({ id: t.id, kind: "text", x: t.x - (t.anchor === "end" ? l.w : t.anchor === "mid" ? l.w / 2 : 0), y: t.y, w: l.w, h: l.h, text: words0, ...(fig ? { size: fs } : { size: 15, track: 0.04 }), ...(t.turn ? { rot: -Math.PI / 2 } : {}), tone: hue ?? "ink", fine: hue ? { fw: 400, ...o(t.id) } : { text: (t.ink as Shade) ?? (lit ? "accent" : "n500"), fw: 400, ...o(t.id) } } satisfies Text); continue; }
      if (t.kind === "boundary") fences.push({ ...base, kind: "boundary", tone: "ink", ...(t.ground === "tint" || t.ground === "solid" ? { fill: t.ground } : {}), ...(t.ground === "hatch" || t.ground === "cross" ? { pattern: t.ground } : {}), text: t.text, size: 15, track: 0.14, pad: 24, fine: { line: "n300", w: Math.min(2, EDGEW), fill: "none", text: "n700", fw: 500, ...o(t.id) } } satisfies Box);
      else if (t.kind === "card") things.push({ ...base, kind: "card", ...(t.dashed ? { line: "dashed" as const } : {}), text: said[t.id] ?? t.text, size: 19, track: 0.04, fine: { line, w: EDGEW, fill: "paper", shadow: true, text: "n900", fw: 400, ...o(t.id) } } satisfies Box);
      else {
        // (a name given a size of its own, a figure that is the news, stands in a header band twice as tall)
        const head = t.size ? Math.max(HEAD[t.kind], Math.round(t.size * 2)) : HEAD[t.kind], pad = PAD[t.kind], panel = t.kind === "panel";
        // a mark drawn inside it (a gauge, a queue…) goes under the detail line, which then stands at the top of the body
        // a colour of its own (red, green, amber) is the thing's outline, lamp and detail: the reference blue would hide it
        things.push({ ...base, kind: t.kind, text: t.text, size: t.size ?? 15, track: t.size ? 0.02 : 0.16, head, pad, fine: hue
          ? { w: EDGEW, fill: "paper", shadow: true, text: "n900", fw: panel ? 500 : 400, ...o(t.id) }
          : { line, w: EDGEW, fill: "paper", shadow: true, text: lit && panel ? "accent" : "n700", fw: panel ? 500 : 400, ...(panel ? { lamp: lit ? ("accent" as const) : ("n400" as const) } : {}), ...o(t.id) } } satisfies Box);
        const detail = said[t.id];
        if (detail) {
          const l = layoutText(detail, Infinity, 15, 0.04, 400);
          words.push({ id: t.id + "d", kind: "text", x: t.x + pad, y: holdsMark(t) ? t.y + head + 14 : t.y + head + (t.h - head) / 2 - l.h / 2, w: l.w, h: l.h, text: detail, size: 15, track: 0.04, tone: hue ?? "ink", fine: hue ? { fw: 400, ...o(t.id) } : { text: lit ? "accent" : "n500", fw: 400, ...o(t.id) } } satisfies Text);
        }
      }
    }
    const placed = (id: string) => { const t = d.things.find((x) => x.id === id); if (!t) return undefined; const [x, y] = stand[id] ?? [t.x, t.y], [w, h] = span[id] ?? [t.w, t.h]; if (t.kind !== "label") return { x, y, w, h }; const l = layoutText(said[id] ?? t.text, Infinity, draft ? 11 : fig ? 13 : 15, fig ? undefined : 0.04, 400); return { x, y, w: l.w, h: l.h }; };
    const end = (s: Spot) => (freeEnd(s) ? { x: s[0], y: s[1] } : { x: 0, y: 0, bind: { id: s[0], ax: s[1] as number, ay: s[2] as number } });
    // (an end on a ring buffer's head or tail, "sq#tail", is on that pointer where it stands in this moment)
    const ringEnd = (p: Spot): Spot => {
      const hash = freeEnd(p) ? -1 : p[0].lastIndexOf("#"), which = hash < 0 ? "" : (p[0] as string).slice(hash + 1);
      const t = which === "head" || which === "tail" ? d.things.find((u) => u.id === (p[0] as string).slice(0, hash) && u.kind === "ringbuf") : undefined;
      if (!t) return p;
      const [x, y] = stand[t.id] ?? [t.x, t.y], [w, h] = span[t.id] ?? [t.w, t.h], q = ringSpot({ x, y, w, h, ...(t.span ? { span: t.span } : {}), ...(cuts[t.id] ?? t.levels ? { levels: cuts[t.id] ?? t.levels } : {}) }, which as "head" | "tail");
      return [t.id, (q.x - x) / w, (q.y - y) / h];
    };
    // (an end on a slot of a call stack, "st#newPoint.p", is on that slot; when its frame has been popped the wire dangles: red, its head open)
    const stackEnd = (p: Spot): [Spot, boolean] => {
      const hash = freeEnd(p) ? -1 : p[0].lastIndexOf("#"), t = hash < 0 ? undefined : d.things.find((u) => u.id === (p[0] as string).slice(0, hash) && u.kind === "callstack");
      if (!t) return [p, false];
      const [x, y] = stand[t.id] ?? [t.x, t.y], [w, h] = span[t.id] ?? [t.w, t.h], lv = cuts[t.id] ?? t.levels, q = stackSpot({ x, y, w, h, text: said[t.id] ?? t.text, ...(lv ? { levels: lv } : {}) }, (p[0] as string).slice(hash + 1), p[1] as number, p[2] as number);
      if (!q) return [[t.id, p[1] as number, p[2] as number], false];
      return [[t.id, (q.x - x) / w, (q.y - y) / h], q.frame >= Math.round(level[t.id] ?? 0)];
    };
    for (const w1 of d.links) {
      const [a0, da] = stackEnd(w1.a), [b0, db] = stackEnd(w1.b), dangles = da || db;
      const a = ringEnd(a0), b2 = ringEnd(b0), w0 = a === w1.a && b2 === w1.b && !dangles ? w1 : { ...w1, a, b: b2, ...(dangles ? { tone: "red" as const } : {}) };
      let w = w0, free: [number, number, number, number] | undefined;
      if (hide.has(w.id) || (!freeEnd(w.a) && hide.has(w.a[0])) || (!freeEnd(w.b) && hide.has(w.b[0]))) continue;
      if (w.leader) {
        // a leader leaves its words level, a little clear of them, and turns once to land on the very point it names (not on the outline around it)
        const A = freeEnd(w.a) ? undefined : placed(w.a[0]), B = freeEnd(w.b) ? undefined : placed(w.b[0]);
        if (A && B) {
          const bx = B.x + (w.b[1] as number) * B.w, by = B.y + (w.b[2] as number) * B.h, left = bx < A.x + A.w / 2, ay = A.y + A.h / 2;
          // (straight up or down when the point is over or under the words themselves)
          if (bx >= A.x - 6 && bx <= A.x + A.w + 6) free = [bx, by < A.y ? A.y - 4 : A.y + A.h + 4, bx, by];
          else { free = [left ? A.x - 6 : A.x + A.w + 6, ay, bx, by]; if (!w.via && Math.abs(by - ay) > 2) w = { ...w, via: [[bx, ay]] }; }
        }
      }
      // in a story that moves, a wire shows which way it goes when something goes along it; at rest it is a plain line
      const moving = d.beats.length > 1;
      const run = b.back?.includes(w.id) ? ("back" as const) : b.run?.includes(w.id) ? ("pour" as const) : b.refuse?.includes(w.id) ? ("squash" as const) : b.lost?.includes(w.id) ? ("fizzle" as const) : undefined;
      (free ? leads : wires).push({ id: clash.has(w.id) ? w.id + "~wire" : w.id, kind: "arrow", a: free ? { x: free[0], y: free[1] } : end(w.a), b: free ? { x: free[2], y: free[3] } : end(w.b), text: said[w.id] ?? w.text ?? "", route: w.curve ? "curve" : w.elbow ? "elbow" : "straight", ...(w.bow ? { bow: { x: w.bow[0], y: w.bow[1] } } : {}), heads: w.plain || w.leader || (moving && !run && !dangles) ? "none" : w.both ? "both" : "end", tone: w.tone ?? "muted", ...(dangles && !w.plain ? { dangling: true as const } : {}),
        ...((said[w.id] ?? w.text) ? (sys ? { size: 13, track: 0 } : quiet ? { size: 12, track: 0.02 } : thin ? { size: 12, track: 0.03 } : { size: 15, track: 0.04 }) : {}), ...(run ? { run } : {}), ...(severed.has(w.id) ? { cut: 1 } : {}), ...(w.dotted || (quiet && w.dashed) ? { line: "dotted" as const } : w.dashed ? { line: "dashed" as const } : {}), ...(w.ported ? { ports: "both" as const } : {}), ...(w.pill && w.text ? { pill: true as const } : {}), ...(w.via ? { via: w.via.map(([x, y]) => ({ x, y })), bend: w.leader ? 0 : (w.bend ?? 12) } : {}),
        fine: quiet ? { ...(w.tone ? {} : { line: "n700" as const, text: "n700" as const }), fo: w.tone ? 0.14 : 0, w: 1, fw: 400, crisp: true, ...(w.text ? { r: 99 } : {}), ...(w.ported ? { port: "n300" as const, lamp: "accent" as const } : {}), ...(w.plain ? {} : { head: 7 }), ...o(w.id) } : sys ? { line: (w.ink as Shade) ?? (w.tone === "red" ? RED : w.tone === "green" ? GREEN : w.dotted ? DOT : W), text: w.tone === "red" ? REDW : W, fo: w.tone === "red" ? 0.2 : 0, w: 1, fw: 400, crisp: true, ...(w.text ? { r: w.tone ? 8 : 99 } : {}), ...(w.plain ? {} : { head: 6 }), ...o(w.id) } : { ...(w.ink ? { line: w.ink as Shade, text: "n700" as const } : w.tone ? {} : { line: draft && !w.leader && !w.dashed ? ("n700" as const) : thin ? ("n400" as const) : ("n300" as const), text: "n700" as const }), w: w.leader ? 0.75 : thin ? 1 : WIRE, ...(w.leader ? { dot: true as const } : {}), round: true, fw: thin ? 500 : 400, ...(thin && w.text ? { r: 99 } : {}), ...(w.ported ? { port: "n300" as const, lamp: "accent" as const } : {}), ...(w.plain || w.leader ? {} : { head: thin ? 6 : 12 }), ...o(w.id) } } satisfies Arrow);
    }
    if (riding.length) {
      // a rider stands on its wire's path as it runs in this moment
      const doc: Doc = { shapes: Object.fromEntries([...fences, ...wires, ...things].map((s) => [s.id, s])), order: [] };
      for (const { t, tone, away } of riding) {
        const w = wires.find((s) => s.id === t.rides || s.id === t.rides + "~wire");
        if (!w || w.kind !== "arrow") continue;
        const pts = arrowPath(doc, w), P = 16, x0 = Math.min(...pts.map((p) => p.x)) - P, y0 = Math.min(...pts.map((p) => p.y)) - P, W = Math.max(...pts.map((p) => p.x)) + P - x0, H = Math.max(...pts.map((p) => p.y)) + P - y0;
        rode.push({ id: t.id, kind: "rider", x: x0, y: y0, w: W, h: H, fill: "none", text: said[t.id] ?? t.text, tone, value: level[t.id] ?? 0, levels: [pts.length, ...pts.flatMap((p) => [(p.x - x0) / W, (p.y - y0) / H])], ...(away ? { away: true as const } : {}), fine: { ...o(t.id) } } satisfies Box);
      }
    }
    for (const t of looping) {
      // a loop stands its gap clear of both things it goes round, wherever they stand in this moment, in its wires' ink and weight
      const [p, q] = (t.loops ?? []).map((id) => round[id]);
      if (!p || !q) continue;
      const g = t.levels?.[0] ?? 24, x0 = Math.min(p.x, q.x) - g, y0 = Math.min(p.y, q.y) - g, x1 = Math.max(p.x + p.w, q.x + q.w) + g, y1 = Math.max(p.y + p.h, q.y + q.h) + g, hue = b.tone?.[t.id] ?? t.colour;
      const ink: Shade = quiet || draft ? "n700" : sys ? W : thin ? "n400" : "n300", fine = quiet || sys;
      rings.push({ id: t.id, kind: "loop", x: x0, y: y0, w: x1 - x0, h: y1 - y0, fill: "none", text: said[t.id] ?? t.text, tone: hue ?? "ink", value: level[t.id] ?? 1, levels: [g], ...(b.busy?.includes(t.id) || b.run?.includes(t.id) ? { busy: true as const } : {}), fine: { ...(hue ? {} : { line: ink }), w: fine || thin ? 1 : WIRE, head: fine || thin ? 7 : 13, ...(fine ? { crisp: true as const } : {}), ...o(t.id) } } satisfies Box);
    }
    for (const { t, away } of stapling) {
      // a staple stands on the seam between the two things it clips, wherever they stand in this moment: the gap between their facing edges, as long as the edge they share.
      // They are one under the other or side by side, whichever way they stand further apart. One not there yet is kept away and open, so it closes as it comes in
      const [p, q] = (t.staples ?? []).map((id) => round[id]);
      if (!p || !q) continue;
      const across = Math.max(p.y, q.y) - Math.min(p.y + p.h, q.y + q.h) >= Math.max(p.x, q.x) - Math.min(p.x + p.w, q.x + q.w);
      const [u, v] = across ? (p.y <= q.y ? [p, q] : [q, p]) : p.x <= q.x ? [p, q] : [q, p];
      const l0 = across ? Math.max(u.x, v.x) : Math.max(u.y, v.y), l1 = across ? Math.min(u.x + u.w, v.x + v.w) : Math.min(u.y + u.h, v.y + v.h), e0 = across ? u.y + u.h : u.x + u.w, e1 = across ? v.y : v.x;
      const a0 = Math.min(l0, l1), a1 = Math.max(l0, l1), s0 = Math.min(e0, e1), s1 = Math.max(e0, e1), lv = cuts[t.id] ?? t.levels ?? [12, 0.25, 0.75], hue = b.tone?.[t.id] ?? t.colour;
      const ink: Shade = on.has(t.id) ? "accent" : sys ? W : "n700";
      clips.push({ id: t.id, kind: "staple", ...(across ? { x: a0, y: s0, w: a1 - a0, h: s1 - s0 } : { x: s0, y: a0, w: s1 - s0, h: a1 - a0 }), fill: "none", text: said[t.id] ?? t.text, tone: hue ?? "ink", value: away ? 0 : (level[t.id] ?? 1), levels: [across ? 0 : 1, ...lv], ...(away ? { away: true as const } : {}), fine: { ...(hue ? {} : { line: ink }), w: quiet || thin ? 1.5 : WIRE, ...(quiet || sys ? { crisp: true as const } : {}), ...o(t.id) } } satisfies Box);
    }
    if (draft && d.code) {
      // its code and its name, set under it where a sheet of drawings would set them
      const all = d.things.filter((t) => t.kind !== "rider" && t.kind !== "loop" && t.kind !== "staple"), x = Math.min(...all.map((t) => t.x)), y = Math.max(...all.map((t) => t.y + t.h)) + 44, c = layoutText(d.code, Infinity, 11, 0.04, 400), n = layoutText(d.name, Infinity, 14, undefined, 400, true);
      words.push({ id: "~code", kind: "text", x, y: y + 2, w: c.w, h: c.h, text: d.code, size: 11, track: 0.04, tone: "ink", fine: { text: "n500", fw: 400 } } satisfies Text);
      words.push({ id: "~name", kind: "text", x: x + c.w + 12, y, w: n.w, h: n.h, text: d.name, size: 14, tone: "ink", fine: { text: "n900", fw: 400, prose: true } } satisfies Text);
    }
    return [...fences, ...wires, ...rings, ...things, ...clips, ...rode, ...leads, ...words];
  };
  const moments = frames.map((f, i) => ({ over: f.b.over ?? (i === 0 ? 1400 : 850), hold: f.b.hold ?? (i === frames.length - 1 ? 2400 : 1500), shapes: shapes(f) }));
  const at = d.at ?? moments.length - 1;
  // a story of one moment is a still picture: nothing to play
  if (frames.length <= 1) return stamp({ slug: d.slug, name: d.name, about: d.about, build: () => shapes(frames[0]!) });
  return stamp({ slug: d.slug, name: d.name, about: d.about, build: () => shapes(frames[at]!), moments: () => ({ at, moments: frames.map((f, i) => ({ ...moments[i]!, shapes: shapes(f) })) }) });
}
