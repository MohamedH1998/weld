// template: rates  (main mark: panel)
// For a backlog between a rate in and a rate out: arrivals, a buffer, workers; refused when full.
// Copy this file to src/canvas/trial/<slug>.ts and start from it: change the slug, the words, the values and the beats to your subject.
// Keep the picture: its main mark stays the largest thing; add at most two cards or panels; no wires unless it already has them.
import { story } from "../story";
import { panel, wire } from "../mk";

export const TRIAL = story({
    slug: "template-rates", name: "A backlog between two rates", about: "Arrivals on the left, the workers on the right, the backlog a queue between them.",
    things: [panel("in", 0, 0, "ARRIVALS", "120 a second", 220, 104), panel("q", 300, 0, "BACKLOG", "20 more each second", 240, 104), panel("out", 620, 0, "WORKERS", "100 a second", 220, 104)],
    links: [wire("a", "in.r", "q.l"), wire("b", "q.r", "out.l")],
    beats: [{ run: ["a", "b"], on: ["q"] }, { run: ["a", "b"], say: { q: "600 waiting" } }, { refuse: ["a"], tone: { q: "red" }, say: { q: "full: turning work away" } },
      { run: ["a", "b"], say: { in: "80 a second", q: "draining" } }, { run: ["b"], say: { q: "300 waiting" }, hold: 2400 }],
  });
