// template: map  (main mark: zone)
// For a map of a system or a repo (what it is made of, what sits inside what): each app or package a frame, its parts inside it, and only the few wires that carry data.
// Copy this file to src/canvas/trial/<slug>.ts and start from it: change the slug, the words, the values and the beats to your subject.
// Keep the picture: frames hold the parts; a part is a card, the shared thing (a database, a package everything uses) a panel; at most four wires, each one named.
import { story } from "../story";
import { caption, card, panel, wire, zone } from "../mk";

export const TRIAL = story({
    slug: "template-map", name: "Three apps, one schema", about: "A repo as frames: each app holds its parts, and the one shared database sits under them.",
    things: [zone("repo", 0, 0, 1180, 580, "ACME  ·  ONE REPO, THREE APPS"),
      zone("web", 30, 60, 360, 300, "apps/web  ·  storefront"), zone("api", 420, 60, 360, 300, "apps/api"), zone("job", 810, 60, 340, 300, "apps/worker"),
      card("w1", 60, 120, "Catalogue and cart", 300, 60), card("w2", 60, 200, "Checkout", 300, 60), card("w3", 60, 280, "Order tracking", 300, 60),
      card("a1", 450, 120, "REST and auth", 300, 60), card("a2", 450, 200, "Pricing", 300, 60),
      card("j1", 840, 120, "Emails", 280, 60), card("j2", 840, 200, "Webhooks", 280, 60),
      panel("db", 450, 420, "packages/db", "Postgres · one schema", 300, 110),
      caption("c", 0, 610, "Three apps share one schema; only the API and the worker write to it.")],
    links: [wire("x1", "w1.r", "a1.l", { text: "HTTP" }), wire("x2", "a2.b", "db.t", { text: "reads, writes" }), wire("x3", "j2.b", "db.r", { text: "writes", elbow: true })],
    beats: [{ on: ["db"], hold: 1600 }, { on: ["w1", "a1"], run: ["x1"] }, { on: ["j2", "db"], run: ["x3"], hold: 1800 }],
  });
