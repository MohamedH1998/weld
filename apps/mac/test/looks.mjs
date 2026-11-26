// Many pages open beside a conversation: `weld look` still answers, in good time, with every page in it.
//   node scripts/shot.mjs out/looks test/looks.mjs
import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, ok, extra) => console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && extra !== undefined ? ` -> ${JSON.stringify(extra).slice(0, 400)}` : ""}`);

export default async ({ app, page, out }) => {
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  await wait(2000);
  let T = await E(() => Object.values(window.__editor.store.doc.shapes).find((s) => s.kind === "thread")?.id);
  if (!T) {
    await E(() => window.__weldNewThread?.());
    await wait(500);
    T = await E(() => Object.values(window.__editor.store.doc.shapes).find((s) => s.kind === "thread")?.id);
  }
  check("(a conversation on the board)", !!T);
  if (!T) return;
  const dir = path.join(out, "data", "scratch", "looks");
  mkdirSync(dir, { recursive: true });
  await E(([T, dir]) => window.weld.thread.set(T, { mode: "full", cwd: dir }), [T, dir]);
  const door = await app.evaluate(({}, T) => ({ url: globalThis.__door.url, key: globalThis.__door.keyFor(T), bin: globalThis.__door.bin }), T);
  const weld = (args) => new Promise((resolve) => {
    const t0 = Date.now();
    execFile(path.join(door.bin, "weld"), args, { cwd: dir, encoding: "utf8", env: { ...process.env, WELD_URL: door.url, WELD_TOKEN: door.key, WELD_FROM: T } }, (e, so, se) => resolve({ ms: Date.now() - t0, text: e ? `(failed) ${so ?? ""}${se ?? ""}` : so }));
  });
  const N = 7;
  for (let i = 1; i <= N; i++) {
    const f = path.join(dir, `screen-${i}.html`);
    const rows = Array.from({ length: 400 }, (_, j) => `<tr><td>Acme order ${i}-${j}</td><td>${(j * 13.7).toFixed(2)}</td><td><button>Open</button></td></tr>`).join("");
    writeFileSync(f, `<!doctype html><title>Acme screen ${i}</title><body style="font:14px system-ui"><h1>Acme screen ${i}</h1><input placeholder="Search"><table>${rows}</table></body>`);
    const r = await weld(["open", `file://${f}`]);
    if (/failed/.test(r.text)) check(`open screen ${i}`, false, r.text);
  }
  for (let t = 0; t < 60; t++) {
    const n = await E(() => Object.values(window.__editor.store.doc.shapes).filter((s) => s.kind === "browser").length);
    if (n >= N) break;
    await wait(250);
  }
  await wait(4000);
  for (const [label, z] of [["close to", null], ["zoomed out", 0.2]]) {
    if (z) await E((z) => { const s = window.__editor.store; s.cam = { ...s.cam, z }; s.emit(); }, z);
    await wait(2500);
    const r = await weld(["look"]);
    const pages = (r.text.match(/<page /g) ?? []).length;
    const pics = (r.text.match(/Pictures: (.*)/)?.[1] ?? "").split(" ").filter(Boolean).length;
    console.log(`  ${label}: ${r.ms} ms, ${pages} pages, ${pics} pictures`);
    check(`${label}: weld look answers with all ${N} pages`, pages >= N && !/failed/.test(r.text), r.text.slice(0, 300));
    check(`${label}: in under 10 s`, r.ms < 10000, r.ms);
    // (seen from far off, every page is on screen: each has a picture, up to the four a look attaches)
    if (z) check(`${label}: four pictures attached`, pics === 4, pics);
  }
};
