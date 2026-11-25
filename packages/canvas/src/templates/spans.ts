// template: spans  (main mark: rule)
// Copy this file to src/canvas/trial/<slug>.ts and start from it: change the slug, the words, the values and the beats to your subject.
// Keep the picture: its main mark stays the largest thing; add at most two cards or panels; no wires unless it already has them.
import { story } from "../story";
import { guide, label, later, rule } from "../mk";

export const TRIAL = story({
    slug: "template-spans", name: "Three calls in a row, or all at once", about: "Done one after another, three calls take the sum of their times; started together, they take as long as the slowest.",
    // 1 ms = 0.7 px: profile 200 ms, orders 300 ms, reviews 200 ms
    things: [label("n1", -20, 4, "Profile"), label("n2", -20, 64, "Orders"), label("n3", -20, 124, "Reviews"),
      later(rule("t1", 0, 0, "200 ms", 140)), later(rule("t2", 140, 60, "300 ms", 210)), later(rule("t3", 350, 120, "200 ms", 140)),
      later(rule("tot", 0, 196, "700 ms in all", 490)), guide("start", 0, -20, 0, 240)].map((t) => (t.id.startsWith("n") ? { ...t, anchor: "end" as const } : t)),
    links: [],
    beats: [{ show: ["t1"], on: ["t1"] }, { show: ["t2"], on: ["t2"] }, { show: ["t3"], on: ["t3"] }, { show: ["tot"], on: ["tot"], hold: 1800 },
      { at: { t2: [0, 60], t3: [0, 120] }, size: { tot: [210, 16] }, say: { tot: "300 ms: the slowest of the three" }, on: ["t2", "tot"], hold: 2400 }],
  });
