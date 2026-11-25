// The five pictures in the board's notched look, each as three different ideas.
// "a" is the picture as first drawn, now notched; "b" and "c" are other ways to show the same relationship.
import { story } from "./story";
import type { StampDef } from "./stamps";
import { caption, card, chip, label, panel, plot, segments, wire, zone } from "./mk";



export const NOTCHED: StampDef[] = [
  story({
    slug: "nt-ring-c", name: "The ring, unrolled", about: "The circle cut open into a strip: 0 to 360 degrees, servers own the stretch up to them.",
    // D is there from the start with no width: when it joins it grows out of the front of B's stretch, and nothing else moves
    things: [segments("s", 0, 0, 720, [20, 0, 120, 110, 110], ["A", "D", "B", "C", "A again (wraps)"], 0), caption("c", 0, 100, "Keys hash to points on a circle, cut open here. Each server owns the stretch before it.")],
    links: [],
    beats: [{}, { set: { s: 3 }, say: { c: "Every key in this stretch is stored on B." } },
      { cut: { s: [20, 85, 35, 110, 110] }, set: { s: 2 }, say: { c: "Server D joins and takes the front of B's stretch: only those keys move, from B to D." }, hold: 1800 },
      { set: { s: 0 }, say: { c: "Everything else stays where it was: A and C, and the rest of B." }, hold: 2400 }],
  }),

  story({
    slug: "nt-tree-b", name: "Names inside names", about: "The same hierarchy as frames: shop.com sits inside .com, which sits inside the root.",
    things: [zone("root", 0, 0, 700, 300, "ROOT  ."), zone("com", 30, 50, 420, 220, ".COM"), zone("org", 480, 50, 190, 220, ".ORG"),
      card("shop", 60, 110, "shop.com", 170, 60), card("blog", 250, 110, "blog.com", 170, 60), chip("ans", 60, 190, "203.0.113.7", 170), caption("c", 0, 330, "The root knows who runs .com; .com knows who runs shop.com; shop.com knows the answer.")],
    links: [],
    beats: [{ on: ["shop", "ans"] }],
  }),
  story({
    slug: "nt-spans-b", name: "Three calls, end to end or stacked", about: "Each call a bar as long as it takes: end to end in a row, stacked when started together.",
    // 1 ms = 1 px: in a row the three sit end to end; at once they slide to the start and stack
    things: [segments("p", 0, 0, 200, [1], ["200 ms  Profile"], 0), segments("o", 200, 0, 300, [1], ["300 ms  Orders"], 0), segments("r", 500, 0, 200, [1], ["200 ms  Reviews"], 0), caption("c", 0, 290, "One after another: 700 ms.")],
    links: [],
    beats: [{ set: { p: 1 } }, { set: { p: 0, o: 1 } }, { set: { o: 0, r: 1 }, hold: 1800 },
      { at: { o: [0, 90], r: [0, 180] }, set: { p: 1, o: 1, r: 1 }, say: { c: "Started together, stacked: done in 300 ms, when the longest is." }, hold: 2400 }],
  }),
  story({
    slug: "nt-tank-b", name: "A backlog between two rates", about: "Arrivals on the left, the workers on the right, the backlog a queue between them.",
    things: [panel("in", 0, 0, "ARRIVALS", "120 a second", 220, 104), panel("q", 300, 0, "BACKLOG", "20 more each second", 240, 104), panel("out", 620, 0, "WORKERS", "100 a second", 220, 104)],
    links: [wire("a", "in.r", "q.l"), wire("b", "q.r", "out.l")],
    beats: [{ run: ["a", "b"], on: ["q"] }, { run: ["a", "b"], say: { q: "600 waiting" } }, { refuse: ["a"], tone: { q: "red" }, say: { q: "full: turning work away" } },
      { run: ["a", "b"], say: { in: "80 a second", q: "draining" } }, { run: ["b"], say: { q: "300 waiting" }, hold: 2400 }],
  }),

  story({
    slug: "nt-line-b", name: "How long requests take, as bars", about: "Requests counted by how long they took: a tall bar of fast ones and a long thin tail.",
    things: [plot("h", 0, 0, "Requests", [0.2, 0.9, 1, 0.7, 0.4, 0.2, 0.1, 0.06, 0.04, 0.03, 0.02, 0.03], 1, 600, 200), label("x", 470, 220, "0 to 1 s"), caption("c", 0, 260, "Most are fast: the median is 120 ms.")],
    links: [],
    beats: [{ set: { h: 0.25 } }, { set: { h: 0.5 }, say: { c: "Nine in ten are under 300 ms." } }, { set: { h: 1 }, tone: { h: "red" }, say: { c: "The tail: one in a hundred takes 860 ms." }, hold: 2400 }],
  }),
  story({
    slug: "nt-line-c", name: "Percentiles as bands", about: "The second split into bands by share of requests: a wide band of fast ones, a thin sliver at the end.",
    things: [segments("s", 0, 0, 720, [12, 18, 56, 14], ["50%  ≤120 ms", "40%  ≤300 ms", "9%  ≤860 ms", "1%  slower"], 0), caption("c", 0, 100, "Half are done by 120 ms.")],
    links: [],
    beats: [{ set: { s: 1 } }, { set: { s: 2 }, say: { c: "Nine in ten by 300 ms." } }, { set: { s: 3 }, say: { c: "Then a long stretch for the last few." } }, { set: { s: 4 }, tone: { s: "red" }, say: { c: "p99: the one users notice." }, hold: 2400 }],
  }),
];

