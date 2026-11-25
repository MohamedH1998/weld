// The Worker: the board app (TanStack Start), and in front of it the routes the app and people's agents use.
//   POST /api/boards              a new shared board (optionally starting from a document): its secret key
//   GET  /api/b/<key>/live        a browser's live connection to a board (websocket)
//   POST /api/b/<key>/rotate      a new key for the board; the old link stops working
//   POST /mcp  (Bearer <key>)     the board's tools for an agent; /mcp/<key> for clients that cannot send a header
import handler from "@tanstack/react-start/server-entry";
import { outlines } from "./server/assets";
import { handleMcp } from "./server/mcp";
import { MAX_DOC } from "./server/board";
import { cleanDoc } from "@weld/canvas/clean";

export { Board } from "./server/board";

/** 128 random bits: a board's key can be shared, never guessed. */
const newKey = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const KEY = /^[A-Za-z0-9_-]{22}$/;
const board = (env: Env, key: string) => env.BOARD.get(env.BOARD.idFromName(key));
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
/** A request's body, read no further than `max` bytes (null when it is longer). */
async function readUpTo(req: Request, max: number): Promise<string | null> {
  if (Number(req.headers.get("content-length") ?? 0) > max) return null;
  if (!req.body) return "";
  const reader = req.body.getReader(), parts: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > max) { await reader.cancel(); return null; }
    parts.push(value);
  }
  const all = new Uint8Array(n);
  let at = 0;
  for (const p of parts) { all.set(p, at); at += p.byteLength; }
  return new TextDecoder().decode(all);
}
/** Within this address's allowance for `what` (per minute, see wrangler.jsonc)? */
const allowed = async (limiter: RateLimit, req: Request, what: string) => (await limiter.limit({ key: `${what}:${req.headers.get("cf-connecting-ip") ?? "local"}` })).success;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url), path = url.pathname;
    if (path === "/api/boards" && request.method === "POST") {
      if (!(await allowed(env.NEW_BOARDS, request, "new"))) return json({ error: "too many new boards from here: wait a minute" }, 429);
      const text = await readUpTo(request, MAX_DOC);
      if (text === null) return json({ error: "that board is too big to share" }, 413);
      const key = newKey();
      if (text) {
        let doc;
        try { doc = cleanDoc(JSON.parse(text)); } catch { return json({ error: "not a board" }, 400); }
        try { await board(env, key).adopt(doc, []); } catch (e) { return json({ error: e instanceof Error ? e.message : "not kept" }, 400); }
      }
      return json({ key });
    }
    const live = /^\/api\/b\/([^/]+)\/live$/.exec(path);
    if (live) {
      if (!KEY.test(live[1]!)) return json({ error: "no such board" }, 404);
      if (!(await allowed(env.CALLS, request, "live"))) return json({ error: "too many connections from here: wait a minute" }, 429);
      return board(env, live[1]!).fetch(request);
    }
    const rot = /^\/api\/b\/([^/]+)\/rotate$/.exec(path);
    if (rot && request.method === "POST") {
      if (!KEY.test(rot[1]!)) return json({ error: "no such board" }, 404);
      if (!(await allowed(env.NEW_BOARDS, request, "new"))) return json({ error: "too many new links from here: wait a minute" }, 429);
      const body = await readUpTo(request, 200);
      let to = "";
      try { to = String((JSON.parse(body || "{}") as { to?: unknown }).to ?? ""); } catch { /* none */ }
      if (!KEY.test(to) || to === rot[1]) return json({ error: "say which new key to move to" }, 400);
      try { await board(env, rot[1]!).moveTo(to); } catch (e) { return json({ error: e instanceof Error ? e.message : "not moved" }, 409); }
      return json({ key: to });
    }
    if (path === "/mcp" || path.startsWith("/mcp/")) {
      if (!(await allowed(env.CALLS, request, "mcp"))) return json({ error: "too many calls from here: wait a minute" }, 429);
      const key = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || path.slice(5);
      if (!KEY.test(key)) return json({ error: "connect with a board's key: copy the line from the board's Connect agent button" }, 401);
      return handleMcp(request, board(env, key), `${url.origin}/b/${key}`, outlines);
    }
    return handler.fetch(request);
  },
};
