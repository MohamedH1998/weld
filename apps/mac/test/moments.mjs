// A drawing that plays stays its agent's whatever moment the person steps to, even with its conversation picked along with
// it: the conversation never becomes part of the drawing, and the agent can still change its parts and redraw it in place.
//   node scripts/shot.mjs out/moments test/moments.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, ok, extra) => console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && extra !== undefined ? ` -> ${JSON.stringify(extra).slice(0, 400)}` : ""}`);

export default async ({ app, page, out }) => {
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  await wait(2000);
  const T = await E(() => Object.values(window.__editor.store.doc.shapes).find((s) => s.kind === "thread")?.id);
  const dir = path.join(out, "data", "scratch", "moments");
  mkdirSync(dir, { recursive: true });
  await E(([T, dir]) => window.weld.thread.set(T, { mode: "full", cwd: dir }), [T, dir]);
  const door = await app.evaluate(({}, T) => ({ url: globalThis.__door.url, key: globalThis.__door.keyFor(T), bin: globalThis.__door.bin }), T);
  const weld = (args, input) => {
    try { return execFileSync(path.join(door.bin, "weld"), args, { cwd: dir, encoding: "utf8", input, env: { ...process.env, WELD_URL: door.url, WELD_TOKEN: door.key, WELD_FROM: T } }); }
    catch (e) { return `(failed) ${e.stdout ?? ""}${e.stderr ?? ""}`; }
  };
  const t = weld(["guide", "strip"]);
  const story = JSON.parse(t.slice(t.indexOf('{"story"'))).story;
  const g = /= #(\w+)/.exec(weld(["draw", "-"], JSON.stringify({ story })))?.[1];
  const ids = () => E((g) => window.__editor.store.doc.order.filter((id) => window.__editor.store.doc.shapes[id]?.group === g).join(), g);
  const before = await ids();
  // the person picks the drawing, and its conversation with it, and steps through its moments and back
  const step = (g, ...at) => E(([g, T, at]) => { const ed = window.__editor, d = ed.store.doc; ed.store.select([...d.order.filter((id) => d.shapes[id]?.group === g), T]); for (const i of at) ed.showMoment(g, i); }, [g, T, at]);
  await step(g, 1, 2, 0);
  await wait(400);
  const tg = await E((T) => window.__editor.store.doc.shapes[T]?.group ?? null, T);
  check("the conversation picked along with it doesn't become part of the drawing", tg === null && (await ids()) === before, { tg });
  // (nor is it made to move with what is picked)
  await E((T) => { const ed = window.__editor; ed.store.select([T]); ed.animate(); }, T);
  check("a conversation alone isn't made to move", !(await E((T) => window.__editor.store.doc.shapes[T]?.group, T)));
  const part = await E((g) => { const d = window.__editor.store.doc; return d.order.find((id) => d.shapes[id]?.group === g && d.shapes[id].kind !== "arrow" && "x" in d.shapes[id]); }, g);
  const ch = weld(["draw", "-"], JSON.stringify({ change: [{ id: `#${part}`, tone: "green" }] }));
  check("after the person has stepped through it, the agent can still change its parts", !/not done|not connected|failed/.test(ch) && (await E((id) => window.__editor.store.doc.shapes[id]?.tone, part)) === "green", ch);
  const re = weld(["draw", "-"], JSON.stringify({ story: { ...story, replace: `#${g}` } }));
  const g2 = /= #(\w+)/.exec(re)?.[1];
  check("…and redraw it in place", !/not done|not connected/.test(re) && !!g2 && g2 !== g, re);
  // and a drawing redrawn that way is its own again, stepped through again
  await step(g2, 1, 0);
  await wait(300);
  const re2 = weld(["draw", "-"], JSON.stringify({ story: { ...story, replace: `#${g2}` } }));
  check("…again, after it has been stepped through again", !/not done|not connected/.test(re2), re2);
  // and what the person drew stays out of its reach
  await E(() => { const st = window.__editor.store; st.run(() => st.put({ id: "mine1", kind: "rect", x: 3000, y: 0, w: 100, h: 60, text: "Mine", tone: "ink", fill: "tint" })); st.emit(); });
  const other = weld(["draw", "-"], JSON.stringify({ remove: ["#mine1"] }));
  check("a shape the person drew is still not the agent's", /not connected|left on the board/.test(other) && (await E(() => !!window.__editor.store.doc.shapes.mine1)), other);
};
