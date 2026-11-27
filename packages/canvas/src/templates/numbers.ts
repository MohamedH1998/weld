// template: numbers  (main mark: stat)
// For findings: what the data says, as the three or four numbers that matter, each large, with what it counts under it and, where it is a share, a bar of its whole.
// Copy this file to src/canvas/trial/<slug>.ts and start from it: change the slug, the words, the values and the beats to your subject.
// Keep the picture: one row of stats, the finding that matters most lit (`on`); the caption says what they add up to. A share over time is the `curve` template; shares of one whole, `bands`.
import { story } from "../story";
import { caption, stat } from "../mk";

export const TRIAL = story({
    slug: "template-numbers", name: "How support is answered today", about: "Four numbers from 18 months of support tickets, the one that matters most lit.",
    things: [...stat("s1", 0, 0, "6,899", "tickets in 18 months"), ...stat("s2", 290, 0, "3", "people answer them all"), ...stat("s3", 580, 0, "71%", "answered after a day", 0.71), ...stat("s4", 870, 0, "4%", "ever reopened", 0.04),
      caption("c", 0, 180, "Late, in batches, by three people: the new help desk has to answer faster, not just look better.")],
    links: [],
    beats: [{ on: ["s3", "s3-bar"] }],
  });
