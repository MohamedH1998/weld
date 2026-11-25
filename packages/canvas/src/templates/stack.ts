// template: stack  (main mark: segments)
// For durations to scale, end to end, then stacked when they run at once.
// Copy this file to src/canvas/trial/<slug>.ts and start from it: change the slug, the words, the values and the beats to your subject.
// Keep the picture: its main mark stays the largest thing; add at most two cards or panels; no wires unless it already has them.
import { story } from "../story";
import { caption, segments } from "../mk";

export const TRIAL = story({
    slug: "template-stack", name: "Three calls, end to end or stacked", about: "Each call a bar as long as it takes: end to end in a row, stacked when started together.",
    // 1 ms = 1 px: in a row the three sit end to end; at once they slide to the start and stack
    things: [segments("p", 0, 0, 200, [1], ["200 ms  Profile"], 0), segments("o", 200, 0, 300, [1], ["300 ms  Orders"], 0), segments("r", 500, 0, 200, [1], ["200 ms  Reviews"], 0), caption("c", 0, 290, "One after another: 700 ms.")],
    links: [],
    beats: [{ set: { p: 1 } }, { set: { p: 0, o: 1 } }, { set: { o: 0, r: 1 }, hold: 1800 },
      { at: { o: [0, 90], r: [0, 180] }, set: { p: 1, o: 1, r: 1 }, say: { c: "Started together, stacked: done in 300 ms, when the longest is." }, hold: 2400 }],
  });
