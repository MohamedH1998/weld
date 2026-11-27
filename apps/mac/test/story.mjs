// An agent drawing a diagram that plays, through the weld command its shell runs: the guide, a template as a story, the
// story drawn beside its conversation (with its moments, on a board that had none), the person's view, selection and undo
// left alone, a redraw in place, the retired kinds refused, and the drawing kept across a reload.
//   node scripts/shot.mjs out/story test/story.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, ok, extra) => console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && extra !== undefined ? ` -> ${JSON.stringify(extra).slice(0, 400)}` : ""}`);

export default async ({ app, page, out, shot }) => {
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await wait(2000);
  const T = await E(() => Object.values(window.__editor.store.doc.shapes).find((s) => s.kind === "thread")?.id);
  const dir = path.join(out, "data", "scratch", "story");
  mkdirSync(dir, { recursive: true });
  await E(([T, dir]) => window.weld.thread.set(T, { mode: "full", cwd: dir }), [T, dir]);
  const door = await app.evaluate(({}, T) => ({ url: globalThis.__door.url, key: globalThis.__door.keyFor(T), bin: globalThis.__door.bin }), T);
  const weld = (args, input) => {
    try { return execFileSync(path.join(door.bin, "weld"), args, { cwd: dir, encoding: "utf8", input, env: { ...process.env, WELD_URL: door.url, WELD_TOKEN: door.key, WELD_FROM: T } }); }
    catch (e) { return `(failed) ${e.stdout ?? ""}${e.stderr ?? ""}`; }
  };

  // the guide
  const g = weld(["guide"]);
  check("weld guide says how to draw, the notation, the helpers, the templates and the diagrams", /Drawing a diagram in Weld/.test(g) && /story notation/.test(g) && /segments = \(/.test(g) && /\n  strip /.test(g) && /lanes-handover/.test(g), g.slice(0, 200));
  // (an agent that reads only the head of the guide still finds what to start a map, a board or findings from)
  const head = g.split("\n").slice(0, 15).join("\n");
  check("the guide's first lines say which template to start a map, a board of work or findings from", ["map", "layers", "tickets", "numbers"].every((k) => head.includes("`" + k + "`")), head);
  for (const k of ["map", "layers", "tickets", "numbers"]) {
    const line = weld(["guide", k]).split("\n").find((l) => l.startsWith('{"story"'));
    let s = null;
    try { s = JSON.parse(line ?? "").story; } catch {}
    check(`weld guide ${k} prints a story with things in it`, !!s?.things?.length, (line ?? "").slice(0, 200));
  }
  const t = weld(["guide", "strip"]);
  const json = t.slice(t.indexOf('{"story"'));
  let story;
  try { story = JSON.parse(json).story; } catch {}
  check("weld guide <template> prints it as a story to send", !!story?.things?.length && !!story?.beats?.length, t.slice(0, 300));
  check("an unknown name is said, not guessed", /no template or diagram called "nope"/.test(weld(["guide", "nope"])));

  // the person's view and selection, as they are before the agent draws
  const before = await E(() => { const s = window.__editor.store; s.select([Object.keys(s.doc.shapes)[0]]); s.emit(); return { cam: { ...s.cam }, sel: [...s.sel], undo: s.canUndo, scenes: Object.keys(s.doc.scenes ?? {}).length }; });
  check("(the board starts with no drawing that plays)", before.scenes === 0, before);

  // the template, as a story of the agent's own
  story.name = "Ownership moves when a node joins";
  const said = weld(["draw", "-"], JSON.stringify({ story }));
  const id = /= #(\w+)/.exec(said)?.[1];
  check("weld draw takes a story and answers with the drawing's id", !!id, said);
  await wait(600);
  const placed = await E((id) => { const s = window.__editor.store, d = s.doc, mine = d.order.filter((x) => d.shapes[x].group === id); const th = Object.values(d.shapes).find((x) => x.kind === "thread"); const xs = mine.map((x) => d.shapes[x]).filter((x) => x.kind !== "arrow"); return { n: mine.length, moments: d.scenes?.[id]?.moments.length ?? 0, clear: xs.every((x) => x.x >= th.x + th.w || x.y >= th.y + th.h || x.x + x.w <= th.x || x.y + x.h <= th.y), cam: { ...s.cam }, sel: [...s.sel], undo: s.canUndo }; }, id);
  check("the story is on the board as one drawing, with all its moments (on a board that had none)", placed.n > 0 && placed.moments === story.beats.length, placed);
  check("…clear of the conversation it came from", placed.clear, placed);
  check("…and the person's view, selection and undo are as they were", JSON.stringify(placed.cam) === JSON.stringify(before.cam) && placed.sel.join() === before.sel.join() && placed.undo === before.undo, { before, placed });
  await E((id) => { const e = window.__editor; e.fit(e.store.doc.order.filter((x) => e.store.doc.shapes[x].group === id)); }, id);
  await wait(800);
  await shot("story-drawn");

  // redrawn in place
  story.things = story.things.map((x) => (Array.isArray(x) ? x : x.kind === "segments" ? { ...x, text: String(x.text).replace(/^[^\n]*/, (m) => m) } : x));
  const at0 = await E((id) => { const d = window.__editor.store.doc; const xs = d.order.map((x) => d.shapes[x]).filter((x) => x.group === id && x.kind !== "arrow"); return { x: Math.min(...xs.map((x) => x.x)), y: Math.min(...xs.map((x) => x.y)) }; }, id);
  const again = weld(["draw", "-"], JSON.stringify({ story: { ...story, name: "Ownership moves (again)", replace: `#${id}` } }));
  const id2 = /= #(\w+)/.exec(again)?.[1];
  await wait(600);
  const re = await E(([a, b]) => { const d = window.__editor.store.doc; const xs = d.order.map((x) => d.shapes[x]).filter((x) => x.group === b && x.kind !== "arrow"); return { oldLeft: d.order.filter((x) => d.shapes[x].group === a).length, oldScene: !!d.scenes?.[a], at: { x: Math.min(...xs.map((x) => x.x)), y: Math.min(...xs.map((x) => x.y)) }, moments: d.scenes?.[b]?.moments.length ?? 0 }; }, [id, id2]);
  check("replace redraws it where it stood, the old one gone", !!id2 && re.oldLeft === 0 && !re.oldScene && Math.abs(re.at.x - at0.x) < 1 && Math.abs(re.at.y - at0.y) < 1 && re.moments === story.beats.length, { again, re, at0 });

  // a story that is wrong is said, never drawn half
  const bad = weld(["draw", "-"], JSON.stringify({ story: { name: "x", things: [["nope", "a"]] } }));
  check("a helper that does not exist is said", /no helper called "nope"/.test(bad), bad);
  const field = weld(["draw", "-"], JSON.stringify({ story: { name: "x", things: [["card", "a", 0, 0, "A"]], colour: "red" } }));
  check("…and so is a field it does not know", /unknown field "colour"/.test(field), field);
  const nonsense = weld(["draw", "-"], JSON.stringify({ story: { name: "x", things: [{ id: "q", kind: "nonsense", x: 0, y: 0, w: 10, h: 10, text: "" }] } }));
  check("…and a kind the board does not draw", /which a story cannot draw/.test(nonsense), nonsense);
  const wrong = weld(["draw", "-"], JSON.stringify({ story: { name: "x", things: [{ id: "q", kind: "cells", x: 0, y: 0, w: 100, h: 30, text: 7 }] } }));
  check("…or a field of the wrong kind (words given as a number) is drawn as words or said", !/pageerror/.test(wrong) && (/not well-formed/.test(wrong) || /= #/.test(wrong)), wrong);
  const live = weld(["draw", "-"], JSON.stringify({ story: { name: "x", things: [{ id: "q", kind: "terminal", x: 0, y: 0, w: 10, h: 10, text: "" }] } }));
  check("…or a live thing", /which a story cannot draw/.test(live), live);
  // a drawing that is only partly this conversation's is not redrawn over the rest
  const part = await E(([id2]) => { const s = window.__editor.store, d = s.doc; const one = d.order.find((x) => d.shapes[x].group === id2 && d.shapes[x].kind !== "arrow"); s.run(() => s.put({ id: "theirs-in-it", kind: "card", x: d.shapes[one].x, y: d.shapes[one].y - 200, w: 120, h: 56, text: "Theirs", tone: "ink", fill: "none", group: id2 })); s.emit(); return true; }, [id2]);
  const over = weld(["draw", "-"], JSON.stringify({ story: { ...story, replace: `#${id2}` } }));
  check("a drawing someone else added to is not replaced", part && /not done: story/.test(over) && await E(() => !!window.__editor.store.doc.shapes["theirs-in-it"]), over);
  await E(() => { const s = window.__editor.store; s.run(() => s.remove(["theirs-in-it"])); s.emit(); });
  const old = weld(["draw", JSON.stringify({ add: [{ ref: "db", kind: "store", text: "Postgres" }] })]);
  check("a retired kind is not drawn anew", /cannot draw a "store"/.test(old), old);
  const violet = weld(["draw", JSON.stringify({ add: [{ ref: "v", kind: "card", text: "Violet", tone: "purple" }] })]);
  check("purple is the board's violet", /v = #/.test(violet) && !/not done/.test(violet), violet);

  // kept
  await wait(1500);
  await page.reload();
  await page.waitForFunction(() => !!window.__editor);
  await wait(1800);
  const kept = await E((id) => { const d = window.__editor.store.doc; return { n: d.order.filter((x) => d.shapes[x].group === id).length, moments: d.scenes?.[id]?.moments.length ?? 0 }; }, id2);
  check("after a reload the drawing keeps its moments", kept.n > 0 && kept.moments === story.beats.length, kept);
  const look = weld(["look"]);
  check("weld look describes it", look.length > 50, look.slice(0, 200));
  check("no page errors", !errors.length, errors);
};
