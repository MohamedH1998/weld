// What the person changes on a drawing an agent made is theirs: an agent that removes or redraws that drawing (a script
// that redraws a board from a file, say) leaves the person's changes standing and is told why, unless the person asked.
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
  const weld = (args, input) => {
    try { return execFileSync(path.join(door.bin, "weld"), args, { cwd: dir, encoding: "utf8", input, env: { ...process.env, WELD_URL: door.url, WELD_TOKEN: door.key, WELD_FROM: T } }); }
    catch (e) { return `(failed) ${e.stdout ?? ""}${e.stderr ?? ""}`; }
  };
  const draw = (ops) => weld(["draw", "-"], JSON.stringify(ops));
  const ids = (said) => Object.fromEntries([...said.matchAll(/^\s*(\S+) = #(\w+)/gm)].map((m) => [m[1], m[2]]));
  const shape = (id) => E((id) => { const s = window.__editor.store.doc.shapes[id]; return s ? { x: s.x, y: s.y, text: s.text, tone: s.tone } : null; }, id);

  // an agent draws a little ticket board: four cards in a column, in the file's order
  const cards = ["#1 Acme sign-up page", "#2 Acme billing settings", "#3 Acme invoices API", "#4 Acme search"];
  const made = ids(draw({ add: cards.map((text, i) => ({ ref: `c${i}`, kind: "rect", text, x: 0, y: i * 80, w: 260, h: 60 })) }));
  check("(the agent draws four cards)", Object.keys(made).length === 4, made);
  const [c0, c1, c2, c3] = ["c0", "c1", "c2", "c3"].map((k) => made[k]);

  // the person reorders them (the last to the top, the first down) and rewords one, as steps of their own
  await E(([c0, c2, c3]) => {
    const st = window.__editor.store;
    st.run(() => { st.patch(c3, { y: -80 }); st.patch(c0, { y: 400 }); st.patch(c2, { text: "#3 Acme invoices API (after #2)" }); });
    st.emit();
  }, [c0, c2, c3]);
  const mine = { c0: await shape(c0), c2: await shape(c2), c3: await shape(c3) };
  await shot?.("person-reordered");

  // the agent's script runs again: remove the whole board and draw it afresh from the file
  const again = draw({ remove: [c0, c1, c2, c3].map((x) => `#${x}`) });
  check("removing the board leaves the cards the person changed, and says why", /not removed: the person has changed 3 of these/.test(again) && /force/.test(again), again);
  check("…the person's order and words are still there", JSON.stringify({ c0: await shape(c0), c2: await shape(c2), c3: await shape(c3) }) === JSON.stringify(mine), { now: { c0: await shape(c0), c2: await shape(c2), c3: await shape(c3) }, mine });
  check("…and the card the person never touched is removed, as asked", (await shape(c1)) === null);

  // an agent moving a card the person placed puts it nowhere new; what else it asks (a colour) is done
  const moved = draw({ change: [{ id: `#${c3}`, y: 0, tone: "green" }] });
  const c3now = await shape(c3);
  check("moving a card the person placed leaves it where they put it, and says so", c3now.y === mine.c3.y && /left as the person left it/.test(moved), { c3now, moved });
  check("…while the colour asked for is changed", c3now.tone === "green", c3now);

  // its own fresh work stays its own: drawn, changed by it, removed by it
  const fresh = ids(draw({ add: [{ ref: "n", kind: "rect", text: "#5 Acme webhooks", x: 400, y: 0, w: 260, h: 60 }] })).n;
  draw({ change: [{ id: `#${fresh}`, x: 420 }] });
  const gone = draw({ remove: [`#${fresh}`] });
  check("what the agent drew and changed itself it may remove", (await shape(fresh)) === null && !/not removed/.test(gone), gone);

  // asked by the person ("start the board again"), it may: with force
  const forced = draw({ remove: [`#${c0}`], force: true });
  check("with force (the person asked), a card the person changed is removed", (await shape(c0)) === null && !/not removed/.test(forced), forced);

  // a drawing that plays: the person moves a part, and a redraw in place is refused until asked
  const t = weld(["guide", "strip"]);
  const story = JSON.parse(t.slice(t.indexOf('{"story"'))).story;
  const said = draw({ story });
  const g = /= #(\w+)/.exec(said)?.[1];
  const part = await E((g) => { const d = window.__editor.store.doc; return d.order.find((id) => d.shapes[id]?.group === g && "x" in d.shapes[id] && d.shapes[id].kind !== "arrow"); }, g);
  await E((id) => { const st = window.__editor.store, s = st.doc.shapes[id]; st.run(() => st.patch(id, { x: s.x + 40 })); st.emit(); }, part);
  const re = draw({ story: { ...story, replace: `#${g}` } });
  check("redrawing a playing drawing the person changed is refused, and says why", /not done: story: the person has changed/.test(re) && (await E((id) => !!window.__editor.store.doc.shapes[id], part)), re);
  const reForced = draw({ story: { ...story, replace: `#${g}` }, force: true });
  check("…and done when the person asked", !/not done/.test(reForced) && !(await E((id) => !!window.__editor.store.doc.shapes[id], part)), reForced);
  // an untouched drawing is redrawn in place as before
  const g2 = /= #(\w+)/.exec(reForced)?.[1];
  const re2 = draw({ story: { ...story, replace: `#${g2}` } });
  check("a drawing nobody changed is redrawn in place as before", !/not done/.test(re2), re2);

  // and the marks survive a reload: the person's change is still theirs after the app is opened again
  const mark0 = await E((id) => window.__editor.store.doc.shapes[id]?.drawnAs, c3);
  await page.reload();
  await page.waitForFunction(() => !!window.__editor);
  await wait(1200);
  const after = draw({ remove: [`#${c3}`] });
  check("after a reload, the person's change is still kept", /not removed/.test(after) && !!(await shape(c3)), after);
};
