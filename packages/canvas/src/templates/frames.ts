// template: frames  (main mark: zone)
// For names inside names, things inside things: DNS, folders, scopes, networks (a still picture: one moment).
// Copy this file to src/canvas/trial/<slug>.ts and start from it: change the slug, the words, the values and the beats to your subject.
// Keep the picture: its main mark stays the largest thing; add at most two cards or panels; no wires unless it already has them.
import { story } from "../story";
import { caption, card, chip, zone } from "../mk";

export const TRIAL = story({
    slug: "template-frames", name: "Names inside names", about: "The same hierarchy as frames: shop.com sits inside .com, which sits inside the root.",
    things: [zone("root", 0, 0, 700, 300, "ROOT  ."), zone("com", 30, 50, 420, 220, ".COM"), zone("org", 480, 50, 190, 220, ".ORG"),
      card("shop", 60, 110, "shop.com", 170, 60), card("blog", 250, 110, "blog.com", 170, 60), chip("ans", 60, 190, "203.0.113.7", 170), caption("c", 0, 330, "The root knows who runs .com; .com knows who runs shop.com; shop.com knows the answer.")],
    links: [],
    beats: [{ on: ["shop", "ans"] }],
  });
