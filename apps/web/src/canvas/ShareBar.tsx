// Sharing a board, top right: one button, one panel. On a board of one's own, Share puts it on the server under a secret
// link and it goes live where it stands (no reload), with the link already copied. On a shared board the same button opens
// the panel: the link, the line that connects a person's own agent to it, and a new link when the old one has gone too far.
import { useEffect, useRef, useState } from "react";
import { ArrowClockwise, Check, Copy, ShareNetwork } from "@phosphor-icons/react";
import type { Doc } from "@weld/canvas/types";

/** 128 random bits, as a board's key. */
const freshKey = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const PANEL = "rounded-[12px] bg-kumo-base shadow-[0_8px_28px_rgba(0,0,0,0.10),0_1px_3px_rgba(0,0,0,0.06)] ring ring-kumo-line dark:shadow-[0_8px_28px_rgba(0,0,0,0.5)]";
const BTN = "ctl flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-kumo-default hover:bg-black/[0.05] disabled:opacity-50 dark:hover:bg-white/[0.08]";
const WELL = "rounded-lg bg-black/[0.035] ring ring-inset ring-black/[0.04] dark:bg-white/[0.05] dark:ring-white/[0.05]";

/** Copies `text`, and says so on the button for a moment. */
function useCopy(): [boolean, (text: string) => void] {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return [done, (text) => void navigator.clipboard.writeText(text).then(() => {
    setDone(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(false), 1600);
  }, () => {})];
}

function CopyButton({ text, label, quiet }: { text: string; label: string; quiet?: boolean }) {
  const [done, copy] = useCopy();
  return (
    <button
      className={quiet
        ? "ctl flex size-7 shrink-0 items-center justify-center rounded-md text-kumo-subtle hover:bg-black/[0.06] hover:text-kumo-default dark:hover:bg-white/[0.1]"
        : "ctl flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-kumo-brand px-3 text-[13px] font-medium text-white hover:brightness-110"}
      aria-label={quiet ? `Copy ${label}` : undefined}
      onClick={() => copy(text)}
    >
      {done ? <Check size={quiet ? 14 : 15} weight="bold" /> : <Copy size={quiet ? 14 : 15} />}
      {!quiet && (done ? "Copied" : "Copy")}
    </button>
  );
}

const AGENTS = ["Claude Code", "Codex", "Other", "This browser"] as const;
type Agent = (typeof AGENTS)[number];

/** How a person's own agent joins the board: the line to paste for the agent they use. */
function Connect({ origin, board }: { origin: string; board: string }) {
  const [agent, setAgent] = useState<Agent>("Claude Code");
  const lines: Record<Agent, { text: string; say: string }> = {
    "Claude Code": { text: `claude mcp add --transport http canvas ${origin}/mcp --header "Authorization: Bearer ${board}"`, say: "Run in a terminal, then ask Claude to draw on the board." },
    Codex: { text: `codex mcp add canvas --url ${origin}/mcp/${board}`, say: "Run in a terminal, then ask Codex to draw on the board." },
    Other: { text: `${origin}/mcp/${board}`, say: "Add as a remote MCP server (streamable HTTP) in any client." },
    "This browser": { text: "", say: "" },
  };
  const line = lines[agent];
  // (an agent in the browser itself finds the board's tools on this page through WebMCP: nothing to paste)
  const webmcp = typeof document !== "undefined" && "modelContext" in document;
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-medium text-kumo-default">Connect an agent</span>
      <div role="tablist" aria-label="Agent" className={`grid grid-cols-4 gap-0.5 p-0.5 ${WELL}`}>
          {AGENTS.map((a) => (
            <button
              key={a}
              role="tab"
              aria-selected={a === agent}
              onClick={() => setAgent(a)}
              className={`ctl whitespace-nowrap rounded-[6px] px-1.5 py-1 text-[12px] font-medium ${a === agent ? "bg-kumo-base text-kumo-default shadow-[0_1px_2px_rgba(0,0,0,0.08)] ring ring-kumo-line" : "text-kumo-subtle hover:text-kumo-default"}`}
            >
              {a}
            </button>
          ))}
      </div>
      {agent === "This browser" ? (
        <div className={`flex flex-col gap-1 px-3 py-2.5 ${WELL}`}>
          <span className="text-[13px] text-kumo-default">Nothing to paste.</span>
          <span className="text-[12px] leading-[1.5] text-kumo-subtle">
            {webmcp
              ? "This page offers the board's tools through WebMCP: an agent in this browser can draw on this board as it is open here."
              : "This page offers the board's tools through WebMCP, for agents built into the browser. This browser doesn't support it yet."}
          </span>
        </div>
      ) : (
        <>
          <div className={`flex items-start gap-1 p-1 pl-3 ${WELL}`}>
            <code className="min-w-0 flex-1 select-all break-all py-1.5 font-mono text-[11.5px] leading-[1.55] text-kumo-default">{line.text}</code>
            <CopyButton text={line.text} label={`the ${agent} line`} quiet />
          </div>
          <span className="text-[12px] text-kumo-subtle">{line.say}</span>
        </>
      )}
    </div>
  );
}

export function ShareBar({ board, handed, copied, doc, flush, onLive }: { board?: string; handed?: boolean; copied?: boolean; doc: () => Doc; flush: () => Promise<void>; onLive: (key: string, copied: boolean) => void }) {
  // (a board that has just arrived at its link from Share, or from a new link, opens with the panel showing)
  const [open, setOpen] = useState<null | "panel" | "renew">(handed ? "panel" : null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  // (just shared: the link was copied for you, and the panel says so)
  const [fresh, setFresh] = useState(!!copied);
  const nextKey = useRef<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) { setOpen(null); setFresh(false); } };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(null); setFresh(false); } };
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", esc, true);
    return () => { window.removeEventListener("pointerdown", away); window.removeEventListener("keydown", esc, true); };
  }, [open]);

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const link = board ? `${origin}/b/${board}` : "";

  // a board of one's own becomes a shared one: the same drawing, now at a link, live where it stands
  const share = async () => {
    setBusy(true);
    setFailed(null);
    try {
      const r = await fetch("/api/boards", { method: "POST", body: JSON.stringify(doc()) });
      const { key, error } = (await r.json().catch(() => ({}))) as { key?: string; error?: string };
      if (!key) throw new Error(error ?? "the board could not be shared: try again");
      // the link is copied on the way (said in the panel only if it really was; a copy that hangs is not waited for)
      const copied = await Promise.race([navigator.clipboard.writeText(`${origin}/b/${key}`).then(() => true, () => false), new Promise<boolean>((ok) => setTimeout(() => ok(false), 500))]);
      onLive(key, copied);
    } catch (e) {
      setFailed(e instanceof Error ? e.message : "the board could not be shared: try again");
      setOpen("panel");
    } finally { setBusy(false); }
  };

  const renew = async () => {
    if (!board) return;
    setBusy(true);
    setFailed(null);
    try {
      // what was just changed here goes over before the board moves (and the board stays put if it cannot)
      await flush();
      // the new key is made here and asked for by name: if the answer is lost, asking again with the same key is safe
      const to = (nextKey.current ??= freshKey());
      // (remembered, so that if the answer never comes and the board turns out to have moved, the way to it is known)
      try { sessionStorage.setItem(`canvas:moving:${board}`, to); } catch { /* storage blocked */ }
      for (let tries = 0; ; tries++) {
        const r = await fetch(`/api/b/${board}/rotate`, { method: "POST", body: JSON.stringify({ to }) }).catch(() => null);
        if (r?.ok) {
          try { sessionStorage.removeItem(`canvas:moving:${board}`); } catch { /* storage blocked */ }
          nextKey.current = null;
          onLive(to, false);
          return;
        }
        if (r && r.status < 500 && r.status !== 429) { const { error } = (await r.json().catch(() => ({}))) as { error?: string }; throw new Error(error ?? "the board could not be moved"); }
        if (tries >= 3) throw new Error("the board could not be moved: try again");
        await new Promise((ok) => setTimeout(ok, 800 * (tries + 1)));
      }
    } catch (e) {
      setFailed(e instanceof Error ? e.message : "the board could not be moved");
    } finally { setBusy(false); }
  };

  return (
    <div ref={box} className="absolute right-4 top-4 z-40 flex flex-col items-end gap-2" onMouseDown={(e) => { if (!(e.target as HTMLElement).closest("code")) e.preventDefault(); }}>
      <div className={`flex p-1 ${PANEL}`}>
        <button
          className={BTN}
          disabled={busy && !board}
          aria-expanded={!!open}
          onClick={() => (board ? setOpen(open ? null : "panel") : void share())}
        >
          {board ? <span className="relative mx-0.5 flex size-2"><span className="absolute inset-0 rounded-full bg-emerald-500" /><span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/60 motion-reduce:animate-none" /></span> : <ShareNetwork size={15} />}
          {board ? "Shared" : busy ? "Sharing…" : "Share"}
        </button>
      </div>

      {open === "panel" && (
        <div role="dialog" aria-label="Share" className={`ui-in flex w-[min(440px,calc(100vw-32px))] flex-col ${PANEL}`}>
          {!board ? (
            <div className="p-4 text-[13px] text-red-600 dark:text-red-400">{failed}</div>
          ) : (
            <>
              <div className="flex flex-col gap-2 p-4 pb-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[15px] font-semibold text-kumo-default">{fresh ? "Board shared" : "Share this board"}</span>
                  {fresh && <span className="flex items-center gap-1 text-[12px] font-medium text-emerald-600 dark:text-emerald-400"><Check size={12} weight="bold" /> Link copied</span>}
                </div>
                <div className={`flex items-center gap-1 p-1 pl-3 ${WELL}`}>
                  <code className="min-w-0 flex-1 select-all truncate font-mono text-[12px] text-kumo-default" title={link}>{link.replace(/^https?:\/\//, "")}</code>
                  <CopyButton text={link} label="link" />
                </div>
              </div>
              <div className="border-t border-kumo-line p-4 pt-3">
                <Connect origin={origin} board={board} />
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-kumo-line px-4 py-2.5">
                <span className="text-[12px] text-kumo-subtle">Anyone with the link can see and edit it.</span>
                <button className="ctl flex items-center gap-1 rounded px-1.5 py-1 text-[12px] font-medium text-kumo-subtle hover:bg-black/[0.05] hover:text-kumo-default dark:hover:bg-white/[0.08]" onClick={() => { setFailed(null); setOpen("renew"); }}>
                  <ArrowClockwise size={12} /> New link
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {open === "renew" && (
        <div role="dialog" aria-label="New link" className={`ui-in flex w-[min(440px,calc(100vw-32px))] flex-col gap-3 p-4 ${PANEL}`}>
          <span className="text-[15px] font-semibold text-kumo-default">Move to a new link?</span>
          <span className="text-[13px] leading-[1.5] text-kumo-subtle">The board stays as it is, at a new link. The old link, and agents connected with it, stop working.</span>
          {failed && <span className="text-[12px] text-red-600 dark:text-red-400">{failed}</span>}
          <div className="flex justify-end gap-1.5">
            <button className={BTN} onClick={() => setOpen("panel")}>Cancel</button>
            <button className="ctl flex h-8 items-center rounded-md bg-red-600 px-3 text-[13px] font-medium text-white hover:bg-red-700 disabled:opacity-50" disabled={busy} onClick={() => void renew()}>
              {busy ? "Moving…" : "Make a new link"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
