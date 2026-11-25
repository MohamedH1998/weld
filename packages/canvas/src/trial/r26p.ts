// template: turns  (main mark: lifeline)
// shape: Looking up
// nearest: turns (a call set up: parties taking turns, one message per row)
// Copy this file to src/canvas/trial/<slug>.ts and start from it: change the slug, the words and the beats to your subject.
// For parties taking turns, where the order of what passes is the story: a handshake, a protocol, a vote, two parties after one thing.
// A panel per party along the top, a dashed line down from each (its life, time running downward), and each message a wire
// straight across at its own height, one row lower than the one before. Messages arrive one per moment and stay, so the
// last moment shows the whole exchange in order. Every message is drawn from its sender's line to its receiver's and run:
// never back or refuse one. An answer is a message of its own, a row lower; a no is one too, its tone red. If one thing is passed along
// stops that each change it, use handoff; if it is about how long things take, use spans or timeline.
import { story } from "../story";
import { lifeline, message, panel } from "../mk";

// where each party's line runs (its panel's middle: x + w / 2), and the height of each message's row, 64 px apart
const BROWSER = 120, SERVER = 520, STORE = 920, ROW = (i: number) => 160 + i * 64, END = ROW(6) + 30;

export const TRIAL = story({
  slug: "r26p", name: "A cookie keeps you signed in", about: "After sign-in the server stores a session and sends a cookie with its id; the browser sends that cookie back, and the server looks the session up to know who is asking.",
  things: [panel("browser", 0, 0, "BROWSER", "signed out", 240, 104), panel("server", 400, 0, "SERVER", "idle", 240, 104), panel("store", 800, 0, "SESSION STORE", "empty", 240, 104)],
  links: [
    // the parties' lines, there throughout
    lifeline("lb", "browser", BROWSER, END),
    lifeline("ls", "server", SERVER, END),
    lifeline("lt", "store", STORE, END),
    // each message from the sender's line to the receiver's, a row lower than the last
    message("m1", BROWSER, SERVER, ROW(0), "POST /login"),
    message("m2", SERVER, STORE, ROW(1), "save session 41f"),
    message("m3", SERVER, BROWSER, ROW(2), "Set-Cookie: sid=41f"),
    message("m4", BROWSER, SERVER, ROW(3), "GET /account"),
    message("m5", SERVER, STORE, ROW(4), "look up 41f"),
    message("m6", STORE, SERVER, ROW(5), "user: Ana"),
    message("m7", SERVER, BROWSER, ROW(6), "200 OK: Ana's account"),
  ],
  beats: [
    { on: ["browser"], show: ["m1"], run: ["m1"], say: { browser: "signing in", server: "checks password" } },
    { on: ["server", "store"], show: ["m2"], run: ["m2"], say: { server: "starts a session", store: "holds 41f" } },
    { on: ["server", "browser"], show: ["m3"], run: ["m3"], say: { server: "signed in", browser: "holds cookie sid=41f" } },
    { on: ["browser"], show: ["m4"], run: ["m4"], say: { browser: "sends cookie 41f", server: "reads cookie 41f" } },
    { on: ["server", "store"], show: ["m5"], run: ["m5"], say: { server: "looks up 41f", store: "finds 41f" } },
    { on: ["store", "server"], show: ["m6"], run: ["m6"], say: { server: "knows: Ana", store: "holds 41f" } },
    { on: ["server", "browser"], show: ["m7"], run: ["m7"], say: { browser: "signed in as Ana", server: "answers Ana" }, hold: 2400 },
  ],
});
