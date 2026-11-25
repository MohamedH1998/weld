// Pans and zooms /catalogue with the wheel in a real (headed) Chrome: frame gaps and where the time goes. Optional URL argument (e.g. the live site).
import { chromium } from "playwright-core";
const url = process.argv[2] ?? "http://localhost:3100/catalogue";
const browser = await chromium.launch({ channel: "chrome", headless: false });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage();
const t0 = Date.now();
await page.goto(url);
await page.waitForFunction(() => { const c = document.querySelector("canvas"); return !!c; });
// (the layout is done when the camera has been put on the first subjects)
await page.waitForLoadState("networkidle"); await page.waitForTimeout(3000);
console.log("open → settled", Date.now() - t0, "ms (±300)");
await page.waitForTimeout(800);
const cdp = await page.context().newCDPSession(page);
await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
const run = async (label, act) => {
  await page.evaluate(() => { window.__ts = []; window.__on = true; const f = (t) => { window.__ts.push(t); if (window.__on) requestAnimationFrame(f); }; requestAnimationFrame(f); });
  await cdp.send("Profiler.start");
  await act();
  const { profile } = await cdp.send("Profiler.stop");
  const ts = await page.evaluate(() => { window.__on = false; return window.__ts; });
  const d = ts.slice(1).map((t, i) => t - ts[i]).sort((a, b) => a - b);
  const byId = new Map(profile.nodes.map((n) => [n.id, n])), self = new Map();
  profile.samples.forEach((id, i) => { const n = byId.get(id); const k = `${n.callFrame.functionName || "(anon)"} ${n.callFrame.url.split("/").pop().split("?")[0]}:${n.callFrame.lineNumber}`; self.set(k, (self.get(k) ?? 0) + (profile.timeDeltas[i] ?? 0)); });
  console.log(`\n${label}: ${d.length} frames, median ${d[d.length >> 1]?.toFixed(1)} ms, p90 ${d[Math.floor(d.length * 0.9)]?.toFixed(1)} ms, max ${d[d.length - 1]?.toFixed(0)} ms`);
  console.log([...self].filter(([k]) => !k.startsWith("(idle)")).sort((a, b) => b[1] - a[1]).slice(0, 16).map(([k, us]) => `${(us / 1000).toFixed(0).padStart(6)} ms  ${k}`).join("\n"));
};
await page.mouse.move(720, 450);
await run("pan at the opening zoom", async () => { for (let i = 0; i < 80; i++) { await page.mouse.wheel(30, 18); await page.waitForTimeout(8); } });
await run("zoom out to the whole board", async () => { await page.keyboard.down("Control"); for (let i = 0; i < 60; i++) { await page.mouse.wheel(0, 8); await page.waitForTimeout(8); } await page.keyboard.up("Control"); });
await run("pan zoomed out", async () => { for (let i = 0; i < 80; i++) { await page.mouse.wheel(30, 18); await page.waitForTimeout(8); } });
await run("hover across, zoomed out", async () => { for (let i = 0; i < 80; i++) { await page.mouse.move(200 + i * 13, 200 + (i % 20) * 25); await page.waitForTimeout(8); } });

await browser.close();
