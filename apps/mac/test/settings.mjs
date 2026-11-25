// Settings: the agents listed, one of your own added by the line that starts it (with a setting before it), refused
// when it isn't there, removed, and the sheet closed with Escape.
// Run: WELD_SEED=0 node scripts/shot.mjs <outDir> test/settings.mjs
import path from "node:path";
const MOCK = path.resolve("test/mock-acp-agent.mjs");
const say = (ok, what, more) => console.log(`${ok ? "ok  " : "FAIL"} ${what}${more !== undefined ? ` (${JSON.stringify(more)})` : ""}`);
export default async ({ page, shot }) => {
  const rows = () => page.evaluate(() => [...document.querySelectorAll(".settings-row")].map((r) => r.textContent));
  const mine = () => page.evaluate(() => window.weld.agentList().filter((a) => a.kind === "command").map((a) => ({ id: a.id, name: a.name })));
  await page.evaluate(() => window.dispatchEvent(new Event("weld:settings")));
  await page.waitForTimeout(300);
  say(await page.isVisible(".settings"), "Settings opens");
  const listed = await rows();
  say(["Claude", "Codex"].every((n) => listed.some((r) => r.startsWith(n) || r.includes(n))), "…listing the agents", listed);
  say(!(await page.evaluate(() => [...document.querySelectorAll(".ask-menu button, .live-menu button")].some((b) => /Add an ACP agent/.test(b.textContent)))), "the agent menus no longer offer to add one");
  // refused: a command that isn't there
  await page.fill(".settings-add input", "no-such-agent-here acp");
  await page.click(".settings-go");
  await page.waitForTimeout(300);
  const err = await page.evaluate(() => document.querySelector(".settings-error")?.textContent ?? "");
  say(/isn't an executable/.test(err), "a command that isn't there is said", err);
  say((await mine()).length === 0, "…and nothing is added");
  // added: quoted path, an argument, and a setting before it
  await page.fill(".settings-add input", `MOCK_KEY=$HOME "${process.execPath}" "${MOCK}"`);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  const added = await mine();
  say(added.length === 1 && added[0].name === "Mock-acp-agent", "one line adds it, named after what it runs", added);
  say((await rows()).some((r) => r.includes("Remove")), "…and it is listed with Remove");
  say(await page.evaluate(() => (document.querySelector(".settings-add input")?.value ?? "x") === ""), "…the field emptied for the next");
  await shot("settings");
  // offered in the bar's agent menu
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  say(!(await page.isVisible(".settings")), "Escape closes it");
  await page.click(".ask-row .live-chip >> nth=0");
  await page.waitForTimeout(200);
  say(await page.evaluate(() => [...document.querySelectorAll(".ask-menu button")].some((b) => /Mock-acp-agent/.test(b.textContent))), "the bar's agent menu offers it");
  await page.keyboard.press("Escape");
  // removed
  await page.evaluate(() => window.dispatchEvent(new Event("weld:settings")));
  await page.waitForTimeout(300);
  await page.click(".settings-remove");
  await page.waitForTimeout(300);
  say((await mine()).length === 0 && !(await rows()).some((r) => r.includes("Remove")), "Remove takes it away");
};
