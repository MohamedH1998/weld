// node checks/theme.mjs [origin] — light and dark: the bar's button steps through Match system → Light → Dark, the choice is
// remembered, and a remembered dark board is dark from the first paint (no flash of white); and the share card closes as
// people expect (a press beside the Shared button closes it; a press in the card closes its menu but not the card).
import { chromium } from "playwright-core";
const origin = process.argv[2] ?? "http://localhost:3100";
let pass = 0, fail = 0;
const ok = (name, cond, more = "") => { cond ? pass++ : fail++; console.log(`${cond ? "ok  " : "FAIL"} ${name}${more ? "  " + more : ""}`); };
const b = await chromium.launch({ channel: "chrome" });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: "light", permissions: ["clipboard-read", "clipboard-write"] });
// (what the page's own <html> says as soon as the document exists, before the app's code has run)
await ctx.addInitScript(() => document.addEventListener("DOMContentLoaded", () => { window.__firstMode = document.documentElement.dataset.mode; }, { once: true }));
const p = await ctx.newPage();
const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
const mode = () => p.evaluate(() => document.documentElement.dataset.mode);
await p.goto(`${origin}/?probe=1`); await p.waitForFunction(() => window.__editor, null, { timeout: 60000 });
ok("with nothing chosen, it follows the system (light here)", (await mode()) === "light");
const theme = p.getByRole("button", { name: /^Theme:/ });
await theme.click(); ok("the theme button chooses Light", (await mode()) === "light" && /Theme: Light/.test(await theme.getAttribute("aria-label")));
await theme.click(); ok("…then Dark", (await mode()) === "dark");
await p.reload(); await p.waitForFunction(() => window.__editor, null, { timeout: 60000 });
ok("Dark is remembered", (await mode()) === "dark");
ok("…and is there from the first paint, though the system is light", (await p.evaluate(() => window.__firstMode)) === "dark", String(await p.evaluate(() => window.__firstMode)));
await theme.click(); ok("…then back to matching the system", (await mode()) === "light" && /Match system/.test(await theme.getAttribute("aria-label")));
// the board's menu offers the same choice
await p.mouse.click(640, 420, { button: "right" });
await p.getByRole("menuitem", { name: /Theme: dark/i }).click().catch(() => p.getByText("Theme: dark").click());
ok("the board's menu chooses Dark too", (await mode()) === "dark");
// the share card: open it, press beside the button, above the card
await p.evaluate(() => { const s = window.__editor.store; s.run(() => s.put({ id: "mine", kind: "rect", x: 0, y: 0, w: 160, h: 80, text: "Mine", tone: "ink", fill: "none" })); });
await p.getByRole("button", { name: "Share" }).click();
await p.waitForURL(/\/b\//, { timeout: 20000 });
await p.waitForSelector('[role="dialog"][aria-label="Share"]');
const card = await p.locator('[role="dialog"][aria-label="Share"]').boundingBox();
const pill = await p.getByRole("button", { name: "Shared" }).boundingBox();
// in the menu, then a press elsewhere in the card
await p.getByRole("button", { name: "Link options" }).click();
ok("the card's menu opens", await p.getByRole("menuitem", { name: "New link…" }).isVisible());
await p.getByText("Connect an agent").click();
ok("a press elsewhere in the card closes its menu", !(await p.getByRole("menuitem", { name: "New link…" }).isVisible().catch(() => false)));
ok("…and leaves the card open", await p.locator('[role="dialog"][aria-label="Share"]').isVisible());
await p.mouse.click(card.x + 20, pill.y + pill.height / 2);
ok("a press beside the Shared button, above the card, closes it", !(await p.locator('[role="dialog"][aria-label="Share"]').isVisible().catch(() => false)));
ok("no page errors", !errs.length, errs.join(" | "));
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
