// template: loop  (main mark: wire)
// Copy this file to src/canvas/trial/<slug>.ts and start from it: change the slug, the words and the beats to your subject.
// For something that comes back round: a control loop, an event loop, a retry cycle, a lifecycle that repeats. Its steps
// stand round an oval, top, right, bottom, left (three to five of them), with a square wire (an elbow) from each to the next
// and one from the last back to the first: the wires are the ring. Each moment runs the wire into the step that is happening and lights it; the way back is run too,
// so the reader sees it go round. What the loop works on (a level, a queue) can sit in the middle.
// If the steps happen once, in a line, use handoff; if they are states with named ways between them, use handoff with pills.
import { story } from "../story";
import { card, gauge, wire } from "../mk";

// the oval's middle and reach (wider than tall, so the middle has room); each step is centred on a point of it
const CX = 360, CY = 220, RX = 250, RY = 160, W = 190, H = 64;
const at = (id: string, deg: number, text: string) => card(id, CX + RX * Math.cos((deg * Math.PI) / 180) - W / 2, CY + RY * Math.sin((deg * Math.PI) / 180) - H / 2, text, W, H);

export const TRIAL = story({
  slug: "template-loop", name: "A thermostat goes round", about: "It reads the room, compares it with the target, switches the heater, waits a minute, and reads again.",
  things: [
    at("read", -90, "Read the room"), at("cmp", 0, "Compare: 21°"), at("heat", 90, "Heater on"), at("wait", 180, "Wait 1 min"),
    gauge("t", CX - 80, CY - 8, "ROOM 18°", 0.4, 160, 16),
  ],
  links: [
    // round the ring, each to the next; the last brings it back to the start
    wire("l1", "read.r", "cmp.t", { elbow: true }),
    wire("l2", "cmp.b", "heat.r", { elbow: true }),
    wire("l3", "heat.l", "wait.b", { elbow: true }),
    wire("back", "wait.t", "read.l", { elbow: true }),
  ],
  beats: [
    { on: ["read"] },
    { on: ["cmp"], run: ["l1"] },
    { on: ["heat"], run: ["l2"], set: { t: 0.6 }, say: { t: "ROOM 19°" } },
    { on: ["wait"], run: ["l3"], set: { t: 0.75 }, say: { t: "ROOM 20°" } },
    { on: ["read"], run: ["back"], set: { t: 0.8 }, say: { t: "ROOM 21°" }, hold: 2400 },
  ],
});
