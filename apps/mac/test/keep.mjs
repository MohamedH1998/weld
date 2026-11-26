// What the person makes or changes on the board is theirs: an agent that removes or redraws a drawing (a script that
// redraws a board from a file, say) leaves the person's changes standing, fails saying why (so the script stops), and
// does it anyway only when asked ("force"). Through the real `weld` command, as an agent runs it.
//   node scripts/shot.mjs out/keep test/keep.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, ok, extra) => console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && extra !== undefined ? ` -> ${JSON.stringify(extra).slice(0, 400)}` : ""}`);

export default async ({ app, page, out, shot }) => {
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  await wait(2000);
  const T = await E(() => Object.values(window.__editor.store.doc.shapes).find((s) => s.kind === "thread")?.id);
  const dir = path.join(out, "data", "scratch", "keep");
  mkdirSync(dir, { recursive: true });
  await E(([T, dir]) => window.weld.thread.set(T, { mode: "full", cwd: dir }), [T, dir]);
  const door = await app.evaluate(({}, T) => ({ url: globalThis.__door.url, key: globalThis.__door.keyFor(T), bin: globalThis.__door.bin }), T);
  const env = { ...process.env, WELD_URL: door.url, WELD_TOKEN: door.key, WELD_FROM: T };
  const weld = (args, input) => {
    try { return execFileSync(path.join(door.bin, "weld"), args, { cwd: dir, encoding: "utf8", input, env }); }
    catch (e) { return `(failed) ${e.stdout ?? ""}${e.stderr ?? ""}`; }
  };
  const draw = (ops) => weld(["draw", "-"], JSON.stringify(ops));
  const ids = (said) => Object.fromEntries([...said.matchAll(/^\s*(\S+) = #(\w+)/gm)].map((m) => [m[1], m[2]]));
  const shape = (id) => E((id) => { const s = window.__editor.store.doc.shapes[id]; return s ? { x: s.x, y: s.y, text: s.text, tone: s.tone } : null; }, id);
  const mark = (id) => E((id) => !!window.__editor.store.doc.shapes[id]?.edited, id);

  // an agent draws a little ticket board: four cards in a column, in the file's order
  const cards = ["#1 Acme sign-up page", "#2 Acme billing settings", "#3 Acme invoices API", "#4 Acme search"];
  const made = ids(draw({ add: cards.map((text, i) => ({ ref: `c${i}`, kind: "rect", text, x: 0, y: i * 80, w: 260, h: 60 })) }));
  const [c0, c1, c2, c3] = ["c0", "c1", "c2", "c3"].map((k) => made[k]);
  await wait(1200);
  check("what an agent draws is not the person's (nothing marked, after it settles)", !!c3 && !(await mark(c0)) && !(await mark(c1)) && !(await mark(c2)) && !(await mark(c3)), made);

  // the person reorders them (the last to the top, the first down) and rewords one, as steps of their own
  await E(([c0, c2, c3]) => { const st = window.__editor.store; st.run(() => { st.patch(c3, { y: -80 }); st.patch(c0, { y: 400 }); st.patch(c2, { text: "#3 Acme invoices API (after #2)" }); }); st.emit(); }, [c0, c2, c3]);
  const mine = { c0: await shape(c0), c2: await shape(c2), c3: await shape(c3) };
  check("what the person changes is marked theirs", (await mark(c0)) && (await mark(c2)) && (await mark(c3)) && !(await mark(c1)));
  await shot?.("person-reordered");

  // the agent's script runs again: remove the whole board, and (only if that worked) draw it afresh from the file
  const script = `weld draw '${JSON.stringify({ remove: [c0, c1, c2, c3].map((x) => `#${x}`) })}' && weld draw '${JSON.stringify({ add: [{ ref: "again", kind: "rect", text: "#1 Acme sign-up page", x: 0, y: 0, w: 260, h: 60 }] })}'`;
  let ran = "", code = 0;
  try { ran = execFileSync("/bin/sh", ["-c", script], { cwd: dir, encoding: "utf8", env: { ...env, PATH: `${door.bin}:${process.env.PATH}` } }); } catch (e) { ran = `${e.stdout ?? ""}${e.stderr ?? ""}`; code = e.status; }
  check("removing the board fails saying the person changed 3 of them (so the script stops)", code !== 0 && /not removed: the person has changed 3 of these/.test(ran) && /force/.test(ran) && !/again = #/.test(ran), { code, ran });
  check("…the person's order and words are still there", JSON.stringify({ c0: await shape(c0), c2: await shape(c2), c3: await shape(c3) }) === JSON.stringify(mine));
  check("…the card the person never touched is removed, as asked", (await shape(c1)) === null);
  check("…and no second copy was drawn", (await E(() => Object.values(window.__editor.store.doc.shapes).filter((s) => s.text === "#1 Acme sign-up page").length)) === 1);

  // an agent moving a card the person placed leaves it there; what else it asks (a colour) is done; still theirs after
  const moved = draw({ change: [{ id: `#${c3}`, y: 0, tone: "green" }] });
  const c3now = await shape(c3);
  check("moving a card the person placed leaves it where they put it, and fails saying so", c3now.y === mine.c3.y && /left as the person left it/.test(moved) && /^\(failed\)/.test(moved), { c3now, moved });
  check("…while the colour asked for is changed, and the card is still theirs", c3now.tone === "green" && (await mark(c3)));

  // its own fresh work stays its own: drawn, changed by it, removed by it
  const fresh = ids(draw({ add: [{ ref: "n", kind: "rect", text: "#5 Acme webhooks", x: 400, y: 0, w: 260, h: 60 }] })).n;
  const ch = draw({ change: [{ id: `#${fresh}`, x: 420 }] });
  check("what the agent drew it may change", (await shape(fresh))?.x === 420, ch);
  const gone = draw({ remove: [`#${fresh}`] });
  check("…and remove", (await shape(fresh)) === null && !/failed/.test(gone), gone);

  // a line of the person's to a card: removing the card would take their line, so the card stays
  const two = ids(draw({ add: [{ ref: "a", kind: "rect", text: "API", x: 800, y: 0, w: 160, h: 60 }, { ref: "b", kind: "rect", text: "Billing", x: 800, y: 200, w: 160, h: 60 }, { ref: "x", kind: "rect", text: "Old", x: 1100, y: 0, w: 160, h: 60 }], connect: [{ from: "a", to: "x" }] }));
  await E(([b, x]) => { const st = window.__editor.store, d = st.doc, w = d.order.map((id) => d.shapes[id]).find((s) => s.kind === "arrow" && (s.a.bind?.id === x || s.b.bind?.id === x)); st.run(() => st.patch(w.id, w.a.bind?.id === x ? { a: { ...w.a, bind: { ...w.a.bind, id: b } } } : { b: { ...w.b, bind: { ...w.b.bind, id: b } } })); st.emit(); }, [two.b, two.x]);
  const viaLine = draw({ remove: [`#${two.b}`] });
  check("a card a line of the person's is joined to is not removed (it would take their line)", !!(await shape(two.b)) && /not removed/.test(viaLine), viaLine);
  const plain = draw({ remove: [`#${two.x}`] });
  check("…while one nothing of theirs depends on is", (await shape(two.x)) === null, plain);

  // undo: the person's move taken back is the agent's again; brought back (after an agent's recolour), theirs again
  const und = ids(draw({ add: [{ ref: "u", kind: "rect", text: "Undo me", x: 0, y: 600, w: 200, h: 60 }] })).u;
  await E((u) => { const st = window.__editor.store; st.run(() => st.patch(u, { x: 300 })); st.emit(); st.undo(); st.emit(); }, und);
  check("the person's move undone, the card is the agent's again", !(await mark(und)));
  draw({ change: [{ id: `#${und}`, tone: "red" }] });
  await E(() => { const st = window.__editor.store; st.redo(); st.emit(); });
  const re = draw({ remove: [`#${und}`] });
  check("…redone after the agent recoloured it, it is the person's again, and kept", !!(await shape(und)) && /not removed/.test(re), re);

  // the person writing in a card when the agent asks: nothing is done until they finish
  await E((c) => window.__editor.edit(c), c2);
  await wait(300);
  const busy = draw({ remove: [`#${c2}`], force: true });
  check("while the person writes in a card, the agent's change to it waits (told to try again)", /writing in|in the middle of changing/.test(busy) && /^\(failed\)/.test(busy) && !!(await shape(c2)), busy);
  await page.keyboard.press("Escape");
  await wait(300);

  // asked by the person ("start the board again"), it may: with force
  const forced = draw({ remove: [`#${c0}`], force: true });
  check("with force (the person asked), a card the person changed is removed", (await shape(c0)) === null && !/not removed/.test(forced), forced);

  // a drawing that plays: a change the person makes in one of its moments is kept there, marked as theirs
  const t = weld(["guide", "strip"]);
  const story = JSON.parse(t.slice(t.indexOf('{"story"'))).story;
  const g = /= #(\w+)/.exec(draw({ story }))?.[1];
  const part = await E((g) => { const d = window.__editor.store.doc; return d.order.find((id) => d.shapes[id]?.group === g && d.shapes[id].kind !== "arrow" && "x" in d.shapes[id]); }, g);
  // (redrawn in place while nobody has changed it: as before)
  const re0 = draw({ story: { ...story, replace: `#${g}` } });
  const gA = /= #(\w+)/.exec(re0)?.[1];
  check("a playing drawing nobody changed is redrawn in place as before", !/not done/.test(re0) && !!gA && gA !== g, re0);
  const partA = await E((g) => { const d = window.__editor.store.doc; return d.order.find((id) => d.shapes[id]?.group === g && d.shapes[id].kind !== "arrow" && "x" in d.shapes[id]); }, gA);
  await E((id) => { const st = window.__editor.store, s = st.doc.shapes[id]; st.run(() => st.patch(id, { x: s.x + 40 })); st.emit(); }, partA);
  const re1 = draw({ story: { ...story, replace: `#${gA}` } });
  check("redrawing a playing drawing the person changed is refused, and fails saying why", /not done: story: the person has changed/.test(re1) && /^\(failed\)/.test(re1), re1);
  const reF = draw({ story: { ...story, replace: `#${gA}` }, force: true });
  check("…and done when the person asked", !/not done/.test(reF) && !(await E((id) => !!window.__editor.store.doc.shapes[id], partA)), reF);
  const gB = /= #(\w+)/.exec(reF)?.[1];
  await E((g) => { const e = window.__editor, st = e.store; e.showMoment(g, 1); const id = st.doc.order.find((x) => st.doc.shapes[x]?.group === g && st.doc.shapes[x].kind !== "arrow" && "x" in st.doc.shapes[x]); const s = st.doc.shapes[id]; st.run(() => st.patch(id, { x: s.x + 40 })); st.emit(); e.showMoment(g, 0); }, gB);
  check("a change in another moment is kept in that moment, marked as the person's", await E((g) => { const d = window.__editor.store.doc; return d.scenes[g].at === 0 && d.scenes[g].moments[1].shapes.some((x) => x.edited); }, gB));
  void part;

  // and after the app is opened again: the person's change is still theirs, the agent's work still the agent's
  await wait(1500);
  await page.reload();
  await page.waitForFunction(() => !!window.__editor);
  await wait(1500);
  check("after a reload, the person's changes are still theirs, the agent's still not", (await mark(c3)) && !(await mark(two.a)));
  const after = draw({ remove: [`#${c3}`] });
  check("…and kept", /not removed/.test(after) && !!(await shape(c3)), after);
};
