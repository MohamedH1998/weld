// Notes the person leaves on the pages a thread opened reach that thread: one pointed at a page with an arrow, one put
// just beside a page; a note elsewhere on the board does not.
//   node scripts/shot.mjs out/pagenotes test/pagenotes.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, ok, extra) => console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && extra !== undefined ? ` -> ${JSON.stringify(extra).slice(0, 400)}` : ""}`);

export default async ({ app, page, out }) => {
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  await wait(2000);
  const T = await E(() => Object.values(window.__editor.store.doc.shapes).find((s) => s.kind === "thread")?.id);
  const dir = path.join(out, "data", "scratch", "pagenotes");
  mkdirSync(dir, { recursive: true });
  await E(([T, dir]) => window.weld.thread.set(T, { mode: "full", cwd: dir }), [T, dir]);
  const door = await app.evaluate(({}, T) => ({ url: globalThis.__door.url, key: globalThis.__door.keyFor(T), bin: globalThis.__door.bin }), T);
  const weld = (args) => { try { return execFileSync(path.join(door.bin, "weld"), args, { cwd: dir, encoding: "utf8", env: { ...process.env, WELD_URL: door.url, WELD_TOKEN: door.key, WELD_FROM: T } }); } catch (e) { return `(failed) ${e.stdout ?? ""}${e.stderr ?? ""}`; } };
  writeFileSync(path.join(dir, "register.html"), "<!doctype html><title>Acme register</title><h1>Acme register</h1><button>Export CSV</button>");
  weld(["open", `file://${path.join(dir, "register.html")}`]);
  let P;
  for (let t = 0; t < 40 && !P; t++) (await wait(250), (P = await E((T) => Object.values(window.__editor.store.doc.shapes).find((s) => s.kind === "browser" && s.live?.by === T), T)));
  check("(the thread opened a page)", !!P);
  if (!P) return;
  // the person's notes: one with an arrow to the page from far off, one just beside it, one far away and unconnected
  await E((P) => {
    const st = window.__editor.store;
    st.run(() => {
      st.put({ id: "n-arrow", kind: "rect", x: P.x + P.w + 400, y: P.y, w: 200, h: 120, text: "the Acme total belongs at the bottom", tone: "ink", fill: "none", edited: true });
      st.put({ id: "a-arrow", kind: "arrow", a: { x: P.x + P.w + 400, y: P.y + 60, bind: { id: "n-arrow", ax: 0, ay: 0.5 } }, b: { x: P.x + P.w, y: P.y + 60, bind: { id: P.id, ax: 1, ay: 0.5 } }, text: "", route: "elbow", heads: "end", tone: "ink", edited: true });
      st.put({ id: "n-beside", kind: "rect", x: P.x + P.w + 20, y: P.y + P.h - 100, w: 180, h: 90, text: "drop the export button", tone: "ink", fill: "none", edited: true });
      st.put({ id: "n-far", kind: "rect", x: P.x - 3000, y: P.y - 3000, w: 180, h: 90, text: "unrelated groceries", tone: "ink", fill: "none", edited: true });
    });
    st.emit();
  }, P);
  await wait(800);
  const look = weld(["look"]);
  check("a note pointed at the page with an arrow is shown", look.includes("the Acme total belongs at the bottom"), look.slice(0, 300));
  check("a note just beside the page is shown", look.includes("drop the export button"));
  check("a note elsewhere is not", !look.includes("unrelated groceries"));
};
