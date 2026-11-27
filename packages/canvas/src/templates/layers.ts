// template: layers  (main mark: lane)
// For a map of who calls what, top to bottom: people, then apps, then services, then data, each layer a lane and each wire one layer talking to the next.
// Copy this file to src/canvas/trial/<slug>.ts and start from it: change the slug, the words, the values and the beats to your subject.
// Keep the picture: one lane per layer, named on its left; a card per thing in it; wires only go down a layer, never across or past one.
import { story } from "../story";
import { caption, card, lane, wire } from "../mk";

export const TRIAL = story({
    slug: "template-layers", name: "Each layer talks to the one under it", about: "People, apps, services and data as lanes; a webhook reaches the data only through the worker.",
    things: [...lane("L0", 0, 0, 1100, 120, "PEOPLE"), ...lane("L1", 0, 150, 1100, 120, "APPS"), ...lane("L2", 0, 300, 1100, 120, "SERVICES"), ...lane("L3", 0, 450, 1100, 120, "DATA"),
      card("shopper", 200, 30, "Shopper", 240, 60), card("support", 500, 30, "Support", 240, 60), card("merchant", 800, 30, "Merchant", 240, 60),
      card("store", 200, 180, "Storefront", 240, 60), card("desk", 500, 180, "Help desk", 240, 60), card("admin", 800, 180, "Admin", 240, 60),
      card("api", 200, 330, "API", 240, 60), card("search", 500, 330, "Search", 240, 60), card("worker", 800, 330, "Worker", 240, 60),
      card("files", 200, 480, "Object store", 240, 60), card("redis", 500, 480, "Redis", 240, 60), card("pg", 800, 480, "Postgres", 240, 60),
      caption("c", 0, 600, "Each layer talks only to the one under it: only the worker writes orders to Postgres.")],
    links: [wire("p0", "shopper.b", "store.t"), wire("p1", "support.b", "desk.t"), wire("p2", "merchant.b", "admin.t"),
      wire("q0", "store.b", "api.t"), wire("q1", "desk.b", "search.t"), wire("q2", "admin.b", "worker.t"),
      wire("r0", "api.b", "files.t", { text: "uploads" }), wire("r1", "search.b", "redis.t", { text: "index" }), wire("r2", "worker.b", "pg.t", { text: "orders" })],
    beats: [{ on: ["shopper", "store", "api", "files"], run: ["p0", "q0", "r0"], hold: 1600 }, { on: ["merchant", "admin", "worker", "pg"], run: ["p2", "q2", "r2"], hold: 1800 }],
  });
