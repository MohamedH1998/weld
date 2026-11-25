// template: bands  (main mark: segments)
// For shares of a whole by size: percentiles, where time goes, a budget.
// Copy this file to src/canvas/trial/<slug>.ts and start from it: change the slug, the words, the values and the beats to your subject.
// Keep the picture: its main mark stays the largest thing; add at most two cards or panels; no wires unless it already has them.
import { story } from "../story";
import { caption, segments } from "../mk";

export const TRIAL = story({
    slug: "template-bands", name: "Percentiles as bands", about: "The second split into bands by share of requests: a wide band of fast ones, a thin sliver at the end.",
    things: [segments("s", 0, 0, 720, [12, 18, 56, 14], ["50%  ≤120 ms", "40%  ≤300 ms", "9%  ≤860 ms", "1%  slower"], 0), caption("c", 0, 100, "Half are done by 120 ms.")],
    links: [],
    beats: [{ set: { s: 1 } }, { set: { s: 2 }, say: { c: "Nine in ten by 300 ms." } }, { set: { s: 3 }, say: { c: "Then a long stretch for the last few." } }, { set: { s: 4 }, tone: { s: "red" }, say: { c: "p99: the one users notice." }, hold: 2400 }],
  });
