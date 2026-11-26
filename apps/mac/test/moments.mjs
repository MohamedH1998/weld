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
  const g3 = /= #(\w+)/.exec(re2)?.[1];
  check("…again, after it has been stepped through again", !/not done|not connected|failed/.test(re2) && !!g3 && g3 !== g2, re2);
  // a moment added with the conversation picked along with the whole drawing: the drawing is still moved as a whole
  await E(([g, T]) => { const ed = window.__editor, d = ed.store.doc; ed.leave?.(); ed.store.select([...d.order.filter((id) => d.shapes[id]?.group === g), T]); ed.addMoment(g); }, [g3, T]);
  await wait(200);
  const inside = await E(() => window.__editor.sceneGroup ?? null);
  const scoped = await E(() => window.__editor.scope ?? null);
  check("a moment added with its conversation picked too leaves the drawing whole (not stepped into)", scoped !== g3, { scoped, inside, g3 });
  // a board saved with a conversation inside a drawing that plays (as before this) is mended as it opens
  await E(([g, T]) => { const st = window.__editor.store, d = st.doc, t = d.shapes[T]; st.setDoc({ ...d, shapes: { ...d.shapes, [T]: { ...t, group: g, away: true } }, scenes: { ...d.scenes, [g]: { ...d.scenes[g], moments: d.scenes[g].moments.map((m) => ({ ...m, shapes: [...m.shapes, { ...t, group: g }] })) } } }); st.emit(); }, [g3, T]);
  await wait(2500);
  await page.reload();
  await wait(2500);
  const mended = await E(([g, T]) => { const d = window.__editor.store.doc; return { group: d.shapes[T]?.group ?? null, away: !!d.shapes[T]?.away, inMoments: (d.scenes?.[g]?.moments ?? []).some((m) => m.shapes.some((x) => x.id === T)), scene: !!d.scenes?.[g] }; }, [g3, T]);
  check("a board saved with its conversation inside a drawing that plays opens mended, on the board as itself (the drawing still plays)", mended.group === null && !mended.away && !mended.inMoments && mended.scene, mended);
  const re3 = weld(["draw", "-"], JSON.stringify({ story: { ...story, replace: `#${g3}` } }));
  const g4 = /= #(\w+)/.exec(re3)?.[1];
  check("…and the agent can redraw it again", !/not done|not connected|failed/.test(re3) && !!g4 && g4 !== g3, re3);
  // a terminal, page or conversation made while the drawing is stepped into isn't made part of it
  const madeIn = await E((g) => { const ed = window.__editor; ed.scope = g; const r = ["terminal", "browser", "thread", "rect"].map((k) => [k, ed.fresh(`t${k}`, k, { x: 0, y: 0, w: 300, h: 200 }).group ?? null]); ed.scope = null; return Object.fromEntries(r); }, g4);
  check("a terminal, page or conversation made while a drawing that plays is stepped into isn't made part of it (a box is)", madeIn.terminal === null && madeIn.browser === null && madeIn.thread === null && madeIn.rect === g4, madeIn);
  // Group is offered only when it would take something in: a whole drawing that plays and a conversation, not
  await E(([g, T]) => { const ed = window.__editor, d = ed.store.doc; ed.store.select([...d.order.filter((id) => d.shapes[id]?.group === g), T]); }, [g4, T]);
  check("Group isn't offered for a drawing that plays and only a conversation beside it", (await E(() => window.__editor.canGroup)) === false);
  // a wire from a drawing that plays to a conversation stays joined to it, saved and opened twice, stepping through it
  const joined = await E(([g, T]) => {
    const st = window.__editor.store, d = st.doc, part = d.order.find((id) => d.shapes[id]?.group === g && d.shapes[id].kind !== "arrow" && d.shapes[id].kind !== "text" && "w" in d.shapes[id]);
    const wire = { id: "wire1", kind: "arrow", group: g, tone: "ink", a: { x: 0, y: 0, bind: { id: part, ax: 1, ay: 0.5 } }, b: { x: 0, y: 0, bind: { id: T, ax: 0, ay: 0.5 } } };
    st.setDoc({ ...d, shapes: { ...d.shapes, wire1: wire }, order: [...d.order, "wire1"], scenes: { ...d.scenes, [g]: { ...d.scenes[g], moments: d.scenes[g].moments.map((m) => ({ ...m, shapes: [...m.shapes, wire] })) } } });
    st.emit();
    return !!part;
  }, [g4, T]);
  for (let i = 0; i < 2; i++) { await wait(2500); await page.reload(); await wait(2500); }
  await E((g) => { const ed = window.__editor, d = ed.store.doc; ed.store.select(d.order.filter((id) => d.shapes[id]?.group === g)); ed.showMoment(g, 1); ed.showMoment(g, 0); }, g4);
  await wait(300);
  const ends = await E((T) => { const d = window.__editor.store.doc, w = d.shapes.wire1; return { board: w?.b?.bind?.id === T, moments: Object.values(d.scenes ?? {}).flatMap((sc) => sc.moments).flatMap((m) => m.shapes).filter((x) => x.id === "wire1").every((x) => x.b?.bind?.id === T) }; }, T);
  check("a wire from a drawing that plays to its conversation stays joined to it, opened twice and stepped through", joined && ends.board && ends.moments, ends);
  // copied with the conversation it is wired to (duplicated, or copied and pasted): the copy's wire is joined to the copy
  for (const how of ["duplicate", "copy", "paste"]) {
    const r = await E(([g, T, how]) => {
      const ed = window.__editor, before = new Set(Object.keys(ed.store.doc.shapes)), d0 = ed.store.doc;
      ed.store.select([...d0.order.filter((id) => d0.shapes[id]?.group === g), T]);
      if (how === "duplicate") ed.duplicate(); else if (how === "copy") (ed.copy(), ed.paste()); else ed.pasteText(ed.serialize());
      const d = ed.store.doc, made = Object.keys(d.shapes).filter((id) => !before.has(id));
      const wire = made.map((id) => d.shapes[id]).find((x) => x.kind === "arrow" && x.b?.bind), thread = made.find((id) => ["thread", "terminal", "browser"].includes(d.shapes[id].kind));
      if (!wire) return { how, made: made.map((id) => d.shapes[id].kind) };
      const g2 = wire.group;
      ed.store.select(d.order.filter((id) => d.shapes[id]?.group === g2));
      ed.showMoment(g2, 1);
      ed.showMoment(g2, 0);
      const d2 = ed.store.doc, w2 = d2.shapes[wire.id];
      return { how, to: wire.b.bind.id, thread, board: w2?.b?.bind?.id ?? null, moments: (d2.scenes?.[g2]?.moments ?? []).map((m) => m.shapes.find((x) => x.id === wire.id)?.b?.bind?.id ?? null) };
    }, [g4, T, how]);
    check(`${how === "duplicate" ? "duplicated" : how === "copy" ? "copied and pasted (in Weld)" : "copied and pasted (through the clipboard)"} with its conversation, the copy's wire stays joined to the copied conversation through its moments`, !!r.thread && r.to === r.thread && r.board === r.thread && (r.moments ?? []).length > 1 && r.moments.every((x) => x === r.thread), r);
  }
  // and what the person drew stays out of its reach
  await E(() => { const st = window.__editor.store; st.run(() => st.put({ id: "mine1", kind: "rect", x: 3000, y: 0, w: 100, h: 60, text: "Mine", tone: "ink", fill: "tint" })); st.emit(); });
  const other = weld(["draw", "-"], JSON.stringify({ remove: ["#mine1"] }));
  check("a shape the person drew is still not the agent's", /not connected|left on the board/.test(other) && (await E(() => !!window.__editor.store.doc.shapes.mine1)), other);
};
