// A phone: touch only, 390 × 844. Taps, drags, double-tap, pinch and two-finger pan through real touch events.
import { chromium, devices } from "playwright-core";
import { withEngine } from "./lib.mjs";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ ...devices["iPhone 13"], defaultBrowserType: undefined });
await withEngine(ctx);
const page = await ctx.newPage(); const errs = [];
page.on("pageerror", (e) => errs.push(e.message.slice(0, 200))); page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("404")) errs.push(m.text().slice(0, 200)); });
await page.goto("http://localhost:3100/", { waitUntil: "networkidle" }); await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: "networkidle" }); await page.waitForTimeout(500);
const cdp = await ctx.newCDPSession(page);
const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
const tap = async (x, y) => { await touch("touchStart", [[x, y]]); await touch("touchEnd", []); await page.waitForTimeout(40); };
const swipe = async (x1, y1, x2, y2, n = 8) => { await touch("touchStart", [[x1, y1]]); for (let i = 1; i <= n; i++) { await touch("touchMove", [[x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n]]); await page.waitForTimeout(16); } await page.waitForTimeout(120); await touch("touchEnd", []); await page.waitForTimeout(60); };
const two = async (a1, b1, a2, b2, n = 8) => { await touch("touchStart", [a1]); await touch("touchStart", [a1, b1]); for (let i = 1; i <= n; i++) { const f = i / n; await touch("touchMove", [[a1[0] + (a2[0] - a1[0]) * f, a1[1] + (a2[1] - a1[1]) * f], [b1[0] + (b2[0] - b1[0]) * f, b1[1] + (b2[1] - b1[1]) * f]]); await page.waitForTimeout(16); } await touch("touchEnd", []); await page.waitForTimeout(80); };
const S = () => page.evaluate(() => { const e = window.__editor, s = e.store; return { shapes: s.doc.order.map((id) => s.doc.shapes[id]), sel: [...s.sel], tool: s.tool, editing: !!s.editing, cam: s.cam, g: e.g.type }; });
const shot = (n) => page.screenshot({ path: new URL(`./shots/mobile-${n}.png`, import.meta.url).pathname });
let pass = 0, fail = 0; const ok = (n, c, x = "") => { c ? pass++ : fail++; console.log(`${c ? "ok  " : "FAIL"} ${n}${c ? "" : "  " + x}`); };
const vp = page.viewportSize(); const W = vp.width, H = vp.height;
const fits = await page.evaluate(() => [...document.querySelectorAll('[role="toolbar"], .absolute.bottom-4')].map((el) => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && r.top >= 0; }));
ok("the tools and the zoom controls fit on the screen", fits.every(Boolean), JSON.stringify(fits));
await shot("1-empty");
// make a box: tap the tool, tap the board
const rect = await page.getByRole("button", { name: "Rectangle", exact: true }).boundingBox();
await tap(rect.x + rect.width / 2, rect.y + rect.height / 2); let st = await S(); ok("tapping a tool selects it", st.tool === "rect", st.tool);
await tap(W / 2, 300); st = await S(); ok("tapping the board places a box", st.shapes.length === 1 && st.tool === "select", JSON.stringify([st.shapes.length, st.tool]));
// double-tap to type
await tap(W / 2, 300); await tap(W / 2, 300); await page.waitForTimeout(100); st = await S(); ok("double-tap starts typing", st.editing);
await page.keyboard.type("Phone"); await shot("2-typing"); await tap(30, 430); st = await S(); ok("tapping away keeps the words", st.shapes[0].text === "Phone" && !st.editing, JSON.stringify(st.shapes[0]?.text));
// drag it
const x0 = st.shapes[0].x; await swipe(W / 2, 300, W / 2 + 60, 380); st = await S(); ok("a finger drags a box", Math.abs(st.shapes[0].x - x0 - 60) < 8 && st.g === "idle", `${st.shapes[0].x - x0}`);
// stubs show without hovering, and are big enough to hit
await tap(W / 2 + 60, 380); await page.waitForTimeout(80); await shot("3-selected");
const shown = await page.evaluate(() => window.__editor.overlay.onlyStub); ok("with a finger, every + shows on a selected box", shown === -1, `${shown}`);
const size = await page.getByRole("button", { name: "Rectangle", exact: true }).first().boundingBox(); ok("buttons are finger-sized", size.width >= 40 && size.height >= 40, JSON.stringify(size));
const stub = await page.evaluate(async () => { const R = await __engine("render"); const e = window.__editor, s = e.store, b = s.doc.shapes[s.doc.order[0]]; const p = R.visibleStubs(s.doc, b, s.cam.z)[1]; return p ? e.screen(p) : null; });
await tap(stub.x, stub.y); await page.waitForTimeout(100); st = await S(); ok("tapping a + adds a joined box", st.shapes.length === 3, `${st.shapes.length}`);
await page.keyboard.type("Next"); await tap(30, 430); await page.waitForTimeout(400); await tap(30, 430);
st = await S(); const n0 = st.shapes.length;
// pinch and two-finger pan
const z0 = st.cam.z; await two([150, 400], [240, 400], [90, 400], [300, 400]); st = await S(); ok("pinching out zooms in", st.cam.z > z0 * 1.5 && st.g === "idle", `${z0} → ${st.cam.z}`);
const c0 = st.cam; await two([150, 400], [240, 400], [150, 300], [240, 300]); st = await S(); ok("two fingers move the board", Math.abs(st.cam.y - c0.y) > 20 && Math.abs(st.cam.z - c0.z) < 0.05, JSON.stringify([c0, st.cam]));
ok("neither left anything behind", st.shapes.length <= n0 + 1 && st.sel.length <= 1, `${st.shapes.length} shapes, ${st.sel.length} selected`);
await page.evaluate(() => window.__editor.fit()); await page.waitForTimeout(350);
// resize by a corner with a finger
st = await S(); const b = st.shapes[0]; const corner = await page.evaluate((b) => window.__editor.screen({ x: b.x + b.w, y: b.y + b.h }), b);
const mid = await page.evaluate((b) => window.__editor.screen({ x: b.x + b.w / 2, y: b.y + b.h / 2 }), b); await tap(mid.x, mid.y);
await swipe(corner.x + 5, corner.y + 5, corner.x + 45, corner.y + 35); st = await S(); ok("a corner can be dragged by a finger that lands a little off it", st.shapes[0].w > b.w + 10, `${b.w} → ${st.shapes[0].w}`);
// press and hold for the menu
st = await S(); const m0 = await page.evaluate((b) => window.__editor.screen({ x: b.x + b.w / 2, y: b.y + b.h / 2 }), st.shapes[0]);
await touch("touchStart", [[m0.x, m0.y]]); await page.waitForTimeout(700); const menuOpen = await page.locator('[role="menu"]').count(); await touch("touchEnd", []); await shot("5-menu");
st = await S(); ok("a held finger opens the menu and moves nothing", menuOpen === 1 && st.g === "idle", `menus ${menuOpen}, gesture ${st.g}`);
await tap(30, 430); await page.waitForTimeout(150);
// move the toolbar by its grip
const bar = await page.locator('[role="toolbar"]').boundingBox(); await swipe(bar.x + 12, bar.y + 20, W - 10, 60, 10); await page.waitForTimeout(400);
const bar2 = await page.locator('[role="toolbar"]').boundingBox(); ok("the toolbar moves by its grip", bar2.y < 100, JSON.stringify(bar2)); await shot("4-docked");
console.log(`\n${pass} passed, ${fail} failed`, errs); await browser.close();
