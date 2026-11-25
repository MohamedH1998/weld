// template: layouts  (main mark: segments)
// Copy this file to src/canvas/trial/<slug>.ts and start from it: change the slug, the words and the beats to your subject.
// For the same things kept in two different orders, where the order decides the cost: in time order or grouped, rows or
// columns, one queue or many. Two strips of the same parts, one above the other, each in its own order, its name over it. What is read
// or touched is a light that slides along the strip (set its level from the first part to the last in one beat: it sweeps),
// so the reader sees one sweep cover every part and the other only the few that are needed. The caption counts.
// If the parts' sizes are the story, use bands; if one whole is cut into named parts, use strip.
import { story } from "../story";
import { caption, label, segments } from "../mk";

// nine log lines from three users: kept in time order (the users take turns), or grouped by user; a name under the middle of each group
const ONE = [1, 1, 1, 1, 1, 1, 1, 1, 1];
const BY_TIME = ["ana", "ben", "cy", "ana", "ben  10:01", "cy", "ana", "ben", "cy"];
const BY_USER = ["ana", "ana  ana's", "ana", "ben", "ben  ben's", "ben", "cy", "cy  cy's", "cy"];

export const TRIAL = story({
  slug: "template-layouts", name: "One user's log: in time order or grouped", about: "Nine log lines from three users, kept in time order or grouped by user: reading Ben's lines touches all nine one way, three the other.",
  things: [
    label("tn", 0, -28, "KEPT IN TIME ORDER"), segments("time", 0, 0, 720, ONE, BY_TIME, 0),
    label("un", 0, 132, "GROUPED BY USER"), segments("user", 0, 160, 720, ONE, BY_USER, 0),
    caption("c", 0, 290, "The same nine lines, kept two ways."),
  ],
  links: [],
  beats: [
    {},
    { set: { time: 1 }, say: { c: "In time order: Ben's lines are spread out, so reading starts at the first." } },
    { set: { time: 9 }, over: 2400, say: { c: "Every line is read to find his three: nine reads." } },
    { set: { time: 0, user: 4 }, say: { c: "Grouped by user: Ben's lines sit together." } },
    { set: { user: 6 }, over: 1200, say: { c: "Three reads, and nothing else." }, hold: 2400 },
  ],
});

