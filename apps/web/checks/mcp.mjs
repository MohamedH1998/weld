// node checks/mcp.mjs [origin] — a board end to end, as an agent sees it: make a board, connect with its key, read the guide,
// draw, redraw in place, look, read; pictures saved to checks/shots/mcp-*.png.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { mkdirSync, writeFileSync } from "node:fs";
const origin = process.argv[2] ?? "http://localhost:3100";
let pass = 0, fail = 0;
const ok = (name, cond, more = "") => { cond ? pass++ : fail++; console.log(`${cond ? "ok  " : "FAIL"} ${name}${more ? "  " + more : ""}`); };
mkdirSync("checks/shots", { recursive: true });
const { key } = await (await fetch(`${origin}/api/boards`, { method: "POST" })).json();
ok("a board is made with a secret key", /^[A-Za-z0-9_-]{22}$/.test(key ?? ""), key);
const bad = await fetch(`${origin}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
ok("no key, no tools", bad.status === 401);
const client = new Client({ name: "check", version: "1" });
await client.connect(new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${key}` } } }));
const tools = (await client.listTools()).tools.map((t) => t.name).sort();
ok("the tools are there", JSON.stringify(tools) === JSON.stringify(["draw", "guide", "look", "read"]), tools.join(","));
const guide = await client.callTool({ name: "guide", arguments: {} });
ok("the guide explains the notation and lists the helpers", /story notation/.test(guide.content[0].text) && /panel\(/.test(guide.content[0].text) && /House rules/.test(guide.content[0].text));
const diagram = { slug: "round-trip", name: "A request goes out and its answer comes back",
  things: [["card", "c", 0, 0, "Client", 170, 64], ["card", "s", 330, 0, "Server", 170, 64]],
  links: [["wire", "w", "c.r", "s.l", { text: "GET /" }]],
  beats: [{ on: ["c"], run: ["w"] }, { on: ["s"], back: ["w"], say: { w: "200 OK" }, hold: 1800 }] };
const save = (r, name) => { const img = r.content.find((c) => c.type === "image"); if (img) writeFileSync(`checks/shots/mcp-${name}.png`, Buffer.from(img.data, "base64")); return img; };
const d1 = await client.callTool({ name: "draw", arguments: { diagram } });
ok("draw puts it down and sends back a picture", !d1.isError && !!save(d1, "draw"), d1.content[0].text);
const d2 = await client.callTool({ name: "draw", arguments: { diagram: { ...diagram, things: [...diagram.things, ["caption", "cap", 0, 110, "One wire, both ways."]] } } });
ok("drawing the same slug again redraws it in place", !d2.isError && /Redrew/.test(d2.content[0].text), d2.content[0].text);
const bad2 = await client.callTool({ name: "draw", arguments: { diagram: { slug: "x", name: "x", things: [["nope", "a"]] } } });
ok("a helper that does not exist is a clear error", bad2.isError && /no helper called "nope"/.test(bad2.content[0].text), bad2.content[0].text);
const huge = await client.callTool({ name: "draw", arguments: { diagram: { slug: "big", name: "big", things: [["cells", "c", 0, 0, 1000000000]] } } });
ok("a helper asked for a billion of anything is refused, not attempted", huge.isError && /within ±/.test(huge.content[0].text), huge.content[0].text);
const words = await client.callTool({ name: "draw", arguments: { diagram: { slug: "big2", name: "big", things: [["cells", "c", 0, 0, "1000000000"]] } } });
ok("…and so is a billion written as words", words.isError && /within ±/.test(words.content[0].text), words.content[0].text);
// a tiny document with an absurd shape in it (as a browser could send): looking at the board still answers
const weird = await (await fetch(`${origin}/api/boards`, { method: "POST", body: JSON.stringify({ shapes: { t: { id: "t", kind: "ticks", x: 0, y: 0, w: 10000000, h: 16, text: "", tone: "ink", fill: "none", levels: [0, 1], value: 1 } }, order: ["t"] }) })).json();
const wc = new Client({ name: "check", version: "1" });
await wc.connect(new StreamableHTTPClientTransport(new URL(`${origin}/mcp/${weird.key}`)));
const wl = await wc.callTool({ name: "look", arguments: {} });
ok("an absurdly large shape cannot blow up a picture", !!wl.content?.length, wl.content?.[0]?.type);
const proto = await client.callTool({ name: "draw", arguments: { diagram: { slug: "constructor", name: "a word like any other", things: [["card", "k", 0, 0, "K"]] } } });
const afterProto = JSON.parse((await client.callTool({ name: "read", arguments: {} })).content[0].text);
ok("a diagram called constructor is just a diagram", !proto.isError && afterProto.diagrams.map((d) => d.slug).sort().join() === "constructor,round-trip", proto.content[0].text);
const look = await client.callTool({ name: "look", arguments: { slug: "round-trip" } });
ok("look sends a picture of the diagram", !!save(look, "look"));
const whole = await client.callTool({ name: "look", arguments: {} });
ok("look with no slug sends the whole board", !!save(whole, "board"));
const read = await client.callTool({ name: "read", arguments: {} });
const r = JSON.parse(read.content[0].text);
const rt = r.diagrams.find((d) => d.slug === "round-trip");
ok("read lists the diagram with what it was drawn from", r.diagrams.length === 2 && rt?.spec.things.length === 3);
const freshKey = () => Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64url");
const to = freshKey();
const rot = await (await fetch(`${origin}/api/b/${key}/rotate`, { method: "POST", body: JSON.stringify({ to }) })).json();
const again = await fetch(`${origin}/api/b/${key}/rotate`, { method: "POST", body: JSON.stringify({ to }) });
ok("asking again for the same new link (a lost answer) is safe", again.ok && rot.key === to);
const c2 = new Client({ name: "check", version: "1" });
await c2.connect(new StreamableHTTPClientTransport(new URL(`${origin}/mcp/${rot.key}`)));
const r2 = JSON.parse((await c2.callTool({ name: "read", arguments: {} })).content[0].text);
ok("a new link keeps the board, reachable by key in the address too", r2.diagrams.length === 2);
const r3 = await client.callTool({ name: "read", arguments: {} });
ok("the old link says the board has moved", r3.isError && /moved to a new link/.test(r3.content[0].text), r3.content[0].text);
const twice = await fetch(`${origin}/api/b/${key}/rotate`, { method: "POST", body: JSON.stringify({ to: freshKey() }) });
ok("a link already replaced cannot be replaced again", twice.status === 409);
const taken = await fetch(`${origin}/api/b/${to}/rotate`, { method: "POST", body: JSON.stringify({ to: weird.key }) });
ok("a board cannot be moved onto a link already in use", taken.status === 409);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
