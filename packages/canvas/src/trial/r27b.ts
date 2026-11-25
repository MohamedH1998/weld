// shape: Spacing
// template: periods  (main mark: segments)
// nearest: do-lifecycle (a cache entry with an expiry: one thing moving through states, its storage kept while its memory goes)
import { story } from "../story";
import { caption, label, segments } from "../mk";

// each period as wide as it lasts (seconds): fresh 60, stale 30, then gone after 90 (the last part is what comes after)
const SIZES = [60, 30, 30];
const NAMES = ["0 to 60 s  fresh", "60 to 90 s  stale", "after 90 s  gone"];

export const TRIAL = story({
  slug: "r27b", name: "A cached response ages out", about: "Fresh for 60 seconds, stale for 30 more while a fresh copy is fetched, then gone.",
  things: [label("n", 0, -28, "ONE CACHED RESPONSE"), segments("t", 0, 0, 720, SIZES, NAMES, 0), caption("c", 0, 110, "Stored at 0 s.")],
  links: [],
  beats: [
    {},
    { set: { t: 1 }, say: { c: "0 to 60 s: fresh. Served from the cache; the origin is not asked." } },
    { set: { t: 1.9 }, over: 1600, say: { c: "59 s: still fresh." } },
    { set: { t: 2 }, say: { c: "60 to 90 s: stale. Served from the cache at once, while a fresh copy is fetched in the background." } },
    { set: { t: 2.9 }, over: 1600, say: { c: "89 s: still served stale, the fresh copy is on its way." } },
    { set: { t: 3 }, say: { c: "After 90 s the copy is gone. The next request waits for the origin." }, hold: 2400 },
  ],
});
