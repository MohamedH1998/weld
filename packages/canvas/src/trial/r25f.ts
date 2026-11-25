// template: bands  (main mark: segments)
// nearest: bt-budget (borrow: a whole cut into equal shares, the part in question picked)
// For shares of a whole by size: here, four servers each carrying a quarter of the requests, upgraded one at a time.
import { story } from "../story";
import { caption, segments } from "../mk";

const names = (s: [string, string, string, string]) => s.map((st, i) => `server ${i + 1}  ${st}`).join("\n");
const V1 = "v1", V2 = "v2", OUT = "out, draining";

export const TRIAL = story({
    slug: "r25f", name: "One server at a time goes out, upgrades, and comes back", about: "Four servers run version 1 and share the requests. Each is taken out of the pool, upgraded to version 2 and put back, one after another, so three are always answering.",
    things: [segments("s", 0, 0, 720, [25, 25, 25, 25], [`server 1  ${V1}`, `server 2  ${V1}`, `server 3  ${V1}`, `server 4  ${V1}`], 0), caption("c", 0, 100, "Four servers, all on version 1. Each one answers a quarter of the requests.")],
    links: [],
    beats: [
      {},
      { set: { s: 1 }, say: { s: names([OUT, V1, V1, V1]), c: "Server 1 is taken out of the pool. Three still answer." }, hold: 1800 },
      { say: { s: names([V2, V1, V1, V1]), c: "Server 1 is upgraded to version 2 and put back." }, hold: 1800 },
      { set: { s: 2 }, say: { s: names([V2, OUT, V1, V1]), c: "Server 2 is taken out. Three still answer." }, hold: 1800 },
      { say: { s: names([V2, V2, V1, V1]), c: "Server 2 is upgraded to version 2 and put back." }, hold: 1800 },
      { set: { s: 3 }, say: { s: names([V2, V2, OUT, V1]), c: "Server 3 is taken out. Three still answer." }, hold: 1800 },
      { say: { s: names([V2, V2, V2, V1]), c: "Server 3 is upgraded to version 2 and put back." }, hold: 1800 },
      { set: { s: 4 }, say: { s: names([V2, V2, V2, OUT]), c: "Server 4 is taken out. Three still answer." }, hold: 1800 },
      { say: { s: names([V2, V2, V2, V2]), c: "All four on version 2. The service never stopped answering." }, hold: 2400 },
    ],
  });
