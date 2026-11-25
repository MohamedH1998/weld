// template: handoff  (main mark: panel)
// Copy this file to src/canvas/trial/<slug>.ts and start from it: change the slug, the words and the beats to your subject.
// For a hand-off: one thing passed along, each stop changing what it holds; or a copy kept in step. A panel per stop, a wire
// for each thing that passes. Parties taking turns, where the order of messages is the story, use turns. If the story is
// about a level, a hierarchy, a wrap-around or a spread of values, use another template.
import { story } from "../story";
import { card, panel, wire } from "../mk";

export const TRIAL = story({
  slug: "template-handoff", name: "An upload becomes a thumbnail", about: "The browser sends a photo; the API stores it; a worker shrinks it; the store keeps both.",
  things: [card("b", 0, 16, "Browser", 170, 72), panel("api", 250, 0, "API", "waiting", 240, 104), panel("w", 570, 0, "RESIZER", "idle", 240, 104), card("s", 890, 16, "Photo store", 190, 72)],
  links: [wire("l1", "b.r", "api.l", { text: "photo.jpg" }), wire("l2", "api.r", "w.l", { text: "job" }), wire("l3", "w.r", "s.l", { text: "thumb.jpg" })],
  beats: [
    { on: ["b"], run: ["l1"], say: { api: "4 MB received" } },
    { on: ["api", "w"], run: ["l2"], say: { api: "stored the original", w: "shrinking to 200 px" } },
    { on: ["w", "s"], run: ["l3"], say: { w: "done" } },
    { on: ["s"], back: ["l1"], say: { api: "201 created" }, hold: 2400 },
  ],
});
