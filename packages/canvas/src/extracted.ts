// Patterns taken from the accepted diagrams: the arrangements that recur across the catalogue, each at its smallest,
// so they can be put down from the library and grown. Each names the diagrams it was taken from.
import { story } from "./story";
import type { StampDef } from "./stamps";
import { activity, card, chip, gauge, handover, holding, junction, lane, lifeline, message, moment, panel, pill, rule, segments, wire, zone } from "./mk";

export const EXTRACTED: StampDef[] = [
  // from r26n, r26p: parties along the top, a line down from each, each message a row lower than the last
  story({
    slug: "turns", name: "Turns", about: "Two parties taking turns: each message a row lower, staying once sent.",
    things: [panel("a", 0, 0, "CLIENT", "asks", 200, 104), panel("b", 320, 0, "SERVER", "answers", 200, 104)],
    links: [lifeline("la", "a", 100, 330), lifeline("lb", "b", 420, 330), message("m1", 100, 420, 160, "request"), message("m2", 420, 100, 224, "response")],
    beats: [{ on: ["a"], show: ["m1"], run: ["m1"] }, { on: ["b"], show: ["m2"], run: ["m2"], hold: 1800 }],
  }),
  // from r27b, r27d, nt-line-c, bt-url, r25f: a whole in named parts, a light that sweeps along it
  story({
    slug: "strip", name: "Strip", about: "A whole in named parts, each as wide as its share; a light sweeps what is read.",
    things: [segments("s", 0, 0, 520, [3, 2, 1], ["fresh  60 s", "stale  30 s", "gone"], 0)],
    links: [],
    beats: [{ set: { s: 1 } }, { set: { s: 3 }, over: 1600, hold: 1800 }],
  }),
  // from r21a3: one asker, one way out through a junction, places tried in turn
  story({
    slug: "ask-in-turn", name: "Ask in turn", about: "One asker tries places in turn through a single junction until one has it.",
    things: [panel("q", 0, 66, "ASKER", "asking", 200, 104), card("p1", 340, -10, "First", 150, 56), card("p2", 340, 90, "Second", 150, 56), card("p3", 340, 190, "Third", 150, 56), junction("j", 270, 118)],
    links: [wire("out", "q.r", "j.l", { plain: true }), wire("t1", "j.r", "p1.l", { elbow: true }), wire("t2", "j.r", "p2.l"), wire("t3", "j.r", "p3.l", { elbow: true })],
    beats: [{ on: ["q"], run: ["out", "t1"] }, { refuse: ["t1"], run: ["out"], say: { q: "not there" } }, { on: ["p2"], run: ["out", "t2"] }, { on: ["p2"], back: ["t2", "out"], say: { q: "found" }, hold: 1800 }],
  }),
  // from r25g: a chain that stops at the first failure; what never ran is faint
  story({
    slug: "halt", name: "Halt at failure", about: "Stages in a chain: one passes, the next fails, the rest never run.",
    things: [panel("s1", 0, 0, "BUILD", "built", 180, 104), panel("s2", 250, 0, "TEST", "running", 180, 104), panel("s3", 500, 0, "DEPLOY", "waiting", 180, 104)],
    links: [wire("w1", "s1.r", "s2.l"), wire("w2", "s2.r", "s3.l")],
    beats: [{ tone: { s1: "green" } }, { run: ["w1"], on: ["s2"], tone: { s1: "green" } }, { tone: { s1: "green", s2: "red" }, say: { s2: "1 failed", s3: "never ran" }, faint: ["s3", "w2"], hold: 1800 }],
  }),
  // from r27d: the same parts kept in two orders, the order deciding what is read
  story({
    slug: "two-layouts", name: "Two layouts", about: "The same parts kept in two orders: one read sweeps all of them, the other only a few.",
    things: [segments("x", 0, 0, 480, [1, 1, 1, 1, 1, 1], ["a", "b", "a", "b", "a", "b"], 0), segments("y", 0, 110, 480, [1, 1, 1, 1, 1, 1], ["a", "a", "a", "b", "b", "b"], 0)],
    links: [],
    beats: [{ set: { x: 1 } }, { set: { x: 6 }, over: 1600 }, { set: { x: 0, y: 1 } }, { set: { y: 3 }, over: 900, hold: 1800 }],
  }),
];

// The patterns the guide (GUIDE.md) names, each at its smallest. No window, tank or timeline marks: rows, levels and time
// are segments, gauges and lanes.
// two workers over the same stretch of time: each a hatched lane with ticks where it is busy; the request and the answer cross
// between the lanes at the instants the work changes hands, so the wait has a cause; a moment line where the reader would look
const LANES = (() => {
  const x = (t: number) => 20 + t * 6, m = moment("vis", x(100), 16, 196, "Page visible");
  return story({
    slug: "lanes", name: "Lanes", about: "Two workers over the same time, ticks where each is busy; the request and the answer cross between them where the work hands over.",
    things: [...lane("l1", 0, 0, 660, 80, "MAIN THREAD"), { ...activity("a1", 20, 32, 600, [0, 0.24, 0.6, 1]), value: 0 }, ...lane("l2", 0, 110, 660, 80, "NETWORK"), { ...activity("a2", 20, 142, 600, [0.24, 0.6]), value: 0 }, ...m.things],
    links: [handover("req", x(24), 48, 142, "GET /data"), handover("res", x(60), 142, 48, "200"), ...m.links],
    beats: [{ set: { a1: 0.24, a2: 0.24 }, over: 900 }, { set: { a1: 0.6, a2: 0.6 }, over: 1200, run: ["req"] }, { set: { a1: 1, a2: 1 }, over: 1200, run: ["res"], hold: 1800 }],
  });
})();
export const MOTIFS: StampDef[] = [
  // a named state: every state shown from the start, the current one lit, the way between them run
  story({
    slug: "states", name: "States", about: "A thing's named states in a row, the current one lit; the way between them runs as it moves.",
    things: [pill("closed", 0, 0, "Closed", 140), pill("open", 220, 0, "Open", 140), pill("half", 440, 0, "Half-open", 140)],
    links: [wire("w1", "closed.r", "open.l"), wire("w2", "open.r", "half.l")],
    beats: [{ on: ["closed"] }, { on: ["open"], run: ["w1"] }, { on: ["half"], run: ["w2"], hold: 1800 }],
  }),
  // a request out and its answer back, on the one wire
  story({
    slug: "round-trip", name: "Round trip", about: "A request runs out along a wire and its answer runs back along the same one.",
    things: [card("c", 0, 0, "Client", 170, 64), card("s", 330, 0, "Server", 170, 64)],
    links: [wire("w", "c.r", "s.l", { text: "GET /" })],
    beats: [{ on: ["c"], run: ["w"] }, { on: ["s"], back: ["w"], say: { w: "200 OK" }, hold: 1800 }],
  }),
  LANES,
  // dashed frames per branch, commits inside, a merge crossing between them
  story({
    slug: "branches", name: "Branches", about: "Two tracks of work, each a dashed frame of its own, and the wire where they meet.",
    things: [zone("main", 0, 0, 600, 100, "MAIN"), chip("m1", 30, 36, "a1f"), chip("m2", 250, 36, "c3e"), chip("m3", 470, 36, "merge"),
      zone("feat", 0, 150, 600, 100, "FEATURE"), chip("f1", 140, 186, "b27"), chip("f2", 330, 186, "d90")],
    links: [wire("x1", "m1.r", "m2.l"), wire("x2", "m2.r", "m3.l"), wire("y1", "f1.r", "f2.l"), wire("br", "m1.b", "f1.l", { elbow: true }), wire("mg", "f2.r", "m3.b", { elbow: true })],
    beats: [{ on: ["m1"] }, { on: ["f1", "f2"], run: ["br", "y1"] }, { on: ["m3"], run: ["mg"], hold: 1800 }],
  }),
  // a share sliding from one side to the other
  story({
    slug: "shift", name: "Shift", about: "Two levels side by side: as one falls the other rises, the share sliding between them.",
    things: [gauge("old", 0, 0, "OLD  90%", 0.9, 240), gauge("new", 300, 0, "NEW  10%", 0.1, 240)],
    links: [],
    beats: [{}, { set: { old: 0.5, new: 0.5 }, say: { old: "OLD  50%", new: "NEW  50%" } }, { set: { old: 0, new: 1 }, say: { old: "OLD  0%", new: "NEW  100%" }, hold: 1800 }],
  }),
  // time left shrinking to nothing, then something happens
  story({
    slug: "countdown", name: "Countdown", about: "A panel holding a level that drains; its line says how long is left, and at nothing it acts.",
    things: [...holding(panel("t", 0, 0, "LEASE", "30 s left", 300, 104), gauge("g", 0, 0, "", 1))],
    links: [],
    beats: [{}, { set: { g: 0.4 }, say: { t: "12 s left" } }, { set: { g: 0 }, tone: { t: "red" }, say: { t: "expired: released" }, hold: 1800 }],
  }),
  // beats that keep coming, then stop, and the one listening takes over
  story({
    slug: "heartbeat", name: "Heartbeat", about: "A leader's beats reach a follower; when they stop, the follower takes over.",
    things: [panel("l", 0, 0, "LEADER", "beating", 220, 104), panel("f", 340, 0, "FOLLOWER", "listening", 220, 104)],
    links: [wire("hb", "l.r", "f.l", { text: "heartbeat", dashed: true })],
    beats: [{ run: ["hb"], on: ["l"], say: { f: "last beat: now" } }, { run: ["hb"], on: ["l"], say: { f: "last beat: now (2nd)" } }, { lost: ["hb"], tone: { l: "red" }, say: { l: "silent", f: "last beat: 3 s ago" } }, { on: ["f"], say: { f: "leader now" }, faint: ["l", "hb"], hold: 1800 }],
  }),
  // a measured span walking along a whole in parts
  story({
    slug: "measure", name: "Measure", about: "A whole in its parts with a measure under it that walks from part to part, naming each one's size.",
    things: [segments("s", 0, 0, 600, [12, 50, 38], ["DNS", "server", "download"], 0), rule("r", 0, 76, "120 ms", 72)],
    links: [],
    beats: [{ set: { s: 1 } }, { set: { s: 2 }, at: { r: [72, 76] }, size: { r: [300, 16] }, say: { r: "500 ms" } }, { set: { s: 3 }, at: { r: [372, 76] }, size: { r: [228, 16] }, say: { r: "380 ms" }, hold: 1800 }],
  }),
  // the same thing happening n times, then something else
  story({
    slug: "counting", name: "Counting", about: "The same try refused again and again, the panel counting, until the count runs out.",
    things: [panel("c", 0, 0, "CLIENT", "try 1 of 3", 220, 104), card("s", 340, 20, "Busy server", 190, 64)],
    links: [wire("w", "c.r", "s.l")],
    beats: [{ refuse: ["w"], on: ["c"] }, { refuse: ["w"], say: { c: "try 2 of 3" } }, { refuse: ["w"], say: { c: "try 3 of 3" } }, { tone: { c: "red" }, say: { c: "gave up" }, hold: 1800 }],
  }),
];
