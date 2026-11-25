// r21a1 in the board's own notched look.
// template: handoff  (main mark: panel)
// shape: one lookup question leaves the resolver and comes back with an address; a second lookup is answered from the cache
// nearest: r20a1 (borrow: a resolver panel asking root, then .com, then the site's name server, answers back in its own moment)
// sentence: A browser asks its resolver for api.shop.com; the resolver misses its cache, asks the root, then .com, then shop.com's server, keeps the address, and a second lookup is answered straight from the cache.
import { story } from "../story";
import { card, junction, panel, wire } from "../mk";

export const TRIAL = story({
  slug: "r21a3",
  name: "A lookup asks down the name tree once, then the cache answers",
  about: "A browser asks its resolver for api.shop.com. The resolver misses its cache, asks the root, then the .com server, then shop.com's own name server, gets the address and keeps it. A second lookup for the same name is answered straight from the cache.",
  things: [
    card("browser", 0, 110, "Browser", 160, 56),
    panel("resolver", 340, 86, "Resolver", "cache: empty", 240, 104),
    card("root", 740, 0, "Root", 200, 56),
    card("com", 740, 110, ".com server", 200, 56),
    card("shop", 740, 220, "shop.com server", 200, 56),
    junction("j", 660, 138),
  ],
  links: [
    wire("ask", "browser.r", "resolver.l", { text: "api.shop.com?" }),
    // one way out of the resolver, through its notch, branching to each server
    wire("out", "resolver.r", "j.l", { plain: true }),
    wire("toRoot", "j.r", "root.l", { elbow: true }),
    wire("toCom", "j.r", "com.l"),
    wire("toShop", "j.r", "shop.l", { elbow: true }),
  ],
  beats: [
    { on: ["browser"], run: ["ask"] },
    { on: ["resolver"], say: { resolver: "cache miss: asking the root" }, run: ["toRoot", "out"], hold: 900 },
    { on: ["root"], back: ["toRoot", "out"], say: { resolver: "root says: ask .com" } },
    { on: ["resolver"], run: ["toCom", "out"], say: { resolver: "asking the .com server" } },
    { on: ["com"], back: ["toCom", "out"], say: { resolver: ".com says: ask shop.com" } },
    { on: ["resolver"], run: ["toShop", "out"], say: { resolver: "asking shop.com's server" } },
    { on: ["shop"], back: ["toShop", "out"], say: { resolver: "got 203.0.113.7: cached" } },
    { on: ["resolver"], back: ["ask"], say: { resolver: "cached: api.shop.com = 203.0.113.7" }, hold: 1800 },
    { on: ["browser"], run: ["ask"], faint: ["root", "com", "shop", "toRoot", "toCom", "toShop", "out", "j"], say: { resolver: "second lookup: cache holds it" } },
    { on: ["resolver"], back: ["ask"], faint: ["root", "com", "shop", "toRoot", "toCom", "toShop", "out", "j"], say: { resolver: "cache hit: answered here" }, hold: 2400 },
  ],
});
