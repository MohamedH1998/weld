// node checks/share.mjs [origin] — shared boards in the browser: Share makes a link; an agent's diagram appears live in two
// open browsers; an edit in one reaches the other and the agent; the Share card shows the lines to paste; a new link moves it.
import { chromium } from "playwright-core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const origin = process.argv[2] ?? "http://localhost:3100";
let pass = 0, fail = 0;
const ok = (name, cond, more = "") => { cond ? pass++ : fail++; console.log(`${cond ? "ok  " : "FAIL"} ${name}${more ? "  " + more : ""}`); };
const b = await chromium.launch({ channel: "chrome" });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, permissions: ["clipboard-read", "clipboard-write"] });
const p1 = await ctx.newPage();
const errs = []; p1.on("pageerror", (e) => errs.push(String(e)));
await p1.goto(`${origin}/?probe=1`); await p1.waitForFunction(() => window.__editor, null, { timeout: 60000 });
// something of one's own on the board, then Share
await p1.evaluate(() => { const s = window.__editor.store; s.run(() => s.put({ id: "mine", kind: "rect", x: 0, y: 0, w: 160, h: 80, text: "My box", tone: "ink", fill: "none" })); });
await p1.getByRole("button", { name: "Share" }).click();
await p1.waitForURL(/\/b\/[A-Za-z0-9_-]{22}/, { timeout: 20000 });
const key = p1.url().split("/b/")[1].split("?")[0];
ok("Share puts the board at a secret link", key.length === 22, key);
await p1.goto(`${origin}/b/${key}?probe=1`); await p1.waitForFunction(() => window.__editor?.store.doc.shapes.mine, null, { timeout: 20000 });
ok("the shared board holds what was drawn before sharing", true);
const p2 = await ctx.newPage(); await p2.goto(`${origin}/b/${key}?probe=1`); await p2.waitForFunction(() => window.__editor?.store.doc.shapes.mine, null, { timeout: 20000 });
// an agent draws
const agent = new Client({ name: "check", version: "1" });
await agent.connect(new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${key}` } } }));
const d = await agent.callTool({ name: "draw", arguments: { diagram: { slug: "trip", name: "Out and back", things: [["card", "c", 0, 0, "Client", 170, 64], ["card", "s", 330, 0, "Server", 170, 64]], links: [["wire", "w", "c.r", "s.l", { text: "GET /" }]], beats: [{ run: ["w"] }, { back: ["w"] }] } } });
ok("the agent draws", !d.isError, d.content[0].text);
const seen = async (p, text) => p.waitForFunction((t) => !!window.__editor && Object.values(window.__editor.store.doc.shapes).some((s) => s.text === t), text, { timeout: 15000 }).then(() => true, () => false);
ok("its diagram appears live in the first browser", await seen(p1, "Client"));
ok("…and in the second", await seen(p2, "Server"));
// an edit in one browser reaches the other, and the agent
await p2.evaluate(() => { const s = window.__editor.store; s.run(() => s.put({ id: "theirs", kind: "rect", x: 0, y: 300, w: 160, h: 80, text: "Colleague's box", tone: "ink", fill: "none" })); });
ok("an edit in one browser reaches the other", await seen(p1, "Colleague's box"));
await new Promise((r) => setTimeout(r, 800));
const read = JSON.parse((await agent.callTool({ name: "read", arguments: {} })).content[0].text);
ok("…and the agent reads it", read.other.words.includes("Colleague's box"), JSON.stringify(read.other.words));
// the lines to paste
await p1.getByRole("button", { name: "Shared" }).click();
const agentLine = async (tab) => { await p1.getByRole("tab", { name: tab }).click(); return (await p1.locator('[role="dialog"] code').allTextContents())[1] ?? ""; };
const lines = [await agentLine("Claude Code"), await agentLine("Codex"), await agentLine("MCP")];
ok("the Share panel shows the line to connect Claude Code, Codex or any client to this board", lines[0].includes(`Bearer ${key}`) && lines[1].includes(`/mcp/${key}`) && lines[2].endsWith(`/mcp/${key}`), lines.join(" | "));
// a new link: an edit made just before it goes over with the board
await p1.evaluate(() => { const s = window.__editor.store; s.run(() => s.put({ id: "last", kind: "rect", x: 300, y: 300, w: 160, h: 80, text: "Just before", tone: "ink", fill: "none" })); });
await p1.getByRole("button", { name: "Link options" }).click();
await p1.getByRole("menuitem", { name: "New link…" }).click();
await p1.getByRole("button", { name: "Make a new link" }).click();
await p1.waitForURL((u) => !u.toString().includes(key), { timeout: 20000 });
ok("New link moves the board to another link", /\/b\/[A-Za-z0-9_-]{22}/.test(p1.url()));
await p1.goto(p1.url().split("?")[0] + "?probe=1");
ok("…with the edit made just before it", await seen(p1, "Just before"));
ok("the other browser on the old link is told it moved", await p2.getByText("This board has moved to a new link.").isVisible({ timeout: 10000 }).catch(() => false));
ok("no page errors", !errs.length, errs.join(" | "));
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
