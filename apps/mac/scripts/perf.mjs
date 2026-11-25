// Measures how the board keeps up: a crowded board is panned, zoomed, written to and flooded,
// and the time between frames is reported for each.
// usage: node scripts/shot.mjs <outDir> scripts/perf.mjs
import http from "node:http";

const [THREADS, TERMINALS, PAGES] = (process.env.MIX || "6,3,3").split(",").map(Number), TURNS = 30;

const para = (n) =>
  `## Step ${n}\n\nI looked at \`src/app/thing-${n}.ts\` and the **loader** beside it. The change is small:\n\n- move the check before the read\n- keep the old name as an alias\n- drop the unused flag\n\n\`\`\`ts\nexport function load${n}(id: string) {\n  const found = cache.get(id);\n  if (found) return found;\n  return read(id).then((v) => (cache.set(id, v), v));\n}\n\`\`\`\n\n| file | change |\n| --- | --- |\n| thing-${n}.ts | check moved |\n| loader.ts | alias kept |\n\nNothing else calls it, so this is safe to land on its own.`;

export default async ({ app, page, shot }) => {
  const server = http.createServer((_q, r) => {
    r.setHeader("content-type", "text/html");
    r.end(`<title>Bench</title><body style="font:16px system-ui;margin:40px">${Array.from({ length: 200 }, (_, i) => `<p>Row ${i}: the quick brown fox jumps over the lazy dog.</p>`).join("")}</body>`);
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const send = (channel, ...args) => app.evaluate(({ BrowserWindow }, [c, a]) => BrowserWindow.getAllWindows()[0].webContents.send(c, ...a), [channel, args]);

  // a crowded board
  const ids = await E(
    ({ THREADS, TERMINALS, PAGES, url }) => {
      const ed = window.__editor, s = ed.store;
      for (const id of [...s.doc.order]) s.remove?.([id]);
      const out = { thread: [], terminal: [], browser: [] };
      let n = 0;
      const mk = (kind, col, row, live) => {
        const id = `bench${n++}`;
        s.put({ id, kind, x: col * 560, y: row * 700, w: 520, h: 660, text: "", tone: "ink", fill: "none", live });
        out[kind].push(id);
      };
      for (let i = 0; i < THREADS; i++) mk("thread", i, 0, { cwd: "/tmp" });
      for (let i = 0; i < TERMINALS; i++) mk("terminal", i, 1, { cwd: "/tmp" });
      for (let i = 0; i < PAGES; i++) mk("browser", TERMINALS + i, 1, { url });
      s.select([]);
      s.emit();
      ed.fit();
      return out;
    },
    { THREADS, TERMINALS, PAGES, url },
  );
  await page.waitForTimeout(2500);
  for (const id of ids.thread)
    for (let t = 0; t < TURNS; t++) {
      await send("thread:event", id, { t: "item", item: { id: `${id}u${t}`, kind: "user", text: `Please do part ${t}` } });
      await send("thread:event", id, { t: "item", item: { id: `${id}t${t}`, kind: "tool", name: "Read", title: `/tmp/thing-${t}.ts`, status: "done" } });
      await send("thread:event", id, { t: "item", item: { id: `${id}a${t}`, kind: "text", text: para(t) } });
    }
  await page.waitForTimeout(1500);

  // drives one wheel event a frame and records the time between frames
  const run = (name, opts) =>
    E(
      ({ name, opts }) =>
        new Promise((done) => {
          const surface = document.querySelector("canvas").parentElement;
          const gaps = [];
          let last = performance.now(), i = 0;
          const step = (now) => {
            gaps.push(now - last);
            last = now;
            if (i >= opts.frames) {
              gaps.shift();
              gaps.sort((a, b) => a - b);
              const at = (p) => gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * p))];
              const base = gaps[Math.floor(gaps.length * 0.1)];
              return done({ name, frames: gaps.length, p50: +at(0.5).toFixed(1), p95: +at(0.95).toFixed(1), max: +gaps[gaps.length - 1].toFixed(1), slow: gaps.filter((g) => g > base * 1.6).length });
            }
            if (opts.wheel) {
              const w = opts.wheel(i, opts.frames);
              surface.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: innerWidth / 2, clientY: innerHeight / 2, ...w }));
            }
            i++;
            requestAnimationFrame(step);
          };
          opts.wheel = opts.wheel ? new Function("i", "n", opts.wheel) : null;
          requestAnimationFrame(step);
        }),
      { name, opts },
    );
  const PAN = "return { deltaX: Math.sin(i / 20) * 30, deltaY: Math.cos(i / 20) * 30 }";
  const ZOOM = "return { deltaY: (i < n / 2 ? 1 : -1) * 4, ctrlKey: true }";
  const fit = (z) => E((z) => { const ed = window.__editor; ed.fit(); if (z) ed.zoomAt({ x: innerWidth / 2, y: innerHeight / 2 }, z / ed.store.cam.z); }, z);
  const results = [];
  if (process.env.CSS) await page.addStyleTag({ content: process.env.CSS });
  const only = process.env.ONLY;
  if (process.env.GRID === "0") await E(() => { window.__editor.store.grid = false; });
  const rec = async (name, opts) => { if (only && !name.includes(only)) return; const r = await run(name, opts); results.push(r); console.log(JSON.stringify(r)); };

  await fit();
  await page.waitForTimeout(600);
  await rec("still", { frames: 120 });
  await rec("pan, far", { frames: 240, wheel: PAN });
  await fit(0.6);
  await page.waitForTimeout(600);
  await shot("near");
  await rec("pan, near", { frames: 240, wheel: PAN });
  await fit(1.2);
  await rec("zoom, near", { frames: 240, wheel: "return { deltaY: (i < n / 2 ? 1 : -1) * 0.8, ctrlKey: true }" });
  await fit(0.4);
  await rec("zoom, far", { frames: 240, wheel: "return { deltaY: (i < n / 2 ? 1 : -1) * 0.8, ctrlKey: true }" });
  await fit(0.6);
  await rec("zoom, across the far line", { frames: 240, wheel: "return { deltaY: (i < n / 2 ? 1 : -1) * 0.8, ctrlKey: true }" });
  await E((id) => { const s = window.__editor.store; s.select([id]); s.emit(); }, ids.thread[0]);
  await page.waitForTimeout(300);
  await rec("pan, one in hand", { frames: 240, wheel: PAN });
  // agents at work (their marks on the board), and a thread connected to a big drawing, in hand, while the board moves
  await E((t0) => {
    const s = window.__editor.store, t = s.doc.shapes[t0], sh = [];
    for (let i = 0; i < 40; i++) sh.push({ id: `pd${i}`, kind: "rect", x: t.x + (i % 8) * 200, y: t.y - 900 + Math.floor(i / 8) * 150, w: 160, h: 70, text: `node ${i}`, tone: "ink", fill: "none" });
    for (let i = 1; i < 40; i++) sh.push({ id: `pa${i}`, kind: "arrow", text: i % 3 ? "" : "calls", route: "straight", heads: "end", tone: "ink", a: { x: 0, y: 0, bind: { id: `pd${i - 1}`, ax: 1, ay: 0.5 } }, b: { x: 0, y: 0, bind: { id: `pd${i}`, ax: 0, ay: 0.5 } } });
    s.run(() => s.put(...sh));
    s.applyForeign([], [{ id: t0, change: { live: { ...t.live, sees: ["drawing:pd0"] } } }], []);
  }, ids.thread[0]);
  for (const tid of ids.thread.slice(0, 3)) {
    const t = await E((id) => window.weld.thread.get(id), tid);
    await send("thread:event", tid, { t: "meta", meta: { ...t.meta, status: "running", startedAt: Date.now() } });
    await send("thread:event", tid, { t: "item", item: { id: `${tid}run`, kind: "tool", name: "Bash", title: "pnpm test", status: "running" } });
  }
  await E((id) => { const s = window.__editor.store; s.select([id]); s.emit(); }, ids.thread[0]);
  await page.waitForTimeout(500);
  await rec("pan, agents at work, a connection in hand", { frames: 240, wheel: PAN });
  if (process.env.NOSEL) await E(() => { const s = window.__editor.store; s.select([]); s.emit(); });
  await rec("zoom, agents at work", { frames: 240, wheel: "return { deltaY: (i < n / 2 ? 1 : -1) * 0.8, ctrlKey: true }" });
  await E(() => { const s = window.__editor.store; s.select([]); s.emit(); });

  // an agent writing: small pieces, many a second
  const write = async (id, pieces) => {
    await send("thread:event", id, { t: "item", item: { id: `${id}live`, kind: "text", text: "", streaming: true } });
    const words = para(99).split(/(?<= )/);
    for (let i = 0; i < pieces; i++) await send("thread:event", id, { t: "delta", id: `${id}live`, text: words[i % words.length] });
  };
  let w = write(ids.thread[0], 900);
  await rec("one thread writing", { frames: 300 });
  await w;
  w = Promise.all(ids.thread.slice(1, 5).map((id) => write(id, 500)));
  await rec("four writing, panning", { frames: 300, wheel: PAN });
  await w;

  // a shell printing as fast as it can
  await E((id) => window.weld.pty.write(id, "seq 1 400000\r"), ids.terminal[0]);
  await page.waitForTimeout(200);
  await rec("terminal flood", { frames: 240 });
  await rec("terminal flood, panning", { frames: 240, wheel: PAN });
  await E((id) => window.weld.pty.write(id, "\u0003"), ids.terminal[0]);
  await shot("end");
  console.table(results);
  server.close();
};
