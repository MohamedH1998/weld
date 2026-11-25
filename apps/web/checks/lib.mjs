// Drives the running dev server (pnpm dev) in headless Chrome.
import { chromium } from "playwright-core";
import { fileURLToPath } from "node:url";
// The engine is the package (packages/canvas), served by the dev server from where it lies: a check reaches one of its
// modules with __engine("render"), at the very address the app's own imports have, so both share one copy of it.
export const ENGINE = "/@fs" + fileURLToPath(new URL("../../../packages/canvas/src/", import.meta.url));
export const withEngine = (ctx) => ctx.addInitScript((base) => { window.__engine = (name) => import(`${base}${name}.ts`); }, ENGINE);
export async function open({ w = 1280, h = 800, fresh = true, dark = false, path = "/" } = {}) {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: dark ? "dark" : "light" });
  await withEngine(ctx);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message.slice(0, 300)));
  page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text().slice(0, 300)); });
  await page.goto("http://localhost:3100/", { waitUntil: "networkidle" });
  if (fresh) { await page.evaluate(() => localStorage.clear()); await page.goto("http://localhost:3100" + path, { waitUntil: "networkidle" }); }
  await page.evaluate(() => Promise.all([document.fonts.load('500 12px "DM Mono"'), document.fonts.load('400 12px "DM Mono"'), document.fonts.load('400 12px "Inter Tight"'), document.fonts.load('500 12px "Inter Tight"'), document.fonts.ready]));
  await page.waitForTimeout(600);
  const shot = async (n) => { await page.waitForTimeout(250); await page.screenshot({ path: new URL(`./shots/${n}.png`, import.meta.url).pathname }); };
  const drag = async (x1, y1, x2, y2, opts = {}) => {
    await page.mouse.move(x1, y1); await page.mouse.down();
    const n = opts.steps ?? 8;
    for (let i = 1; i <= n; i++) await page.mouse.move(x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n);
    if (opts.hold) await opts.hold();
    await page.mouse.up();
  };
  const doc = () => page.evaluate(() => { const e = window.__editor; const d = e.store.doc; return { n: d.order.length, sel: [...e.store.sel].length, tool: e.store.tool, editing: e.store.editing, cam: e.store.cam, shapes: d.order.map((id) => { const s = d.shapes[id]; return s.kind === "arrow" ? `arrow ${s.route} a:${s.a.bind ? "bound" : "free"} b:${s.b.bind ? "bound" : "free"} "${s.text}"` : `${s.kind} ${Math.round(s.x)},${Math.round(s.y)} ${Math.round(s.w)}x${Math.round(s.h)} "${s.text}"`; }) }; });
  return { browser, page, errs, shot, drag, doc, close: () => browser.close() };
}
