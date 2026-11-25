// template: periods  (main mark: segments)
// Copy this file to src/canvas/trial/<slug>.ts and start from it: change the slug, the words, the sizes and the beats to your subject.
// For when one thing's own time is the story: it is in one state for a while, then another, then it ends (a cache entry's
// life, a lease, a ticket, a retry's waits). One strip, each part a period as wide as it lasts, its words "how long  what
// it is". Time passing is the light sliding along the strip (set its level a little further each beat); the caption says
// what happens to someone who arrives at that point. The last part can be what comes after it ends. No cards or wires.
import { story } from "../story";
import { caption, label, segments } from "../mk";

// each period as wide as it lasts (minutes); the last is what comes after
const SIZES = [120, 15, 45];
const NAMES = ["2 h  paid", "15 min  grace", "after  fined"];

export const TRIAL = story({
  slug: "template-periods", name: "A parking ticket runs out", about: "Two hours paid, then fifteen minutes' grace, then a fine for anyone still parked.",
  things: [label("n", 0, -28, "ONE TICKET"), segments("t", 0, 0, 720, SIZES, NAMES, 0), caption("c", 0, 110, "Bought at 9:00.")],
  links: [],
  beats: [
    {},
    { set: { t: 1 }, say: { c: "Until 11:00 it is paid: park as long as you like." } },
    { set: { t: 1.9 }, over: 1600, say: { c: "10:55: still paid." } },
    { set: { t: 2 }, say: { c: "11:00 to 11:15: grace. No fine yet." } },
    { set: { t: 3 }, say: { c: "After 11:15, a car still there is fined." }, hold: 2400 },
  ],
});
