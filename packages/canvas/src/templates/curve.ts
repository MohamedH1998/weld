// template: curve  (main mark: plot)
// For a level or count changing over time, or a spread of values: a backlog over a minute, latencies.
// Copy this file to src/canvas/trial/<slug>.ts and start from it: change the slug, the words, the values and the beats to your subject.
// Keep the picture: its main mark stays the largest thing; add at most two cards or panels; no wires unless it already has them.
import { story } from "../story";
import { caption, label, plot } from "../mk";

export const TRIAL = story({
    slug: "template-curve", name: "The backlog, over time", about: "The level drawn as a curve: it climbs while arrivals win, flattens at the cap, falls when they drop.",
    things: [plot("p", 0, 0, "Waiting", [0.1, 0.3, 0.5, 0.7, 0.9, 1, 1, 1, 0.8, 0.6, 0.4, 0.3], 0, 560, 200), label("x", 400, 220, "Seconds"), caption("c", 0, 260, "More arrive than leave: it climbs.")],
    links: [],
    beats: [{ set: { p: 0.3 } }, { set: { p: 0.5 } }, { set: { p: 0.66 }, tone: { p: "red" }, say: { c: "Full: the rest are turned away." } }, { set: { p: 1 }, say: { c: "Arrivals drop: it drains." }, hold: 2400 }],
  });
