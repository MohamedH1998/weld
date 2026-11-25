// template: ask  (main mark: junction)
// Copy this file to src/canvas/trial/<slug>.ts and start from it: change the slug, the names, the words and the beats to your subject.
// For one party asking a chain of places in turn until one has the answer (a name lookup, caches checked level by level, a fallback
// chain): it asks the first, hears "not here" or "ask the next", asks the next, and so on; then keeps the answer, so the next ask stops early.
// Keep: the asker as a panel whose detail says what it is doing, the places as a column of cards, one wire out through a junction,
// each ask and its answer in moments of their own. Change how many places there are (two to four) and what each says back.
import { story } from "../story";
import { card, junction, panel, wire } from "../mk";

export const TRIAL = story({
  slug: "template-ask",
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
