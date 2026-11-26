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
  const madeStill = await E(() => { const ed = window.__editor; ed.scope = "still1"; const g = ed.fresh("tstill", "terminal", { x: 0, y: 0, w: 300, h: 200 }).group ?? null; ed.scope = null; return g; });
  check("…while one made in a group that stays still still joins it, as before", madeStill === "still1", madeStill);
  // a drawing copied elsewhere with a terminal inside it, pasted: the terminal comes out of it, on show
  const pasted = await E(() => {
    const ed = window.__editor, before = new Set(Object.keys(ed.store.doc.shapes));
    const box = { id: "cb1", kind: "rect", x: 5000, y: 0, w: 160, h: 80, text: "Acme", tone: "ink", fill: "tint", group: "cg1" };
    const term = { id: "ct1", kind: "terminal", x: 5200, y: 0, w: 400, h: 260, text: "", tone: "ink", fill: "none", group: "cg1", live: {} };
    const text = JSON.stringify({ canvas: 1, shapes: [box, term], scenes: { cg1: { at: 0, moments: [{ id: "cm1", over: 500, hold: 1200, shapes: [box, term] }, { id: "cm2", over: 500, hold: 1200, shapes: [{ ...box, x: 5050 }, term] }] } } });
    ed.pasteText(text);
    const d = ed.store.doc, made = Object.keys(d.shapes).filter((id) => !before.has(id)).map((id) => d.shapes[id]);
    const t = made.find((x) => x.kind === "terminal"), b = made.find((x) => x.kind === "rect");
    if (!t || !b) return { made: made.map((x) => x.kind) };
    ed.store.select(made.filter((x) => x.group === b.group).map((x) => x.id));
    ed.showMoment(b.group, 1);
    ed.showMoment(b.group, 0);
    const t2 = ed.store.doc.shapes[t.id];
    return { group: t2?.group ?? null, away: !!t2?.away, scene: !!ed.store.doc.scenes?.[b.group] };
  });
  check("a moving drawing pasted with a terminal inside it: the terminal comes out, on show, the drawing still plays", pasted.group === null && !pasted.away && pasted.scene, pasted);
  // Group is offered only when it would take something in: a whole drawing that plays and a conversation, not
  await E(([g, T]) => { const ed = window.__editor, d = ed.store.doc; ed.store.select([...d.order.filter((id) => d.shapes[id]?.group === g), T]); }, [g4, T]);
  check("Group isn't offered for a drawing that plays and only a conversation beside it", (await E(() => window.__editor.canGroup)) === false);
  // grouped with a still group holding a box and a terminal: the box joins, the terminal stands apart, the drawing stays picked
  const grouped = await E((g) => {
    const ed = window.__editor, st = ed.store;
    st.run(() => { st.put({ id: "sb1", kind: "rect", x: 6000, y: 0, w: 160, h: 80, text: "Acme", tone: "ink", fill: "tint", group: "sg1" }); st.put({ id: "st1", kind: "terminal", x: 6300, y: 0, w: 400, h: 260, text: "", tone: "ink", fill: "none", group: "sg1", live: {} }); });
    const d = st.doc;
    st.select([...d.order.filter((id) => d.shapes[id]?.group === g), "sb1", "st1"]);
    ed.group();
    const d2 = st.doc;
    return { box: d2.shapes.sb1?.group, term: d2.shapes.st1?.group ?? null, whole: d2.order.filter((id) => d2.shapes[id]?.group === g).every((id) => st.sel.has(id)) && !st.sel.has("st1"), scene: ed.sceneGroup };
  }, g4);
  // animated together with a still group holding a box and a terminal: the terminal stands apart; the drawing and it, picked, still show its moments
  const anim = await E(() => {
    const ed = window.__editor, st = ed.store;
    st.run(() => { st.put({ id: "ab1", kind: "rect", x: 9000, y: 0, w: 160, h: 80, text: "Acme", tone: "ink", fill: "tint", group: "sg2" }); st.put({ id: "at1", kind: "terminal", x: 9300, y: 0, w: 400, h: 260, text: "", tone: "ink", fill: "none", group: "sg2", live: {} }); st.put({ id: "ab2", kind: "rect", x: 9000, y: 200, w: 160, h: 80, text: "Loose", tone: "ink", fill: "tint" }); });
    st.select(["ab1", "at1", "ab2"]);
    ed.animate();
    const d = st.doc, g = d.shapes.ab1.group;
    ed.leave?.();
    st.select(["ab1", "ab2", "at1"]);
    return { g, same: d.shapes.ab2.group === g, term: d.shapes.at1.group ?? null, scene: !!d.scenes?.[g], shown: ed.sceneGroup };
  });
  check("animated with a still group holding a terminal: the terminal stands apart, and picked with the drawing its moments still show", anim.scene && anim.same && anim.term === null && anim.shown === anim.g, anim);
  // a drawing wired to a terminal that has since moved, copied with it: the copy's wire stays at the terminal through its moments
  const jump = await E(() => {
    const ed = window.__editor, st = ed.store;
    st.run(() => { st.put({ id: "wb1", kind: "rect", x: 12000, y: 0, w: 160, h: 80, text: "Acme", tone: "ink", fill: "tint" }); st.put({ id: "wt1", kind: "terminal", x: 12300, y: 0, w: 400, h: 260, text: "", tone: "ink", fill: "none", live: {} }); st.put({ id: "ww1", kind: "arrow", tone: "ink", a: { x: 12160, y: 40, bind: { id: "wb1", ax: 1, ay: 0.5 } }, b: { x: 12300, y: 130, bind: { id: "wt1", ax: 0, ay: 0.5 } } }); });
    st.select(["wb1", "ww1"]);
    ed.animate();
    ed.leave?.();
    const g = st.doc.shapes.wb1.group;
    // the terminal moved, and the wire follows it on the board
    st.run(() => { st.patch("wt1", { y: 550 }); st.patch("ww1", { b: { x: 12300, y: 680, bind: { id: "wt1", ax: 0, ay: 0.5 } } }); });
    const before = new Set(Object.keys(st.doc.shapes));
    st.select(["wb1", "ww1", "wt1"]);
    ed.duplicate();
    const d = st.doc, made = Object.keys(d.shapes).filter((id) => !before.has(id)).map((id) => d.shapes[id]);
    const w = made.find((x) => x.kind === "arrow");
    if (!w) return { made: made.map((x) => x.kind) };
    const t = made.find((x) => x.kind === "terminal"), y0 = t.y + t.h * 0.5;
    st.select(made.filter((x) => x.group === w.group).map((x) => x.id));
    ed.showMoment(w.group, 1); ed.showMoment(w.group, 0);
    const y1 = st.doc.shapes[w.id]?.b?.y, ys = (st.doc.scenes[w.group]?.moments ?? []).map((m) => m.shapes.find((x) => x.id === w.id)?.b?.y);
    return { y0, y1, ys, g };
  });
  check("a drawing wired to a terminal since moved, duplicated with it: the copy's wire stays at the terminal through its moments", jump.y0 !== undefined && Math.abs(jump.y1 - jump.y0) < 1 && (jump.ys ?? []).every((y) => Math.abs(y - jump.y0) < 1), jump);
  check("grouped with a still group holding a box and a terminal: the box joins, the terminal stands apart, the moving drawing stays picked", grouped.box === g4 && grouped.term === null && grouped.whole && grouped.scene === g4, grouped);
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
