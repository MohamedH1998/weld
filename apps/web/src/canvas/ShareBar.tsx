// Sharing a board, top right: one button, one card. On a board of one's own, Share puts it on the server under a secret
// link and it goes live where it stands (no reload), with the link already copied. On a shared board the same button opens
// the card: a Kumo layered card whose strip says the board is live and who can edit it (and, behind ⋯, a new link), and
// whose card holds the two things to copy: the link, and the line that connects a person's own agent to it.
import { useEffect, useRef, useState } from "react";
import { ArrowClockwise, Check, Copy, DotsThree, ShareNetwork } from "@phosphor-icons/react";
import { LayerCard } from "@cloudflare/kumo";
import type { Doc } from "@weld/canvas/types";

/** 128 random bits, as a board's key. */
const freshKey = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
// (the floating button, in the same layer as the board's other controls)
const PILL = "ctl flex h-9 items-center gap-2 rounded-[10px] bg-kumo-base px-3 text-[13px] font-medium text-kumo-default shadow-[0_1px_2px_rgba(0,0,0,0.06),0_4px_14px_rgba(0,0,0,0.06)] ring ring-kumo-line hover:bg-kumo-elevated disabled:opacity-60 dark:shadow-[0_4px_14px_rgba(0,0,0,0.4)]";
const CARD = "ui-in w-[min(380px,calc(100vw-32px))] shadow-[0_12px_32px_-12px_rgba(0,0,0,0.18),0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-[0_12px_32px_-12px_rgba(0,0,0,0.6)]";
const STRIP = "my-0 px-3.5 py-2.5 text-[12.5px]";
const ROW = "flex h-9 items-center gap-1 rounded-md bg-kumo-elevated pl-3 pr-1 ring ring-inset ring-kumo-hairline";
const ICON = "ctl flex size-7 shrink-0 items-center justify-center rounded-md text-kumo-subtle hover:bg-kumo-fill hover:text-kumo-default";

/** Copies `text`, and says so for a moment. */
function useCopy(initially = false): [boolean, (text: string) => void] {
  const [done, setDone] = useState(initially);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (initially) timer.current = setTimeout(() => setDone(false), 1800);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [initially]);
  return [done, (text) => void navigator.clipboard.writeText(text).then(() => {
    setDone(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(false), 1600);
  }, () => {})];
}

/** One thing to copy: shown on one line (all of it on hover), copied by the button beside it. */
function CopyRow({ text, shown, label, copied }: { text: string; shown?: string; label: string; copied?: boolean }) {
  const [done, copy] = useCopy(copied);
  return (
    <div className={ROW}>
      <code className="min-w-0 flex-1 select-all truncate font-mono text-[11.5px] text-kumo-default" title={text}>{shown ?? text}</code>
      <button className={ICON} aria-label={done ? `${label} copied` : `Copy ${label}`} title={done ? "Copied" : "Copy"} onClick={() => copy(text)}>
        {done ? <Check size={14} weight="bold" className="text-kumo-brand" /> : <Copy size={14} />}
      </button>
    </div>
  );
}

const AGENTS = ["Claude Code", "Codex", "Any MCP client"] as const;
type Agent = (typeof AGENTS)[number];

/** How a person's own agent joins the board: the line for the agent they use. */
function Connect({ origin, board }: { origin: string; board: string }) {
  const [agent, setAgent] = useState<Agent>("Claude Code");
  const lines: Record<Agent, string> = {
    "Claude Code": `claude mcp add --transport http canvas ${origin}/mcp --header "Authorization: Bearer ${board}"`,
    Codex: `codex mcp add canvas --url ${origin}/mcp/${board}`,
    "Any MCP client": `${origin}/mcp/${board}`,
  };
  // (an agent in the browser itself finds the board's tools on this page through WebMCP: said only where it can)
  const webmcp = typeof document !== "undefined" && "modelContext" in document;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-medium text-kumo-default">Connect an agent</span>
        <div role="tablist" aria-label="Agent" className="flex gap-0.5">
          {AGENTS.map((a) => (
            <button
              key={a}
              role="tab"
              aria-selected={a === agent}
              onClick={() => setAgent(a)}
              className={`ctl rounded-md px-2 py-1 text-[11.5px] font-medium ${a === agent ? "bg-kumo-fill text-kumo-default" : "text-kumo-subtle hover:text-kumo-default"}`}
            >
              {a === "Any MCP client" ? "MCP" : a}
            </button>
          ))}
        </div>
      </div>
      <CopyRow key={agent} text={lines[agent]} label={`the ${agent} line`} />
      {webmcp && <span className="text-[11.5px] text-kumo-subtle">An agent in this browser can already use the board.</span>}
    </div>
  );
}

export function ShareBar({ board, handed, copied, doc, flush, onLive }: { board?: string; handed?: boolean; copied?: boolean; doc: () => Doc; flush: () => Promise<void>; onLive: (key: string, copied: boolean) => void }) {
  // (a board that has just arrived at its link from Share, or from a new link, opens with the card showing)
  const [open, setOpen] = useState<null | "panel" | "renew">(handed ? "panel" : null);
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  // (just shared: the link was copied for you, and its button says so for a moment)
  const [fresh] = useState(!!copied);
  const nextKey = useRef<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) { setOpen(null); setMenu(false); } };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { if (menu) setMenu(false); else setOpen(null); } };
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", esc, true);
    return () => { window.removeEventListener("pointerdown", away); window.removeEventListener("keydown", esc, true); };
  }, [open, menu]);

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
      // the link is copied on the way (said only if it really was; a copy that hangs is not waited for)
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
      <button
        className={PILL}
        disabled={busy && !board}
        aria-expanded={!!open}
        onClick={() => (board ? setOpen(open ? null : "panel") : void share())}
      >
        {board ? <span className="size-2 rounded-full bg-kumo-brand" /> : <ShareNetwork size={15} />}
        {board ? "Shared" : busy ? "Sharing…" : "Share"}
      </button>

      {open === "panel" && (
        !board ? (
          <LayerCard role="alert" className={`${CARD} p-3.5 text-[13px] text-kumo-danger`}>{failed}</LayerCard>
        ) : (
          <LayerCard role="dialog" aria-label="Share" className={CARD}>
            <LayerCard.Secondary className={STRIP}>
              <span className="min-w-0 flex-1 truncate">Anyone with the link can see and edit</span>
              {/* (its centre lines up with the copy buttons' below: both sit 32px in from the card's right edge) */}
              <div className="relative -my-1 mr-1">
                <button className={ICON} aria-label="Link options" aria-expanded={menu} onClick={() => setMenu((m) => !m)}><DotsThree size={16} weight="bold" /></button>
                {menu && (
                  <div role="menu" className="ui-in absolute right-0 top-9 z-10 w-40 rounded-lg bg-kumo-base p-1 shadow-[0_8px_24px_rgba(0,0,0,0.12)] ring ring-kumo-line">
                    <button role="menuitem" className="ctl flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] text-kumo-default hover:bg-kumo-fill" onClick={() => { setMenu(false); setFailed(null); setOpen("renew"); }}>
                      <ArrowClockwise size={13} /> New link…
                    </button>
                  </div>
                )}
              </div>
            </LayerCard.Secondary>
            <LayerCard.Primary className="gap-3.5 p-3.5">
              <div className="flex flex-col gap-2">
                <span className="text-[12.5px] font-medium text-kumo-default">Link</span>
                <CopyRow text={link} shown={link.replace(/^https?:\/\//, "")} label="link" copied={fresh} />
              </div>
              <Connect origin={origin} board={board} />
            </LayerCard.Primary>
          </LayerCard>
        )
      )}

      {open === "renew" && (
        <LayerCard role="dialog" aria-label="New link" className={CARD}>
          <LayerCard.Secondary className={STRIP}>New link</LayerCard.Secondary>
          <LayerCard.Primary className="gap-3 p-3.5">
            <span className="text-[13px] leading-[1.5] text-kumo-default">The board stays as it is, at a new link. The old link, and agents connected with it, stop working.</span>
            {failed && <span className="text-[12px] text-kumo-danger">{failed}</span>}
            <div className="flex justify-end gap-1.5">
              <button className="ctl h-8 rounded-md px-3 text-[13px] font-medium text-kumo-default hover:bg-kumo-fill" onClick={() => setOpen("panel")}>Cancel</button>
              <button className="ctl h-8 rounded-md bg-kumo-danger px-3 text-[13px] font-medium text-white hover:brightness-110 disabled:opacity-50" disabled={busy} onClick={() => void renew()}>
                {busy ? "Moving…" : "Make a new link"}
              </button>
            </div>
          </LayerCard.Primary>
        </LayerCard>
      )}
    </div>
  );
}
