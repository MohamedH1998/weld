// template: turns  (main mark: lifeline)
// Copy this file to src/canvas/trial/<slug>.ts and start from it: change the slug, the words and the beats to your subject.
// For parties taking turns, where the order of what passes is the story: a handshake, a protocol, a vote, two parties after one thing.
// A panel per party along the top, a dashed line down from each (its life, time running downward), and each message a wire
// straight across at its own height, one row lower than the one before. Messages arrive one per moment and stay, so the
// last moment shows the whole exchange in order. Every message is drawn from its sender's line to its receiver's and run:
// never back or refuse one. An answer is a message of its own, a row lower; a no is one too, its tone red. If one thing is passed along
// stops that each change it, use handoff; if it is about how long things take, use spans or periods.
import { story } from "../story";
import { lifeline, message, panel } from "../mk";

// where each party's line runs (its panel's middle: x + w / 2), and the height of each message's row, 64 px apart
const CALLER = 120, CALLEE = 520, ROW = (i: number) => 160 + i * 64, END = ROW(4) + 30;

export const TRIAL = story({
  slug: "template-turns", name: "A call is set up", about: "The caller invites; the callee's phone rings, then it answers; the caller acknowledges, and they talk.",
  things: [panel("caller", 0, 0, "CALLER", "dialling", 240, 104), panel("callee", 400, 0, "CALLEE", "idle", 240, 104)],
  links: [
    // the parties' lines, there throughout
    lifeline("lc", "caller", CALLER, END),
    lifeline("le", "callee", CALLEE, END),
    // each message from the sender's line to the receiver's, a row lower than the last
    message("m1", CALLER, CALLEE, ROW(0), "INVITE"),
    message("m2", CALLEE, CALLER, ROW(1), "180 Ringing"),
    message("m3", CALLEE, CALLER, ROW(2), "200 OK"),
    message("m4", CALLER, CALLEE, ROW(3), "ACK"),
  ],
  beats: [
    { on: ["caller"], show: ["m1"], run: ["m1"], say: { caller: "inviting", callee: "invited" } },
    { on: ["callee"], show: ["m2"], run: ["m2"], say: { callee: "ringing", caller: "hears ringing" } },
    { on: ["callee"], show: ["m3"], run: ["m3"], say: { callee: "answered", caller: "answered" } },
    { on: ["caller", "callee"], show: ["m4"], run: ["m4"], say: { caller: "talking", callee: "talking" }, hold: 2400 },
  ],
});
