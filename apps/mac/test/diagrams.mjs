// The board's diagrams: an accepted diagram put down from the library's Diagrams tab plays and is kept; every mark the
// board knows draws; the kinds the board no longer offers still draw where an older board has them; live things are
// untouched beside it all.
//   WELD_SEED=1 node scripts/shot.mjs out/diagrams test/diagrams.mjs
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, ok, extra) => console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && extra !== undefined ? ` -> ${JSON.stringify(extra).slice(0, 400)}` : ""}`);

export default async ({ page, shot }) => {
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await wait(1500);

  // the library has a Diagrams tab, and what it offers can be put down
  await page.getByRole("button", { name: "More shapes" }).first().click();
  await wait(300);
  const tabs = await page.getByRole("tab").allTextContents();
  check("the library offers Shapes, Patterns and Diagrams", ["Shapes", "Patterns", "Diagrams"].every((t) => tabs.includes(t)), tabs);
  await page.getByRole("tab", { name: "Diagrams" }).click();
  await wait(300);
  const offered = await page.locator('[role="group"][aria-label="Diagrams"] button').count();
  check("…with the accepted diagrams in it", offered >= 15, offered);
  await shot("library-diagrams");
  await page.locator('[role="group"][aria-label="Diagrams"] button').first().click();
  await wait(200);
  // (on bare board: away from the thread, page and terminal, which stand over whatever lies under them)
  await E(() => { const s = window.__editor.store; s.cam = { x: -6000, y: -6000, z: 1 }; s.emit(); });
  await wait(200);
  const before = await E(() => Object.keys(window.__editor.store.doc.scenes ?? {}).length);
  await page.mouse.click(700, 420);
  await wait(800);
  const placed = await E(() => { const s = window.__editor.store; const scenes = s.doc.scenes ?? {}; const g = Object.keys(scenes).at(-1); return { scenes: Object.keys(scenes).length, moments: g ? scenes[g].moments.length : 0, g }; });
  check("a diagram put down from it moves (its moments come with it)", placed.scenes === before + 1 && placed.moments > 1, placed);
  await shot("diagram-placed");

  // it plays, and only it moves
  const g = placed.g;
  await E((g) => { const e = window.__editor; e.store.select(e.store.doc.order.filter((id) => e.store.doc.shapes[id].group === g)); e.store.emit(); }, g);
  await wait(300);
  const play = page.getByRole("button", { name: /^Play/ }).first();
  check("its moments show, with a Play button", await play.isVisible().catch(() => false));
  await play.click().catch(() => {});
  await wait(1600);
  check("…and it plays", await E(() => !!window.__editor.playing));
  await shot("diagram-playing");
  await page.keyboard.press("Escape");
  await wait(400);

  // every mark the board knows draws (one of each, put down by its kind's own size), with no error
  const kinds = await E(() => {
    const e = window.__editor, s = e.store;
    // (the kinds a click can make: the library's, and the welded and wiring ones it groups)
    const all = ["rect", "ellipse", "diamond", "card", "machine", "panel", "pill", "boundary", "frame", "glyph", "meter", "bars", "queue", "junction", "button", "timer", "window", "wave", "axis", "plot", "rule", "hatch", "guide", "parts", "ticks", "legend", "timeline", "tank", "segments", "units", "gap", "postings", "stair", "arc", "spiral", "lattice", "cells", "plane", "comb", "columns", "scatter", "levels", "belt", "shingles", "wheel", "walls", "threshold", "ratchet", "overlap", "field", "interval", "fence", "ringbuf", "wall", "wrap", "tether", "tokens", "break", "trail", "jaws", "reaches", "tries", "cone", "rider", "trie", "spans", "minmax", "countdown", "orbit", "bins", "ripple", "fingerprint", "loop", "roulette", "wells", "icicle", "wedge", "callstack", "floor", "staple", "odometer", "dial"];
    const put = [];
    all.forEach((k, i) => put.push({ id: `mark-${k}`, kind: k, x: 3000 + (i % 10) * 420, y: 3000 + Math.floor(i / 10) * 360, w: 320, h: 220, text: k, tone: "ink", fill: "none" }));
    s.run(() => s.put(...put));
    s.emit();
    return all.length;
  });
  await E(() => { const e = window.__editor; e.fit([...Object.keys(e.store.doc.shapes)].filter((id) => id.startsWith("mark-"))); });
  await wait(1200);
  check(`every mark draws (${kinds} kinds), with no page error`, !errors.length, errors);
  await shot("marks");

  // the kinds the board no longer offers: an older board's store, table, page, person, trace, tape, lock and switch
  await E(() => {
    const s = window.__editor.store, old = ["store", "table", "page", "person", "trace", "tape", "lock", "switch"];
    s.run(() => s.put(...old.map((k, i) => ({ id: `old-${k}`, kind: k, x: -3000 + i * 260, y: -3000, w: k === "switch" ? 44 : 180, h: k === "switch" ? 24 : 100, text: k === "table" ? "id\nname\nemail" : k, tone: "ink", fill: "none" }))));
    s.emit();
  });
  await E(() => { const e = window.__editor; e.fit([...Object.keys(e.store.doc.shapes)].filter((id) => id.startsWith("old-"))); });
  await wait(800);
  await shot("legacy");
  const offeredOld = await E(() => [...document.querySelectorAll("[aria-label]")].map((n) => n.getAttribute("aria-label")).filter((l) => /^(Store|Table|Person|Trace|Tape|Lock|Switch)$/.test(l ?? "")));
  check("an older board's retired kinds still draw, with no page error", !errors.length, errors);
  check("…and the library does not offer them", !offeredOld.length, offeredOld);

  // a severed wire and a mark whose levels go below zero, as stories make them
  await E(() => {
    const s = window.__editor.store;
    s.run(() => s.put(
      { id: "sev-a", kind: "card", x: -6000, y: 4000, w: 120, h: 56, text: "A", tone: "ink", fill: "none" },
      { id: "sev-b", kind: "card", x: -5700, y: 4000, w: 120, h: 56, text: "B", tone: "ink", fill: "none" },
      { id: "sev-w", kind: "arrow", a: { x: 0, y: 0, bind: { id: "sev-a", ax: 1, ay: 0.5 } }, b: { x: 0, y: 0, bind: { id: "sev-b", ax: 0, ay: 0.5 } }, text: "", route: "straight", heads: "end", tone: "ink", cut: 1, dangling: true },
      { id: "neg-l", kind: "icicle", x: -6000, y: 4300, w: 360, h: 200, text: "", tone: "ink", fill: "none", levels: [1, 0, -1, 1, 0, 0], value: 0 },
    ));
    s.emit();
  });
  // kept: after the window loads afresh, the diagram keeps its moments, the marks and old kinds their kinds
  await wait(1500);
  await page.reload();
  await page.waitForFunction(() => !!window.__editor);
  await wait(1800);
  const kept = await E((g) => { const d = window.__editor.store.doc; return { moments: d.scenes?.[g]?.moments.length ?? 0, marks: Object.keys(d.shapes).filter((id) => id.startsWith("mark-")).length, old: Object.values(d.shapes).filter((s) => s.id.startsWith("old-")).map((s) => s.kind).sort().join(), live: Object.values(d.shapes).filter((s) => ["thread", "terminal", "browser"].includes(s.kind)).length }; }, g);
  check("after a reload the diagram keeps its moments", kept.moments === placed.moments, kept);
  check("…every mark is kept", kept.marks === kinds, kept);
  check("…the retired kinds are kept as they were", kept.old === "lock,page,person,store,switch,table,tape,trace", kept);
  check("…and the live things on the board are still there", kept.live >= 2, kept);
  const sev = await E(() => { const d = window.__editor.store.doc; return { cut: d.shapes["sev-w"]?.cut, dangling: d.shapes["sev-w"]?.dangling, levels: d.shapes["neg-l"]?.levels }; });
  check("…a severed wire stays severed, its head left hanging", sev.cut === 1 && sev.dangling === true, sev);
  check("…and levels below zero are kept", JSON.stringify(sev.levels) === "[1,0,-1,1,0,0]", sev);
  check("no page errors at all", !errors.length, errors);
};
