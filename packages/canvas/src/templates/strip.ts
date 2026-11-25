// template: strip  (main mark: segments)
// For ranges and who owns them: hash rings, shards, partitions; one part taking over another's share.
// Copy this file to src/canvas/trial/<slug>.ts and start from it: change the slug, the words, the values and the beats to your subject.
// Keep the picture: its main mark stays the largest thing; add at most two cards or panels; no wires unless it already has them.
import { story } from "../story";
import { caption, segments } from "../mk";

export const TRIAL = story({
    slug: "template-strip", name: "The ring, unrolled", about: "The circle cut open into a strip: 0 to 360 degrees, servers own the stretch up to them.",
    // D is there from the start with no width: when it joins it grows out of the front of B's stretch, and nothing else moves
    things: [segments("s", 0, 0, 720, [20, 0, 120, 110, 110], ["A", "D", "B", "C", "A again (wraps)"], 0), caption("c", 0, 100, "Keys hash to points on a circle, cut open here. Each server owns the stretch before it.")],
    links: [],
    beats: [{}, { set: { s: 3 }, say: { c: "Every key in this stretch is stored on B." } },
      { cut: { s: [20, 85, 35, 110, 110] }, set: { s: 2 }, say: { c: "Server D joins and takes the front of B's stretch: only those keys move, from B to D." }, hold: 1800 },
      { set: { s: 0 }, say: { c: "Everything else stays where it was: A and C, and the rest of B." }, hold: 2400 }],
  });
