// Making a drawing move by hand, start to finish, as someone would: draw, wire, Animate, add a moment, change it, play.
import { open } from "./lib.mjs";
let pass = 0, fail = 0; const ok = (n, c, x = "") => { c ? pass++ : fail++; console.log(`${c ? "ok  " : "FAIL"} ${n}${c ? "" : "  " + x}`); };
const { page, errs, close, drag } = await open({ w: 1200, h: 760 });
const S = () => page.evaluate(() => { const e = window.__editor, s = e.store, sc = Object.values(s.doc.scenes ?? {})[0]; const by = (t) => Object.values(s.doc.shapes).find((x) => x.text === t); return { at: sc?.at, n: sc?.moments.length, scope: !!e.scope, sel: s.sel.size, store: by("Store"), worker: by("Worker"), wires: Object.values(s.doc.shapes).filter((x) => x.kind === "arrow").map((w) => ({ away: !!w.away, run: w.run, to: s.doc.shapes[w.b.bind?.id]?.text })), ghosts: Object.keys(e.viewDoc?.(e.theme ?? undefined)?.shapes ?? {}).filter((k) => k.endsWith("~was")).length, playing: !!e.playing }; });
for (const [x, t] of [[250, "Client"], [600, "Worker"], [950, "Store"]]) { await page.keyboard.press("r"); await page.mouse.click(x, 300); await page.waitForTimeout(80); await page.keyboard.press("Enter"); await page.keyboard.type(t); await page.keyboard.press("Escape"); await page.keyboard.press("Escape"); }
await page.keyboard.press("a"); await drag(300, 300, 560, 300); await page.keyboard.press("Escape");
await page.keyboard.press("a"); await drag(650, 300, 910, 300); await page.keyboard.press("Escape");
await drag(120, 180, 1100, 420);
await page.getByRole("button", { name: /Animate/ }).first().click();
await page.getByRole("button", { name: "Add a moment", exact: true }).click(); await page.waitForTimeout(200);
let st = await S();
ok("three boxes, two wires, Animate, Add a moment: a second moment is on show, ready to change", st.n === 2 && st.at === 1 && st.scope && st.sel === 0, JSON.stringify({ n: st.n, at: st.at, scope: st.scope, sel: st.sel }));
await page.mouse.click(950, 300); await page.getByRole("button", { name: "Hide in this moment" }).click(); await page.waitForTimeout(1900); st = await S();
ok("hiding a box in this moment hides the wire that ran to it", st.store.away === true && st.wires.find((w) => w.to === "Store").away && !st.wires.find((w) => w.to === "Worker").away, JSON.stringify(st.wires));
await page.mouse.click(430, 300); await page.getByRole("button", { name: "Request", exact: true }).click(); await page.waitForTimeout(1900); st = await S();
ok("a wire can carry a request in this moment", st.wires.find((w) => w.to === "Worker").run === "pour", JSON.stringify(st.wires));
await page.getByRole("button", { name: "Add a moment", exact: true }).click(); await page.waitForTimeout(200);
await page.getByRole("button", { name: "Hidden in this moment" }).click(); await page.getByRole("menuitem").first().click(); await page.waitForTimeout(1900); st = await S();
ok("in a third moment, showing the box from the list brings its wire back with it", st.n === 3 && !st.store.away && st.wires.every((w) => !w.away), JSON.stringify({ n: st.n, store: st.store.away, wires: st.wires }));
await page.getByRole("tab", { name: "Moment 1" }).click(); await page.waitForTimeout(200); st = await S();
ok("the first moment is as it was drawn: everything there, nothing running", st.at === 0 && !st.store.away && st.wires.every((w) => !w.away && !w.run), JSON.stringify(st.wires));
await page.getByRole("button", { name: "Play", exact: true }).click(); await page.waitForTimeout(700);
ok("Play plays", (await S()).playing);
await page.mouse.click(80, 650); await page.waitForTimeout(200); st = await S();
ok("a press stops it, back on the moment it was left at", !st.playing && st.at === 0);
ok("no errors", errs.filter((e) => !e.includes("404")).length === 0, errs.join(" | "));
console.log(`\n${pass} passed, ${fail} failed`); await close();
