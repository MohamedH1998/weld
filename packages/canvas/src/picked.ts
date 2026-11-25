// Picked from design labs, and accepted.
import { story } from "./story";
import type { StampDef } from "./stamps";
import { activity, guide, label, panel, wire } from "./mk";

// from the lanes lab (S): workers as notched lanes, 0 to 100 ms across 600 px; each hand-over a wire between two lanes at its instant
const W = 660, ms = (t: number) => t * 6, along = (t: number) => ((20 + ms(t)) / W).toFixed(4);
export const PICKED: StampDef[] = [
  story({
    slug: "lanes-handover", name: "The page hands its work over", about: "Three notched lanes; the work hands over twice, each hand-over a wire at its instant.",
    things: [panel("l1", 0, 0, "MAIN THREAD", "", W, 100), { ...activity("a1", 20, 66, 600, [0, 0.24, 0.6, 0.84]), value: 0 }, panel("l2", 0, 170, "NETWORK", "", W, 100), { ...activity("a2", 20, 236, 600, [0.24, 0.6]), value: 0 },
      panel("l3", 0, 340, "GPU", "", W, 100), { ...activity("a3", 20, 406, 600, [0.84, 1]), value: 0 },
      // the moment a reader notices, a guide drawn over the lanes so it stays on top of their frames
      guide("vis", 20 + ms(100), -18, 0, 474, "", true), { ...label("visn", 20 + ms(100), -44, "Page visible"), anchor: "mid" }],
    links: [wire("req", `l1.b@${along(24)}`, `l2.t@${along(24)}`, { text: "GET /data" }), wire("res", `l2.t@${along(60)}`, `l1.b@${along(60)}`, { text: "200" }), wire("go", `l1.b@${along(84)}`, `l2.t@${along(84)}`, { plain: true }), wire("draw", `l2.b@${along(84)}`, `l3.t@${along(84)}`, { text: "draw", plain: true })],
    beats: [
      { set: { a1: 0.24, a2: 0.24, a3: 0.24 }, over: 900 },
      { set: { a1: 0.6, a2: 0.6, a3: 0.6 }, over: 1200, run: ["req"] },
      { set: { a1: 0.84, a2: 0.84, a3: 0.84 }, over: 900, run: ["res"] },
      { set: { a1: 1, a2: 1, a3: 1 }, over: 700, run: ["go", "draw"], hold: 1800 },
    ],
  }),
];
