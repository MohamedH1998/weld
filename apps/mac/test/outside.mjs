// What comes from outside the board does nothing by being put down: pasted shapes keep their look, never their power.
//   node scripts/shot.mjs out/outside test/outside.mjs
import { existsSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, ok, extra) => console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && extra !== undefined ? ` -> ${JSON.stringify(extra).slice(0, 400)}` : ""}`);

export default async ({ page }) => {
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  await wait(1500);
  const marker = path.join(os.tmpdir(), `weld-outside-${process.pid}`);
  rmSync(marker, { force: true });
  const pasted = JSON.stringify({
    canvas: 1,
    shapes: [
      { id: "t1", kind: "terminal", x: 0, y: 900, w: 640, h: 400, text: "", live: { run: `touch ${marker}` } },
      { id: "b1", kind: "browser", x: 700, y: 900, w: 400, h: 300, text: "", live: { url: "file:///" } },
      { id: "i1", kind: "image", x: 1200, y: 900, w: 10, h: 10, text: "", img: { hash: "0".repeat(40), ext: "png", w: 10, h: 10, origin: "/etc/hosts.png" } },
    ],
  });
  const before = await E(() => new Set(window.__editor.store.doc.order).size);
  await E((t) => window.__editor.pasteText(t), pasted);
  const added = await E((n) => window.__editor.store.doc.order.slice(n).map((id) => window.__editor.store.doc.shapes[id]), before);
  check("pasted shapes are put down", added.length === 3, added.map((s) => s.kind));
  const term = added.find((s) => s.kind === "terminal"), page_ = added.find((s) => s.kind === "browser"), pic = added.find((s) => s.kind === "image");
  check("a pasted terminal carries no command", term && !term.live?.run, term?.live);
  check("a pasted page carries no local address", page_ && !page_.live?.url, page_?.live);
  check("a pasted picture names no local file", pic && !pic.img?.origin, pic?.img);
  await wait(3000);
  check("nothing pasted ran", !existsSync(marker));
  const found = await E(() => window.weld.localUrl("file:///nowhere-approved/x.html"));
  check("a local address on a board approves no folder", found === "file:///nowhere-approved/x.html", found);
  const given = await E(() => window.weld.localUrl("file:///nowhere-approved/x.html", true));
  check("a local address the person gives opens from its folder", /^weld-local:\/\//.test(given), given);
  const again = await E(() => window.weld.localUrl("file:///nowhere-approved/y.html"));
  check("…and from then on, a board's address in that folder opens too", /^weld-local:\/\/[^/]+\/y\.html$/.test(again), again);

  // the person's own copy, pasted back, is kept whole
  await E(() => {
    const s = window.__editor.store;
    s.run(() => s.put({ id: "own", kind: "browser", x: 0, y: 1500, w: 400, h: 300, text: "", tone: "ink", fill: "none", live: { url: "https://example.com/", from: "nobody" } }));
    s.select(["own"]);
  });
  const own = await E(() => window.__editor.serialize());
  const n2 = await E(() => window.__editor.store.doc.order.length);
  await E((t) => window.__editor.pasteText(t), own);
  const copy = await E((n) => window.__editor.store.doc.shapes[window.__editor.store.doc.order[n]], n2);
  check("the person's own copy pastes back with its page", copy?.live?.url === "https://example.com/", copy?.live);
};
