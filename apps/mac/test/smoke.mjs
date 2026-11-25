// The smoke check: the few things every build of Weld must do. Run against the dev build or a packaged app:
//   node scripts/shot.mjs out/smoke test/smoke.mjs
//   WELD_EXEC=out/Weld-darwin-arm64/Weld.app/Contents/MacOS/Weld node scripts/shot.mjs out/smoke test/smoke.mjs
// It needs no agent credentials: the conversation runs on test/mock-acp-agent.mjs.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MOCK = path.join(path.dirname(fileURLToPath(import.meta.url)), "mock-acp-agent.mjs");
// (said by this run alone: a reply left by an earlier run cannot pass for it)
const TOKEN = `smoke-${process.pid}-${Date.now().toString(36)}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, ok, extra) => console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && extra !== undefined ? ` -> ${JSON.stringify(extra).slice(0, 400)}` : ""}`);
const until = async (fn, ms = 15000) => {
  for (const end = Date.now() + ms; Date.now() < end; await wait(250)) if (await fn()) return true;
  return false;
};

export default async ({ app, page, out }) => {
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  await wait(2000);
  const shapes = () => E(() => Object.values(window.__editor.store.doc.shapes));
  const T = (await shapes()).find((s) => s.kind === "thread")?.id;
  const term = (await shapes()).find((s) => s.kind === "terminal")?.id;
  check("the app opens on a board with a thread and a terminal", !!T && !!term);

  // a terminal runs what is typed into it
  await until(async () => (await app.evaluate(({}, id) => globalThis.__termsRecent(id), term)).length > 0);
  await E((id) => window.weld.pty.write(id, "echo weld-smoke-$((40+2))\r"), term);
  check("a terminal runs a command", await until(async () => /weld-smoke-42/.test(await app.evaluate(({}, id) => globalThis.__termsRecent(id), term))));

  // the board is kept, and is there again when the window loads afresh
  await E(() => { const s = window.__editor.store; s.run(() => s.put({ id: "smoke", kind: "rect", x: 0, y: -400, w: 160, h: 80, text: "kept", tone: "ink", fill: "none" })); s.emit(); });
  await wait(1200);
  await page.reload();
  await page.waitForSelector("canvas");
  await page.waitForFunction(() => !!window.__editor);
  await wait(1500);
  check("the board is saved and opens again", (await shapes()).some((s) => s.id === "smoke" && s.text === "kept"));

  // the weld command, as an agent's shell runs it: a page opened beside the thread, and a command run in the background
  const dir = path.join(out, "data", "scratch", "smoke");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "page.html"), "<!doctype html><title>smoke</title><h1 id=h>weld smoke page</h1>");
  await E(([T, dir]) => window.weld.thread.set(T, { mode: "full", cwd: dir }), [T, dir]);
  const door = await app.evaluate(({}, T) => ({ url: globalThis.__door.url, key: globalThis.__door.keyFor(T), bin: globalThis.__door.bin }), T);
  const weld = (...args) => execFileSync(path.join(door.bin, "weld"), args, { cwd: dir, encoding: "utf8", env: { ...process.env, WELD_URL: door.url, WELD_TOKEN: door.key, WELD_FROM: T } });
  check("the weld command is installed", existsSync(path.join(door.bin, "weld")));
  check("weld open puts a page on the board", /opened/.test(weld("open", "page.html")));
  const loaded = await until(() => app.evaluate(async ({ webContents }) => {
    const g = webContents.getAllWebContents().find((w) => w.getType() === "webview" && /page\.html/.test(w.getURL()));
    return !!g && (await g.executeJavaScript("document.getElementById('h')?.textContent ?? ''").catch(() => "")) === "weld smoke page";
  }));
  check("…and the page loads", loaded);
  weld("run", "echo ran > ran.txt; sleep 30");
  check("weld run runs a command in the background", await until(() => existsSync(path.join(dir, "ran.txt")) && readFileSync(path.join(dir, "ran.txt"), "utf8").trim() === "ran"));

  // a conversation, start to end, on an ACP agent (the mock: no credentials)
  const saved = await E(([n, m]) => window.weld.saveAgent({ name: "Mock agent", command: n, args: [m], env: {} }), [process.execPath, MOCK]);
  await E(([T, A]) => window.weld.thread.set(T, { agent: A, mode: "full" }), [T, `cmd:${saved.id}`]);
  await E(([T, token]) => window.weld.thread.send(T, { text: `say:${token}` }), [T, TOKEN]);
  const answered = await until(async () => {
    const t = await E((T) => window.weld.thread.get(T), T);
    return t.meta.status !== "running" && t.items.some((i) => i.kind === "text" && (i.text ?? "").includes(TOKEN));
  }, 30000);
  check("a conversation runs a turn on an ACP agent", answered);

  // T3 Code's way in: `weld acp`, run by Weld's own executable as Node, answering ACP over Weld's socket
  const hello = await new Promise((resolve) => {
    // (with T3 Code's own environment: nothing of Weld's door in it)
    const { WELD_URL: _u, WELD_TOKEN: _t, WELD_FROM: _f, ...outside } = process.env;
    const p = spawn(path.join(door.bin, "weld"), ["acp"], { env: outside });
    let buf = "";
    const done = (v) => (clearTimeout(t), p.kill(), resolve(v));
    const t = setTimeout(() => done(null), 15000);
    p.stdout.on("data", (d) => {
      buf += d;
      for (const line of buf.split("\n").slice(0, -1)) {
        try {
          const m = JSON.parse(line);
          if (m.id === 1) done(m);
        } catch {
          /* not JSON-RPC: T3 Code would end the session, and so does this check */
          done(null);
        }
      }
      buf = buf.slice(buf.lastIndexOf("\n") + 1);
    });
    p.on("error", () => done(null));
    p.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: 1, clientCapabilities: {} } })}\n`);
  });
  check("weld acp answers T3 Code's first request", hello?.result?.protocolVersion === 1, hello);
  // and a thread or terminal inside Weld cannot reach its threads that way, around its own limits
  let refused = false;
  try {
    weld("acp");
  } catch (e) {
    refused = /apps outside Weld/.test(String(e.stderr));
  }
  check("weld acp is refused inside Weld", refused);
  // nor by going round the weld command: a process Weld started is refused at the socket itself
  const init = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: 1, clientCapabilities: {} } });
  weld("run", `printf '%s\\n' '${init}' | env -u WELD_FROM -u WELD_URL -u WELD_TOKEN weld acp > round.txt 2>&1; echo done >> round.txt; sleep 30`);
  await until(() => existsSync(path.join(dir, "round.txt")) && /done/.test(readFileSync(path.join(dir, "round.txt"), "utf8")), 20000);
  const round = existsSync(path.join(dir, "round.txt")) ? readFileSync(path.join(dir, "round.txt"), "utf8") : "";
  check("a process Weld started cannot reach its threads round the weld command", /done/.test(round) && !/protocolVersion/.test(round), round);
};
