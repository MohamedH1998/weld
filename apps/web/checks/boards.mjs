// node checks/boards.mjs [origin] — a board exists only once the server has made it: a key nobody was given has no board,
// keeps nothing, and cannot be drawn on; a made board (empty, or from a document) works; a rotated board's old link stays moved.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const origin = process.argv[2] ?? "http://localhost:3100";
let pass = 0, fail = 0;
const ok = (name, cond, more = "") => { cond ? pass++ : fail++; console.log(`${cond ? "ok  " : "FAIL"} ${name}${more ? "  " + more : ""}`); };
const fresh = () => Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64url");
const agent = async (key) => {
  const c = new Client({ name: "check", version: "1" });
  await c.connect(new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${key}` } } }));
  return c;
};
const diagram = { slug: "one", name: "One box", things: [["card", "a", 0, 0, "A", 120, 60]] };
/** The first message a live connection to `key` is sent. */
const first = (key) => new Promise((done) => {
  const ws = new WebSocket(`${origin.replace(/^http/, "ws")}/api/b/${key}/live`);
  ws.onmessage = (e) => { done(JSON.parse(String(e.data))); ws.close(); };
  ws.onerror = () => done({ type: "error" });
});

const never = fresh();
const c0 = await agent(never);
const d0 = await c0.callTool({ name: "draw", arguments: { diagram } });
ok("a key nobody was given cannot be drawn on", d0.isError && /no board at this link/.test(d0.content[0].text), d0.content[0].text);
const r0 = await c0.callTool({ name: "read", arguments: {} });
ok("nor read", r0.isError, r0.content[0].text);
ok("a live connection to it is told there is no board", (await first(never)).type === "gone");
await c0.close();

const { key: empty } = await (await fetch(`${origin}/api/boards`, { method: "POST" })).json();
ok("an empty board made by the server opens", (await first(empty)).type === "doc");
const c1 = await agent(empty);
const d1 = await c1.callTool({ name: "draw", arguments: { diagram } });
ok("and can be drawn on", !d1.isError, d1.content[0].text);
await c1.close();

const { key: full } = await (await fetch(`${origin}/api/boards`, { method: "POST", body: JSON.stringify({ shapes: { x: { id: "x", kind: "rect", x: 0, y: 0, w: 10, h: 10, text: "x", tone: "ink", fill: "none" } }, order: ["x"] }) })).json();
const got = await first(full);
ok("a board made from a document opens with it", got.type === "doc" && got.doc.order.includes("x"));
const to = fresh();
const moved = await fetch(`${origin}/api/b/${full}/rotate`, { method: "POST", body: JSON.stringify({ to }) });
ok("it moves to a new link", moved.ok);
ok("the old link says it moved", (await first(full)).type === "moved");
ok("the new link has the board", (await first(to)).type === "doc");
const unmade = await fetch(`${origin}/api/b/${fresh()}/rotate`, { method: "POST", body: JSON.stringify({ to: fresh() }) });
ok("a key nobody was given cannot be moved", unmade.status === 409);

console.log(`\n${pass} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);
