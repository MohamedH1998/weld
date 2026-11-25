// Construction drawings, told in the board's own hand. What is kept is the idea (time and size
// drawn to scale, one part singled out); what carries it is ours: the Timeline and Segments (blue for what is happening now),
// with the Measure walking along what it measures.
import { story } from "./story";
import type { StampDef } from "./stamps";
import { later, rule, segments } from "./mk";

export const BUILT: StampDef[] = [
  story({
    slug: "bt-budget", name: "Where the second goes", about: "",
    things: [rule("tot", 0, -44, "1 second", 700, 16), segments("p", 0, 0, 700, [1, 1, 2, 5, 1], ["DNS", "Connect", "TLS", "Waiting", "Download"], 0), later(rule("sel", 0, 84, "100 ms", 70, 16, -36))],
    links: [],
    beats: [{}, { set: { p: 1 }, show: ["sel"] }, { set: { p: 2 }, at: { sel: [70, 84] } }, { set: { p: 3 }, at: { sel: [140, 84] }, size: { sel: [140, 16] }, say: { sel: "200 ms" } },
      { set: { p: 4 }, at: { sel: [280, 84] }, size: { sel: [350, 16] }, say: { sel: "500 ms, half of it" }, hold: 2400 }, { set: { p: 5 }, at: { sel: [630, 84] }, size: { sel: [70, 16] }, say: { sel: "100 ms" } },
      { set: { p: 4 }, at: { sel: [280, 84] }, size: { sel: [350, 16] }, say: { sel: "500 ms, half of it" } }],
  }),
  story({
    slug: "bt-url", name: "An address, and who reads each part", about: "",
    things: [segments("u", 0, 0, 700, [8, 12, 10, 7], ["https://  Scheme", "api.shop.dev  Host", "/orders/42  Path", "?page=2  Query"], 0), later(rule("sel", 0, 92, "how to talk", 151, 16, -44))],
    links: [],
    beats: [{}, { set: { u: 1 }, show: ["sel"] }, { set: { u: 2 }, at: { sel: [151, 92] }, size: { sel: [227, 16] }, say: { sel: "who to ask" } },
      { set: { u: 3 }, at: { sel: [378, 92] }, size: { sel: [190, 16] }, say: { sel: "what to fetch" } }, { set: { u: 4 }, at: { sel: [568, 92] }, size: { sel: [132, 16] }, say: { sel: "its shape" } },
      { set: { u: 3 }, at: { sel: [378, 92] }, size: { sel: [190, 16] }, say: { sel: "picks the handler" }, hold: 2400 }],
  }),
];
