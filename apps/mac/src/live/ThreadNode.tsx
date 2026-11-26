// A conversation with a coding agent, on the board. The record is this
// app's own (see electron/agents.mjs), so which lab's agent answers is a
// choice made per message, not a property of the thread.
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ArrowsOutSimple, At, CaretDown, CaretRight, ChatCircle, Check, Folder, FrameCorners, GitFork, Globe, Graph, KeyReturn, Minus, NoteBlank, Shapes, Stop, TerminalWindow, X , Image as ImageIcon } from "@phosphor-icons/react";
import Markdown from "react-markdown";
import { createPortal } from "react-dom";
import remarkGfm from "remark-gfm";
import { AgentLogo } from "./AgentLogo";
import { defaultCwd, folderName, isScratch, weld, remember, settings, tilde, agentList, agentName, agentOf, chosenAgent, chosenModel } from "./bridge";
import type { Item, Meta, Mode, AgentInfo } from "./bridge";
import type { NodeProps } from "./LiveLayer";
import { Dot, FarBar, FarCard, Head } from "./LiveLayer";
import { FOLDED_H, awayBox, fold, openBeside, sendThreadAway, showService, threadBox } from "./place";
import { opened, openings } from "./opening";
import { adopt, setMeta, useThread, useThreads } from "./threads";
import { arrowedTo, refsOn, resolve, seesOf } from "./refs";
export { seesOf } from "./refs";
import { picking } from "./pick";
import { notInstalled, setUp, SETUP, wantsSignIn } from "./setup";
import type { Native } from "./setup";
import type { Ref } from "./refs";
import type { Box, Id } from "@weld/canvas/types";

/** What an agent is, under its name in the menu. */
export const subOf = (a: AgentInfo) => (a.kind === "native" ? (a.id === "claude" ? "Claude Code" : "OpenAI") : a.kind === "command" ? "added by you · Full access only" : a.experimental ? "early support · Full access only" : "");
const ICONS: Record<Ref["kind"], typeof ChatCircle> = { thread: ChatCircle, terminal: TerminalWindow, browser: Globe, frame: FrameCorners, group: Shapes, drawing: Graph, note: NoteBlank, image: ImageIcon };

/** What a thread has been pointed at, by key (kept on its place on the board, so it stays with it). */
function see(editor: NodeProps["editor"], id: Id, key: string) {
  const s = editor.store, b = threadBox(editor, id);
  if (!b || b.live?.sees?.includes(key)) return;
  const live = { ...b.live, sees: [...(b.live?.sees ?? []), key] };
  // (kept off the board, it is changed where it is kept, which no undo reaches)
  if (awayBox(editor, id)) return s.quiet(() => s.patch(id, { live }));
  // (into every moment of the person's history as well: undoing their own steps does not disconnect it)
  s.applyForeign([], [{ id, change: { live } as Partial<Box> }], []);
}
function unsee(editor: NodeProps["editor"], id: Id, key: string) {
  const s = editor.store, b = threadBox(editor, id);
  if (!b) return;
  // (everything that shows it the same thing goes: its name, and any arrow joining it)
  const sig = (k: string) => [...(resolve(editor, k)?.ids ?? [k])].sort().join(",");
  const it = sig(key);
  const arrows = [...arrowedTo(editor, id)].filter(([k]) => sig(k) === it).flatMap(([, a]) => a);
  const sees = b.live?.sees ?? [];
  const named = sees.some((k) => sig(k) === it);
  if (!arrows.length && !named) return;
  // (kept off the board, there are no arrows, and its own keeping is no step of the person's)
  if (awayBox(editor, id)) return void s.quiet(() => s.patch(id, { live: { ...b.live, sees: sees.filter((k) => sig(k) !== it) } } as Partial<Box>));
  // (one step of the person's: undoing it brings back the whole connection, the arrow and the name)
  s.run(() => {
    if (arrows.length) s.remove(arrows);
    if (named) s.patch(id, { live: { ...b.live, sees: sees.filter((k) => sig(k) !== it) } } as Partial<Box>);
  });
  s.emit();
}
/** What the thread can see, under its name: each a way to go to it, or to stop showing it. */
function Sees({ editor, id }: { editor: NodeProps["editor"]; id: Id }) {
  // (followed as the board changes: an arrow drawn to the thread, or taken away, shows here at once)
  const keys = useSyncExternalStore(editor.store.subscribe, () => seesOf(editor, id).join("\n")).split("\n").filter(Boolean);
  if (!keys.length) return null;
  const refs = keys.map((k) => resolve(editor, k)!);
  const named = (r: Ref) => r.label;
  return (
    <div className="thread-sees">
      {keys.map((k, i) => {
        const r = refs[i]!;
        const I = ICONS[r.kind];
        return (
          <span key={k} className="thread-see">
            <button type="button" className="ctl" title={r.sub} onMouseDown={(e) => e.preventDefault()} onClick={() => editor.fit(r.ids)}>
              <I size={11} />
              <span className="truncate">{named(r)}</span>
            </button>
            <button type="button" aria-label={`Stop showing ${r.label}`} className="ctl" onMouseDown={(e) => e.preventDefault()} onClick={() => unsee(editor, id, k)}>
              <X size={9} />
            </button>
          </span>
        );
      })}
    </div>
  );
}
const MODES: Record<Mode, { name: string; sub: string }> = {
  full: { name: "Full access", sub: "Runs and edits without asking" },
  edits: { name: "Edits only", sub: "Edits files; asks before anything else" },
};

function useNow(on: boolean) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [on]);
  return Date.now();
}
function span(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ${String(s % 60).padStart(2, "0")}s` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

export function ThreadNode({ box, editor, active, far }: NodeProps) {
  const thread = useThread(box.id);
  const meta = thread?.meta;
  const items = thread?.items ?? [];
  const running = meta?.status === "running";
  const now = useNow(running);

  // a new thread starts in the folder its card was given, with the agent and mode last chosen
  const seeded = useRef(false);
  useEffect(() => {
    if (!thread || seeded.current) return;
    seeded.current = true;
    // (a thread made for T3 Code came with its folder, agent and mode)
    if (box.live?.ready) return;
    const change: Partial<Meta> = {};
    const cwd = box.live?.cwd;
    if (cwd && cwd !== thread.meta.cwd) change.cwd = cwd;
    // a thread nothing has been asked of yet, standing in the home folder, is moved to a folder of its own
    if (!thread.items.length && (change.cwd ?? thread.meta.cwd) === weld.info.home) {
      change.cwd = defaultCwd();
      editor.store.quiet(() => editor.store.patch(box.id, { live: { ...box.live, cwd: change.cwd } }));
    }
    if (!thread.items.length && !Object.keys(thread.meta.sessions ?? {}).length) {
      const agent = chosenAgent();
      if (agent !== thread.meta.agent) change.agent = agent;
      const model = chosenModel(agent);
      if (model) Object.assign(change, { model, modelFor: agent });
      if (settings.mode && settings.mode !== thread.meta.mode) change.mode = settings.mode;
    }
    if (Object.keys(change).length) setMeta(box.id, change);
  }, [thread, box.id, box.live?.cwd]);
  // opened to do something (from the empty board): told it once it works in its own folder (never before, in the home one)
  useEffect(() => {
    const ask = openings.get(box.id);
    if (!ask || !thread || !box.live?.cwd || thread.meta.cwd !== box.live.cwd || box.live.cwd === weld.info.home) return;
    openings.delete(box.id);
    opened.set(box.id, Date.now());
    // (the app checks the folder too: it runs only where it was told it would)
    void weld.thread.send(box.id, { text: ask, keys: seesOf(editor, box.id), cwd: box.live.cwd }).catch(() => openings.set(box.id, ask));
  }, [thread, box.id, box.live?.cwd, editor]);
  // the card is named after what was first asked
  useEffect(() => {
    if (meta?.title && !box.text) editor.store.quiet(() => editor.store.patch(box.id, { text: meta.title }));
  }, [meta?.title, box.text, box.id, editor]);
  // looked at: no longer waiting to be seen
  useEffect(() => {
    if (active && !far && !box.live?.tall && meta?.unread) void weld.thread.seen(box.id);
  }, [active, far, meta?.unread, box.id, box.live?.tall]);

  const state: "working" | "ready" | "error" | "quiet" = meta?.asking ? "ready" : running ? "working" : meta?.error ? "error" : meta?.unread ? "ready" : "quiet";
  const title = box.text || meta?.title || "New thread";
  // (read from the bar, a thread kept off the board has no card to fold or take off)
  const away = !!awayBox(editor, box.id);
  const folded = !!box.live?.tall && box.h <= FOLDED_H + 4;
  // pulled taller by its handle (or by an agent), a folded thread is open, at the height it was given
  useEffect(() => {
    if (box.live?.tall && box.h > FOLDED_H + 4) {
      const { tall: _t, ...rest } = box.live;
      editor.store.quiet(() => editor.store.patch(box.id, { live: rest }));
    }
  }, [box.live, box.h, box.id, editor]);
  const lastLine = useMemo(() => {
    // under way, the step it is on in words (the same line its name tag shows); after, the last thing it said
    if (running) return doingNow(items, true, meta?.cwd);
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i]!;
      if (it.parent) continue;
      if (running && it.kind === "tool") return `${verbOf(it)} ${shortTitle(it, meta?.cwd)}`.trim();
      if (it.kind === "text" && it.text) return it.text.replace(/[#*`>]/g, "").replace(/\s+/g, " ").trim().slice(0, 200);
      if (it.kind === "error") return it.text;
    }
    return undefined;
  }, [items, running, meta?.cwd]);

  const setCwd = async () => {
    const dir = await weld.pickFolder(meta?.cwd);
    if (!dir) return;
    setMeta(box.id, { cwd: dir });
    remember({ cwd: dir });
    editor.store.quiet(() => editor.store.patch(box.id, { live: { ...box.live, cwd: dir } }));
  };
  const fork = async () => {
    const id = openBeside(editor, box.id, "thread", { cwd: meta?.cwd }, `${title} (copy)`);
    adopt(await weld.thread.fork(box.id, id));
  };

  return (
    <div className="live-sheet flex h-full w-full flex-col overflow-hidden rounded-[12px]" data-folded={folded || undefined}>
      <Head state={state}>
        <Dot state={state} />
        <span className="live-title min-w-0 flex-1 truncate">{title}</span>
        {folded && state !== "quiet" && <span className="live-meta live-fold-state" data-state={state}>{meta?.asking ? "Waiting for you" : running ? "Working" : state === "error" ? "Stopped" : "Ready"}</span>}
        {running && meta?.startedAt && <span className="live-meta">{span(now - meta.startedAt)}</span>}
        {!running && items.length > 0 && (
          <button type="button" aria-label="Copy this thread beside it" title="Branch into a new thread" className="live-icon ctl" onMouseDown={(e) => e.preventDefault()} onClick={() => void fork()}>
            <GitFork size={14} />
          </button>
        )}
        {!running && !meta?.outside && (meta?.agent === "claude" || meta?.agent === "codex") && !!meta?.sessions?.[meta.agent] && <Elsewhere id={box.id} agent={meta.agent} sid={meta.sessions[meta.agent]!} />}
        {/* minimised, a thread keeps only its title bar (and its place); the same button opens it again */}
        {!away && <button type="button" aria-label={folded ? "Open this thread" : "Minimise this thread"} title={folded ? "Open" : "Minimise"} className="live-icon ctl" onMouseDown={(e) => e.preventDefault()} onClick={() => fold(editor, box.id, !folded)}>
          {folded ? <ArrowsOutSimple size={14} /> : <Minus size={14} weight="bold" />}
        </button>}
        {/* closed, last, as windows close: off the board, still kept in the bar (nothing of it is lost) */}
        {!away && (
          <button type="button" aria-label="Close this thread" title="Close (it stays in the bar)" className="live-icon ctl" onMouseDown={(e) => e.preventDefault()} onClick={() => sendThreadAway(editor, box.id)}>
            <X size={14} weight="bold" />
          </button>
        )}
      </Head>
      {/* folded, the rest is hidden, not taken away: a reply half written is still there when it opens */}
      <div className="contents" style={folded ? { display: "none" } : undefined}>
        {meta?.outside && (
          <div className="thread-outside" role="status">
            {meta.outside.pending ? (
              <span>Opening in {meta.outside.app}…</span>
            ) : (
              <>
                <span>Open in {meta.outside.app}. When you're done there, close it and bring it back here.</span>
                <TakeBack id={box.id} app={meta.outside.app} />
              </>
            )}
          </div>
        )}
      <Sees editor={editor} id={box.id} />
      <Transcript items={items} meta={meta} running={running} active={active} editor={editor} id={box.id} unsaved={thread?.unsaved} />
      {meta && <Composer id={box.id} editor={editor} meta={meta} items={items} running={running} active={active && !far && !folded} onFolder={() => void setCwd()} />}
      </div>
      {folded ? <FarBar w={box.w} title={title} state={state} note={meta?.asking ? "Waiting for you" : undefined} /> : <FarCard w={box.w} h={box.h} icon={ChatCircle} title={title} line={lastLine} state={state} note={meta?.asking ? "Waiting for you" : undefined} />}
    </div>
  );
}

// ── the record ──────────────────────────────────────────────────────
type Block = { kind: "one"; item: Item } | { kind: "work"; id: string; steps: Item[] };

/** What fixes a thread's failure, if it is its agent missing or signed out (Claude Code and Codex only: Weld knows how to set those up). */
function fixFor(text: string | undefined, agent: string | undefined): { agent: Native; what: "install" | "signIn"; label: string } | null {
  if (agent !== "claude" && agent !== "codex" && agent !== undefined) return null;
  const a: Native = agent === "codex" ? "codex" : "claude";
  if (notInstalled(text)) return { agent: a, what: "install", label: `Install ${SETUP[a].name}` };
  if (wantsSignIn(text)) return { agent: a, what: "signIn", label: `Sign in to ${SETUP[a].name}` };
  return null;
}

function blocksOf(items: Item[]): { blocks: Block[]; kids: Map<string, Item[]> } {
  const blocks: Block[] = [], kids = new Map<string, Item[]>();
  for (const it of items) {
    if (it.parent) {
      const list = kids.get(it.parent) ?? [];
      list.push(it);
      kids.set(it.parent, list);
      continue;
    }
    if (it.kind === "tool" || it.kind === "thinking") {
      if (it.kind === "thinking" && !it.text?.trim()) continue;
      const last = blocks[blocks.length - 1];
      if (last?.kind === "work") last.steps.push(it);
      else blocks.push({ kind: "work", id: `w${it.id}`, steps: [it] });
    } else if (it.kind === "text" && !it.text?.trim() && !it.streaming) continue;
    else blocks.push({ kind: "one", item: it });
  }
  return { blocks, kids };
}

const Transcript = memo(function Transcript({ items, meta, running, active, editor, id, unsaved }: { items: Item[]; meta: Meta | undefined; running: boolean; active: boolean; editor: NodeProps["editor"]; id: string; unsaved?: string | null }) {
  const scroller = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  const { blocks, kids } = useMemo(() => blocksOf(items), [items]);
  // (a failure offers its fix only while it is the thread's last word: anything after it means it was got past)
  const lastError = useMemo(() => (items.at(-1)?.kind === "error" ? items.at(-1)!.id : undefined), [items]);
  // Follows what is being written, until the reader scrolls away from the end: once a frame, just before the page
  // lays out anyway (asking for the height straight after each change would lay everything out there and then).
  const follow = useRef(0);
  const moved = useRef(0);
  const held = useRef(false);
  useLayoutEffect(() => {
    if (follow.current || !stuck.current) return;
    follow.current = requestAnimationFrame(() => {
      follow.current = 0;
      const el = scroller.current;
      if (el && stuck.current) el.scrollTop = el.scrollHeight;
    });
  });
  useEffect(() => () => cancelAnimationFrame(follow.current), []);
  const inner = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current, body = inner.current;
    if (!el || !body) return;
    const ro = new ResizeObserver(() => {
      if (stuck.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(body);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const open = useCallback((url: string) => void openBeside(editor, id, "browser", { url }), [editor, id]);
  return (
    <div
      ref={scroller}
      className="live-body thread-scroll min-h-0 flex-1 px-4 py-4"
      // Back at the end, it follows again; it lets go only when the reader moves it (its own following moves it too,
      // and that must not count: more may have arrived by the time the page says it has moved)
      onWheel={() => (moved.current = performance.now())}
      onKeyDown={() => (moved.current = performance.now())}
      onPointerDown={() => {
        // held (on the scroll bar, say) for as long as it is held
        held.current = true;
        const up = () => {
          held.current = false;
          moved.current = performance.now();
          window.removeEventListener("pointerup", up, true);
          window.removeEventListener("pointercancel", up, true);
        };
        window.addEventListener("pointerup", up, true);
        window.addEventListener("pointercancel", up, true);
      }}
      onScroll={(e) => {
        const el = e.currentTarget;
        const end = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        if (end) stuck.current = true;
        else if (held.current || performance.now() - moved.current < 600) stuck.current = false;
      }}
    >
      {!items.length && meta && (
        <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
          <div className="mb-1.5"><AgentLogo id={meta.agent} size={26} /></div>
          <div className="text-[13px] font-medium text-(--live-ink)">{agentName(meta.agent)}</div>
          {/* (a scratch folder's long name says nothing: a real one says where it will work) */}
          {!isScratch(meta.cwd) && <div className="text-[12px] text-(--live-sub)">{tilde(meta.cwd)}</div>}
        </div>
      )}
      <div ref={inner} className="flex flex-col gap-3">
        {blocks.map((b, i) =>
          b.kind === "work" ? (
            <Work key={b.id} steps={b.steps} kids={kids} cwd={meta?.cwd} live={running && i === blocks.length - 1} />
          ) : b.item.kind === "user" ? (
            <div key={b.item.id} className="thread-said">{b.item.text}</div>
          ) : b.item.kind === "text" ? (
            <Said key={b.item.id} item={b.item} open={open} />
          ) : b.item.kind === "changes" ? (
            <Changed key={b.item.id} item={b.item} editor={editor} />
          ) : b.item.kind === "ask" ? (
            <Ask key={b.item.id} item={b.item} thread={id} cwd={meta?.cwd} />
          ) : b.item.kind === "plan" ? (
            <Plan key={b.item.id} item={b.item} />
          ) : b.item.kind === "error" ? (
            <div key={b.item.id} className="contents">
              <div className="thread-error">{b.item.text}</div>
              {fixFor(b.item.text, meta?.lastAgent ?? meta?.agent) && b.item.id === lastError && (
                <div className="thread-fix">
                  <button type="button" className="setup-go ctl" onMouseDown={(e) => e.preventDefault()} onClick={() => setUp(editor, fixFor(b.item.text, meta?.lastAgent ?? meta?.agent)!.agent, fixFor(b.item.text, meta?.lastAgent ?? meta?.agent)!.what, id)}>
                    {fixFor(b.item.text, meta?.lastAgent ?? meta?.agent)!.label}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div key={b.item.id} className="thread-note">{b.item.text}</div>
          ),
        )}
        {running && <StillWorking items={items} meta={meta} />}
        {unsaved && <div className="thread-error">Not saved: {unsaved}. Weld keeps trying.</div>}
      </div>
      {/* keeps the last line clear of the composer's edge */}
      <div className="h-1" data-active={active || undefined} />
    </div>
  );
});

/** What was said, cut where one block ends and the next begins, so a piece still being written only re-reads its own last block. */
function partsOf(text: string): string[] {
  const out: string[] = [];
  let cur: string[] = [], fence = false, blank = false;
  for (const line of text.split("\n")) {
    const f = /^\s*(```|~~~)/.test(line);
    // a new block starts after an empty line, at a line that cannot belong to what came before (not indented, not a list or quote going on)
    if (!fence && blank && line.trim() && !/^(\s|[-*+>|]|\d+[.)])/.test(line) && cur.length) {
      out.push(cur.join("\n"));
      cur = [];
    }
    if (f) fence = !fence;
    blank = !fence && !line.trim();
    cur.push(line);
  }
  if (cur.length) out.push(cur.join("\n"));
  return out;
}
const PLUGINS = [remarkGfm];
const Said = memo(function Said({ item, open }: { item: Item; open: (url: string) => void }) {
  const parts = useMemo(() => partsOf(item.text ?? ""), [item.text]);
  return (
    <div className={`prose-live ${item.streaming ? "thread-caret" : ""}`}>
      {parts.map((p, i) => <Part key={i} text={p} open={open} />)}
    </div>
  );
});
const Part = memo(function Part({ text, open }: { text: string; open: (url: string) => void }) {
  return (
      <Markdown
        remarkPlugins={PLUGINS}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              onClick={(e) => {
                e.preventDefault();
                if (href && /^https?:/.test(href)) open(href);
              }}
            >
              {children}
            </a>
          ),
          // (a picture an agent names is not fetched by itself: what the window loads would reach the network for an
          // agent that may not; it is a link, opened beside the thread when pressed)
          img: ({ src, alt }) => (
            <a
              href={typeof src === "string" ? src : undefined}
              onClick={(e) => {
                e.preventDefault();
                if (typeof src === "string" && /^https?:/.test(src)) open(src);
              }}
            >
              {alt || "picture"}
            </a>
          ),
        }}
      >
        {text}
      </Markdown>
  );
});

/** Bring a thread back from its agent's own app; while a run of it is still going there, only on being pressed again. */
function TakeBack({ id, app }: { id: Id; app: string }) {
  const [live, setLive] = useState(false);
  return (
    <>
      {live && <span className="sub">It's still open in {app}: close it there first.</span>}
      <button type="button" className="live-chip ctl" onMouseDown={(e) => e.preventDefault()} onClick={async () => { const r = await weld.thread.takeBack(id, false); setLive(!!r.live || !!r.pending); }}>
        {live ? "Check again" : "Back in Weld"}
      </button>
      {live && (
        <button type="button" className="live-chip ctl" onMouseDown={(e) => e.preventDefault()} onClick={async () => { const r = await weld.thread.takeBack(id, true); setLive(!!r.live || !!r.pending); }}>
          Bring it back anyway
        </button>
      )}
    </>
  );
}

/** Continue a thread's session in its agent's own app (where its own commands, /remote-control say, work), or copy
 *  its session id: from a small menu in the thread's title bar. */
function Elsewhere({ id, agent, sid }: { id: Id; agent: "claude" | "codex"; sid: string }) {
  // (the menu is put over everything, under the button, not inside the card: the card clips what reaches past it)
  const [at, setAt] = useState<null | { right: number; top: number }>(null), [said, setSaid] = useState("");
  const here = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const app = agent === "claude" ? "Claude Code" : "Codex";
  useEffect(() => {
    if (!at) return;
    const away = (e: Event) => !here.current?.contains(e.target as Node) && !menu.current?.contains(e.target as Node) && setAt(null);
    // (Escape closes the menu, and only the menu)
    const esc = (e: KeyboardEvent) => e.key === "Escape" && (e.preventDefault(), e.stopImmediatePropagation(), setAt(null));
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("wheel", away, true);
    window.addEventListener("keydown", esc, true);
    return () => (window.removeEventListener("pointerdown", away, true), window.removeEventListener("wheel", away, true), window.removeEventListener("keydown", esc, true));
  }, [at]);
  const toggle = () => {
    setSaid("");
    const r = here.current?.getBoundingClientRect();
    // (kept inside the window: under the button, or above it when there is no room below)
    setAt((a) => (a || !r ? null : { right: Math.min(Math.max(8, window.innerWidth - r.right), Math.max(8, window.innerWidth - 8 - 260)), top: r.bottom + 4 + 120 > window.innerHeight ? Math.max(8, r.top - 4 - 120) : r.bottom + 4 }));
  };
  return (
    <>
      <button ref={here} type="button" aria-label={`Continue in ${app}`} title={`Continue in ${app}`} aria-expanded={!!at} className="live-icon ctl" onMouseDown={(e) => e.preventDefault()} onClick={toggle}>
        <TerminalWindow size={14} />
      </button>
      {at && createPortal(
        <div ref={menu} className="live-menu ui-in thread-elsewhere" role="menu" style={{ right: at.right, top: at.top }}>
          <button type="button" role="menuitem" onMouseDown={(e) => e.preventDefault()} onClick={async () => { const r = await weld.thread.handOut(id); if (r.error) setSaid(r.error); else setAt(null); }}>
            Continue in {app}
            <span className="sub">in Terminal</span>
          </button>
          <button type="button" role="menuitem" onMouseDown={(e) => e.preventDefault()} onClick={async () => { try { await navigator.clipboard.writeText(sid); setSaid("Copied"); } catch { setSaid("Couldn't copy"); } }}>
            Copy session id
            <span className="sub">{sid.slice(0, 18)}…</span>
          </button>
          {said && <div className="sub px-3 pb-2" role="status">{said}</div>}
        </div>,
        document.body,
      )}
    </>
  );
}

/** What an agent is doing just now, in a line: the step under way, or the last thing it said. */
export function doingNow(items: Item[], running: boolean, cwd?: string): string {
  if (running) {
    // in the turn under way: a question waiting on the person, a step still running, then words being written, then the last step taken
    let from = items.length;
    while (from > 0 && items[from - 1]!.kind !== "user") from--;
    const turn = items.slice(from).filter((it) => !it.parent);
    const ask = turn.find((it) => it.kind === "ask" && it.status === "waiting");
    if (ask) return `Asks to use ${ask.name ?? "a tool"}${ask.title ? `: ${shortTitle(ask, cwd)}` : ""}`.slice(0, 90);
    const step = [...turn].reverse().find((it) => it.kind === "tool" && it.status === "running") ?? null;
    if (step) return stepLine(step, cwd, verbOf(step) || "Running").slice(0, 90);
    const live = [...turn].reverse().find((it) => it.streaming);
    if (live) return live.kind === "thinking" ? "Thinking" : "Writing";
    const last = [...turn].reverse().find((it) => it.kind === "tool");
    return last ? stepLine(last, cwd, verbOf(last) || "Ran").slice(0, 90) : "Working";
  }
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]!;
    if (it.parent) continue;
    if (running && it.kind === "tool") return `${verbOf(it) || "Running"} ${shortTitle(it, cwd)}`.trim().slice(0, 90);
    if (running && it.kind === "thinking") return "Thinking";
    if (it.kind === "text" && it.text) return running ? "Writing" : it.text.replace(/[#*`>]/g, "").replace(/\s+/g, " ").trim().slice(0, 140);
    if (it.kind === "error") return it.text ?? "";
    if (it.kind === "user") return running ? "Starting" : "";
  }
  return "";
}
/** The last few steps of a thread, each in a line, newest last. */
export function lastSteps(items: Item[], cwd?: string, n = 5): { id: string; line: string; status?: string }[] {
  return items.filter((it) => !it.parent && it.kind === "tool").slice(-n).map((it) => ({ id: it.id, line: stepLine(it, cwd, verbOf(it)).slice(0, 80), status: it.status }));
}
/** What a turn changed on disk: the files, how much, and (opened) the changes themselves. */
/** The other threads that worked in the same folder during a turn: what changed there may be theirs too. */
function Alongside({ ids, editor }: { ids: string[]; editor: NodeProps["editor"] }) {
  const all = useThreads();
  // (by the name its card has on the board, as the person sees it)
  const names = ids.map((x) => (editor.store.doc.shapes[x] as Box | undefined)?.text || all.get(x)?.meta.title || "another thread");
  const said = names.length === 1 ? `“${names[0]}”` : names.length === 2 ? `“${names[0]}” and “${names[1]}”` : `${names.length} other threads`;
  return <div className="thread-note px-2">{names.length === 1 ? `${said} was` : `${said} were`} also working in this folder</div>;
}

const Changed = memo(function Changed({ item, editor }: { item: Item; editor: NodeProps["editor"] }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<string | null>(null);
  const files = item.files ?? [];
  const add = files.reduce((n, f) => n + (f.add ?? 0), 0), del = files.reduce((n, f) => n + (f.del ?? 0), 0);
  const parts = useMemo(() => {
    const out = new Map<string, string[]>();
    if (!open) return out;
    for (const chunk of (item.patch ?? "").split(/^(?=diff --git )/m)) {
      const m = /^diff --git a\/(.+?) b\/(.+)$/m.exec(chunk);
      if (!m) continue;
      out.set(m[2]!, chunk.split("\n").filter((l) => !/^(diff --git|index |--- |\+\+\+ |similarity|rename |new file|deleted file)/.test(l)));
    }
    return out;
  }, [open, item.patch]);
  return (
    <div className="thread-changes">
      <button type="button" className="thread-step" onClick={() => setOpen((o) => !o)}>
        {open ? <CaretDown size={10} weight="bold" className="shrink-0 opacity-60" /> : <CaretRight size={10} weight="bold" className="shrink-0 opacity-60" />}
        <span className="verb">Changed {files.length === 1 ? files[0]!.path.split("/").pop() : `${files.length} files`}</span>
        <span className="shrink-0 tabular-nums"><span className="text-(--live-green)">+{add}</span> <span className="text-(--live-red)">−{del}</span></span>
      </button>
      {!!item.alongside?.length && <Alongside ids={item.alongside} editor={editor} />}
      {open && (
        <div className="ml-4 flex flex-col">
          {files.map((f) => (
            <div key={f.path}>
              <button type="button" className="thread-step" onClick={() => setFile((x) => (x === f.path ? null : f.path))}>
                <code className="min-w-0 truncate">{f.path}</code>
                <span className="shrink-0 tabular-nums">{f.add === null ? "binary" : <><span className="text-(--live-green)">+{f.add}</span> <span className="text-(--live-red)">−{f.del}</span></>}</span>
              </button>
              {file === f.path && (
                <div className="thread-out thread-diff">
                  {(parts.get(f.path) ?? ["(not shown: too large)"]).map((l, i) => (
                    <span key={i} className={l.startsWith("+") ? "add" : l.startsWith("-") ? "del" : l.startsWith("@@") ? "hunk" : ""}>{l || " "}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {item.cut && <div className="thread-note px-2">Only the first part of the changes is kept here.</div>}
        </div>
      )}
    </div>
  );
});

/** The agent asks to do something it may not do by itself: allowed or declined here, and it waits until then. */
const Ask = memo(function Ask({ item, thread, cwd }: { item: Item; thread: string; cwd?: string }) {
  const what = shortTitle(item, cwd);
  const waiting = item.status === "waiting";
  // what is asked for is shown whole, exactly as it would be done: nothing cut short or tidied
  const input = (item.input ?? {}) as Record<string, unknown>;
  const whole = item.name === "Bash" && typeof input.command === "string" ? input.command : JSON.stringify(input, null, 2);
  const answer = (allow: boolean) => void weld.thread.answer(thread, item.id, allow);
  if (!waiting)
    return (
      <div className="thread-step thread-work" data-status={item.status === "denied" ? "error" : undefined}>
        {item.status === "allowed" ? <Check size={10} weight="bold" className="shrink-0 opacity-45" /> : <X size={10} weight="bold" className="shrink-0" />}
        <span className="verb">{item.status === "allowed" ? "Allowed" : item.status === "denied" ? "Declined" : "Not answered"}</span>
        <code>{item.name === "Bash" ? what : `${item.name} ${what}`.trim()}</code>
      </div>
    );
  return (
    <div className="thread-ask">
      <div className="thread-ask-what">{item.name === "Bash" ? "Run this command?" : `Use ${item.name}?`}</div>
      <code className="thread-ask-code">{whole}</code>
      {item.text && item.text !== whole && <div className="thread-ask-why">{item.text}</div>}
      <div className="flex gap-1.5 pt-1">
        <button type="button" className="thread-ask-yes ctl" onMouseDown={(e) => e.preventDefault()} onClick={() => answer(true)}>Allow</button>
        <button type="button" className="thread-ask-no ctl" onMouseDown={(e) => e.preventDefault()} onClick={() => answer(false)}>Decline</button>
      </div>
    </div>
  );
});
function verbOf(it: Item): string {
  const n = it.name ?? "";
  if (it.kind === "thinking") return "Thought";
  // (an ACP agent's step titles are already sentences, "Reading README.md": no verb is put before them)
  if (it.acpKind && it.title) return "";
  if (n === "Bash") return "";
  if (n === "Read") return "Read";
  if (n === "Edit" || n === "MultiEdit" || n === "NotebookEdit") return "Edited";
  if (n === "Write") return "Wrote";
  if (n === "Grep") return "Searched";
  if (n === "Glob") return "Listed";
  if (n === "Task" || n === "Agent") return "Agent";
  if (n === "WebFetch") return "Fetched";
  if (n === "WebSearch") return "Searched the web";
  if (n === "TodoWrite") return "Updated the plan";
  if (n === "ToolSearch") return "Looked up tools";
  return n.replace(/^mcp__/, "").replace(/__/g, " · ");
}
function shortTitle(it: Item, cwd?: string): string {
  let t = String(it.title ?? "");
  if (cwd && t.startsWith(`${cwd}/`)) t = t.slice(cwd.length + 1);
  return t.replace(/\s+/g, " ").slice(0, 300);
}
/** A step in words: the board's own commands, and files written from the shell, said as what they do. */
function stepLine(it: Item, cwd: string | undefined, verb: string): string {
  const cmd = String(it.title ?? "").trim();
  const first = cmd.split(/\s*(?:;|&&|\|\||\n)\s*/)[0] ?? "";
  const unq = (x: string) => x.replace(/^['"]|['"]$/g, "");
  const m = /^weld\s+(\w+)\s*(?:--show\s+)?(.*)$/.exec(first);
  if (m) {
    const [, what, rest] = m;
    if (what === "draw") return "Drawing on the board";
    if (what === "look") return "Looking at the board";
    if (what === "open") return `Opening ${unq(rest!).replace(/^https?:\/\//, "")}`.slice(0, 90);
    if (what === "run") return `Starting ${unq(rest!)}`.slice(0, 90);
    if (what === "logs") return "Reading a server's output";
    if (what === "help") return "Reading how to use the board";
  }
  const wrote = /(?:^|\s)(?:cat|printf|echo|tee)\b[^>]*>\s*([^\s<;&|]+)/.exec(first);
  if (wrote) return `Writing ${wrote[1]!.replace(cwd ? `${cwd}/` : "\u0000", "")}`;
  return `${verb} ${shortTitle(it, cwd)}`.trim();
}

/** While a turn goes on, its last line always says so: what it is doing and for how long, ticking, so a quiet agent never looks stuck. */
function StillWorking({ items, meta }: { items: Item[]; meta: Meta | undefined }) {
  const now = useNow(true);
  const asking = !!meta?.asking;
  const doing = asking ? "Waiting for you" : doingNow(items, true, meta?.cwd);
  return (
    <div className="thread-still" data-asking={asking || undefined}>
      {!asking && <span className="thread-spin" />}
      <span className="min-w-0 truncate">{doing}</span>
      {meta?.startedAt && <span className="shrink-0 tabular-nums opacity-70">{span(now - meta.startedAt)}</span>}
    </div>
  );
}

/** A run of the agent's own steps between two things it said. Finished, it folds to one line. */
const Work = memo(function Work({ steps, kids, cwd, live }: { steps: Item[]; kids: Map<string, Item[]>; cwd?: string; live: boolean }) {
  const [openAll, setOpenAll] = useState(false);
  const tools = steps.filter((s) => s.kind === "tool");
  if (!live && !openAll) {
    const n = tools.length;
    const label = n === 0 ? "Thought" : n === 1 ? `${verbOf(tools[0]!)} ${shortTitle(tools[0]!, cwd)}`.trim() : `${n} steps`;
    return (
      <button type="button" className="thread-step thread-work" onClick={() => setOpenAll(true)}>
        <CaretRight size={10} weight="bold" className="shrink-0 opacity-60" />
        {n === 1 && tools[0]!.name === "Bash" ? <code>{label}</code> : <span className="truncate">{label}</span>}

      </button>
    );
  }
  const shown = live && !openAll ? steps.slice(-5) : steps;
  const hidden = steps.length - shown.length;
  return (
    <div className="thread-work flex flex-col">
      {!live && (
        <button type="button" className="thread-step" onClick={() => setOpenAll(false)}>
          <CaretDown size={10} weight="bold" className="shrink-0 opacity-60" />
          <span>{tools.length} steps</span>
        </button>
      )}
      {hidden > 0 && (
        <button type="button" className="thread-step" onClick={() => setOpenAll(true)}>
          <span className="opacity-70">{hidden} earlier</span>
        </button>
      )}
      {shown.map((s) => <Step key={s.id} item={s} kids={kids.get(s.id)} cwd={cwd} />)}
    </div>
  );
}, (a, b) => a.live === b.live && a.cwd === b.cwd && a.steps.length === b.steps.length && a.steps.every((s, i) => s === b.steps[i]) && a.steps.every((s) => a.kids.get(s.id)?.length === b.kids.get(s.id)?.length));

function Step({ item, kids, cwd }: { item: Item; kids?: Item[]; cwd?: string }) {
  const [open, setOpen] = useState(false);
  const verb = verbOf(item), title = item.kind === "thinking" ? "" : shortTitle(item, cwd);
  const edit = diffOf(item);
  const sub = kids?.filter((k) => k.kind === "tool").length ?? 0;
  const todos = item.name === "TodoWrite" ? ((item.input?.todos as { content: string; status: string }[] | undefined) ?? []) : null;
  const body = item.kind === "thinking" ? item.text : item.output;
  return (
    <>
      <button type="button" className="thread-step" data-status={item.status} onClick={() => setOpen((o) => !o)}>
        {item.status === "running" ? <span className="thread-spin" /> : item.status === "error" ? <X size={10} weight="bold" className="shrink-0" /> : item.status === "stopped" ? <span className="inline-block w-[10px] shrink-0 text-center opacity-50">–</span> : <Check size={10} weight="bold" className="shrink-0 opacity-45" />}
        {verb && <span className="verb">{verb}</span>}
        {title && <code>{title}</code>}
        {edit && <span className="shrink-0 tabular-nums"><span className="text-(--live-green)">+{edit.add.length}</span> <span className="text-(--live-red)">−{edit.del.length}</span></span>}
        {sub > 0 && <span className="shrink-0 opacity-70">{sub} steps</span>}
      </button>
      {open && edit && (
        <div className="thread-out">
          {edit.del.map((l, i) => <span key={`d${i}`} className="del">- {l}</span>)}
          {edit.add.map((l, i) => <span key={`a${i}`} className="add">+ {l}</span>)}
        </div>
      )}
      {open && todos && (
        <div className="mb-1 ml-4 flex flex-col">{todos.map((t, i) => <div key={i} className="thread-todo" data-s={t.status}>{t.content}</div>)}</div>
      )}
      {open && !edit && !todos && (body || item.name === "Bash") && <div className="thread-out">{body || "(no output)"}</div>}
      {open && kids && kids.length > 0 && (
        <div className="ml-4 flex flex-col border-l border-(--live-line) pl-3">
          {kids.filter((k) => k.kind === "tool").map((k) => <Step key={k.id} item={k} cwd={cwd} />)}
        </div>
      )}
    </>
  );
}
function diffOf(it: Item): { add: string[]; del: string[] } | null {
  const inp = it.input as Record<string, unknown> | undefined;
  if (!inp) return null;
  if (it.name === "Edit" && typeof inp.new_string === "string") return { del: String(inp.old_string ?? "").split("\n"), add: inp.new_string.split("\n") };
  if (it.name === "Write" && typeof inp.content === "string") return { del: [], add: inp.content.split("\n").slice(0, 400) };
  if (it.name === "MultiEdit" && Array.isArray(inp.edits)) {
    const e = inp.edits as { old_string?: string; new_string?: string }[];
    return { del: e.flatMap((x) => String(x.old_string ?? "").split("\n")), add: e.flatMap((x) => String(x.new_string ?? "").split("\n")) };
  }
  return null;
}

// ── saying something ────────────────────────────────────────────────
function Composer({ id, editor, meta, items, running, active, onFolder }: { id: string; editor: NodeProps["editor"]; meta: Meta; items: Item[]; running: boolean; active: boolean; onFolder: () => void }) {
  // what is being written is kept as it is written, so closing the window (or the app going) never loses it
  const draftKey = `weld:draft:${id}`;
  const [text, setText] = useState(() => {
    try {
      return localStorage.getItem(draftKey) ?? "";
    } catch {
      return "";
    }
  });
  // (kept as it is typed: the same thread read in the bar and on the board takes up the reply where it was left)
  useEffect(() => {
    try {
      if (text) localStorage.setItem(draftKey, text);
      else localStorage.removeItem(draftKey);
    } catch {
      /* no storage: the draft lives as long as the window */
    }
  }, [text, draftKey]);
  // (and whatever was typed in the last moment before the window goes)
  const latest = useRef(text);
  latest.current = text;
  useEffect(() => {
    const keep = () => {
      try {
        if (latest.current) localStorage.setItem(draftKey, latest.current);
        else localStorage.removeItem(draftKey);
      } catch {
        /* no storage */
      }
    };
    window.addEventListener("beforeunload", keep);
    // (and when it goes: a reply half written in the bar's reader, folded away, is there when it opens again)
    return () => (window.removeEventListener("beforeunload", keep), keep());
  }, [draftKey]);
  const [menu, setMenu] = useState<null | "agent" | "mode">(null);
  // pointing at things on the board: typing @ (or the @ button) lists them; the one chosen is named in the message
  const [pick, setPick] = useState<{ q: string; from: number; at: number } | null>(null);
  const choices = useMemo(() => {
    if (!pick) return [];
    const q = pick.q.toLowerCase();
    return refsOn(editor, id).filter((r) => `${r.label} ${r.sub}`.toLowerCase().includes(q)).slice(0, 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick?.q, editor, id]);
  const pickList = useRef<HTMLDivElement>(null);
  useEffect(() => {
    pickList.current?.querySelector(`[data-i="${pick?.at ?? 0}"]`)?.scrollIntoView({ block: "nearest" });
  }, [pick?.at]);
  const lookFor = (value: string, caret: number) => {
    const m = /(^|\s)@([^\s@]{0,40})$/.exec(value.slice(0, caret));
    setPick(m ? { q: m[2]!, from: caret - m[2]!.length - 1, at: 0 } : null);
  };
  const choose = (r: Ref | undefined) => {
    if (!r) return;
    const el = area.current;
    const caret = el?.selectionStart ?? text.length;
    const word = `@${r.label} `;
    // in place of the @ and what was typed after it, or, pointed at on the board with ⌘, where the caret is
    const from = pick ? pick.from : caret;
    const lead = !pick && from > 0 && !/\s/.test(text[from - 1]!) ? " " : "";
    const next = text.slice(0, from) + lead + word + text.slice(caret);
    caretTo.current = from + lead.length + word.length;
    setText(next);
    // named once, it stays with the thread: shown to the agent with every message, as it is then
    see(editor, id, r.key);
    setPick(null);
  };
  // while this composer has the keys, a press on the board (with the @ list open, or with ⌘) points at what is pressed
  const chooseRef = useRef(choose);
  chooseRef.current = choose;
  const [keys, setKeys] = useState(false);
  useEffect(() => {
    if (!active || !keys) return;
    picking.thread = id;
    picking.add = (key) => {
      const r = resolve(editor, key);
      if (r) chooseRef.current(r);
    };
    // another app, or another part of this one, taking the keys ends it too
    const away = () => setKeys(false);
    window.addEventListener("blur", away);
    return () => {
      window.removeEventListener("blur", away);
      if (picking.thread === id) Object.assign(picking, { thread: null, add: null, open: false });
    };
  }, [active, keys, id, editor]);
  useEffect(() => {
    if (picking.thread === id) picking.open = !!pick;
  }, [pick, id]);
  // letters typed at this thread while it was seen from far off (or on the way to it) arrive here, in order
  useEffect(() => {
    const take = (e: Event) => {
      const d = (e as CustomEvent<{ id: string; text: string }>).detail;
      if (d.id !== id) return;
      setText((t) => {
        const next = d.text === "\b" ? t.slice(0, -1) : t + d.text;
        caretTo.current = next.length;
        return next;
      });
    };
    window.addEventListener("weld:type", take);
    return () => window.removeEventListener("weld:type", take);
  }, [id]);
  // the caret is put back the moment the new words are in, before another key can land
  const caretTo = useRef<number | null>(null);
  useLayoutEffect(() => {
    const c = caretTo.current, el = area.current;
    if (c === null || !el || !active) return;
    caretTo.current = null;
    el.focus();
    el.setSelectionRange(c, c);
  }, [text, active]);
  const area = useRef<HTMLTextAreaElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (active) area.current?.focus({ preventScroll: true });
    else {
      area.current?.blur();
      setMenu(null);
    }
  }, [active]);
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(180, Math.max(36, el.scrollHeight))}px`;
  }, [text]);
  useEffect(() => {
    if (!menu) return;
    const away = (e: PointerEvent) => {
      if (!(e.target instanceof Node) || !wrap.current?.contains(e.target)) setMenu(null);
    };
    window.addEventListener("pointerdown", away, true);
    return () => window.removeEventListener("pointerdown", away, true);
  }, [menu]);

  const send = () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    try {
      localStorage.removeItem(draftKey);
    } catch {
      /* no storage */
    }
    setPick(null);
    // everything the thread has been pointed at is shown to the agent as it is now (a page as it looks this moment, a drawing as drawn);
    // messages go in the order they were sent, however long the pictures for each take
    // (only which things are sent now: what they hold is asked for as the agent's turn begins, so a message that
    // waits its turn still shows them as they are then)
    void weld.thread.send(id, { text: t, keys: seesOf(editor, id) });
  };
  // the plan the agent is keeping, as it last wrote it
  const todos = useMemo(() => {
    if (!running) return null;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i]!;
      if (it.name === "TodoWrite" && !it.parent) return ((it.input?.todos as { content: string; status: string }[] | undefined) ?? []).filter((t) => t.status !== "completed").slice(0, 3);
      if (it.kind === "user") break;
    }
    return null;
  }, [items, running]);

  return (
    <div ref={wrap} className="live-foot live-body relative shrink-0 px-3 pb-3">
      {todos && todos.length > 0 && (
        <div className="mb-2 flex flex-col px-1">{todos.map((t, i) => <div key={i} className="thread-todo" data-s={t.status}>{t.status === "in_progress" ? <span className="thread-spin relative top-[1px]" /> : <span className="inline-block w-[10px] shrink-0 text-center opacity-50">·</span>}<span className="truncate">{t.content}</span></div>)}</div>
      )}
      {(meta.services?.length ?? 0) > 0 && (
        <div className="mb-2 flex flex-col gap-1">
          {meta.services!.map((s) => (
            <div key={s.id} className="thread-service">
              <span className="live-dot" data-state={s.alive ? "working" : "quiet"} />
              <code className="min-w-0 flex-1 truncate">{s.cmd}</code>
              {!s.alive && <span className="shrink-0 text-(--live-sub)">ended</span>}
              <button type="button" className="live-chip ctl" onMouseDown={(e) => e.preventDefault()} onClick={() => showService(editor, id, s)}>Show output</button>
              <button type="button" aria-label="Stop" title="Stop" className="live-icon ctl !size-6" onMouseDown={(e) => e.preventDefault()} onClick={() => void weld.thread.unservice(id, s.id)}><X size={11} /></button>
            </div>
          ))}
        </div>
      )}
      {meta.queue.length > 0 && (
        <div className="mb-2 flex flex-col gap-1">
          {meta.queue.map((q) => (
            <div key={q.at} className="flex items-center gap-2 rounded-lg border border-dashed border-(--live-line) px-3 py-1 text-[12px] text-(--live-sub)">
              <span className="min-w-0 flex-1 truncate">{q.text}</span>
              {/* waiting behind the turn under way; with none under way (the app was closed meanwhile), sent when asked */}
              {running || meta.outside ? (
                <span className="shrink-0">{meta.outside ? `once it's back from ${meta.outside.app}` : "next"}</span>
              ) : (
                <button type="button" className="live-chip ctl shrink-0 !h-5" onMouseDown={(e) => e.preventDefault()} onClick={() => void weld.thread.sendQueued(id, q.at)}>Send</button>
              )}
              <button type="button" aria-label="Remove" className="live-icon ctl !size-5" onClick={() => void weld.thread.unqueue(id, q.at)}><X size={10} /></button>
            </div>
          ))}
        </div>
      )}
      <div className="thread-compose">
        <textarea
          ref={area}
          rows={1}
          value={text}
          placeholder={running ? "Say what comes next" : items.length ? "Reply" : "Ask for something"}
          onChange={(e) => {
            // the first letter typed is notice enough: the agent is started now, so its first word comes sooner
            if (!text && e.target.value && !running) weld.thread.warm(id);
            setText(e.target.value);
            lookFor(e.target.value, e.target.selectionStart ?? e.target.value.length);
          }}
          onFocus={() => setKeys(true)}
          onBlur={() => setTimeout(() => {
            if (document.activeElement === area.current) return;
            setPick(null);
            setKeys(false);
          }, 150)}
          onKeyDown={(e) => {
            if (pick && choices.length) {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const step = e.key === "ArrowDown" ? 1 : -1;
                setPick((p) => p && { ...p, at: (p.at + step + choices.length) % choices.length });
                return;
              }
              if ((e.key === "Enter" || e.key === "Tab") && !e.nativeEvent.isComposing) {
                e.preventDefault();
                choose(choices[pick.at]);
                return;
              }
            }
            if (pick && e.key === "Escape") {
              e.preventDefault();
              setPick(null);
              return;
            }
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            } else if (e.key === "Escape") {
              // Escape lets go: of the menu, then of the thread itself
              e.preventDefault();
              if (menu) setMenu(null);
              else window.dispatchEvent(new CustomEvent("weld:leave"));
            }
          }}
        />
        {/* (narrow, the folder's name gives way first and the send button never leaves) */}
        <div className="flex min-w-0 items-center gap-0.5 px-1.5 pb-1.5">
          <button type="button" className={`live-chip ctl shrink-0 ${menu === "agent" ? "is-on" : ""}`} onClick={() => setMenu((m) => (m === "agent" ? null : "agent"))}>
            <AgentLogo id={meta.agent} />
            <span>{agentName(meta.agent)}</span>
            <CaretDown size={9} weight="bold" className="opacity-60" />
          </button>
          <button type="button" className={`live-chip ctl min-w-0 ${menu === "mode" ? "is-on" : ""}`} onClick={() => setMenu((m) => (m === "mode" ? null : "mode"))}>
            <span className="truncate">{MODES[meta.mode]?.name ?? "Full access"}</span>
            <CaretDown size={9} weight="bold" className="opacity-60" />
          </button>
          <button
            type="button"
            className={`live-chip ctl shrink-0 ${pick ? "is-on" : ""}`}
            aria-label="Point at something on the board"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const el = area.current;
              if (!el) return;
              const c = el.selectionStart ?? text.length;
              const lead = c > 0 && !/\s/.test(text[c - 1]!) ? " @" : "@";
              const next = text.slice(0, c) + lead + text.slice(c);
              caretTo.current = c + lead.length;
              setText(next);
              setPick({ q: "", from: c + lead.length - 1, at: 0 });
            }}
          >
            <At size={12} />
          </button>
          <button type="button" className="live-chip ctl min-w-0" title={tilde(meta.cwd)} onClick={onFolder}>
            <Folder size={12} className="shrink-0" />
            <span className="truncate">{folderName(meta.cwd)}</span>
          </button>
          <span className="min-w-0 flex-1" />
          {running && !text.trim() ? (
            <button type="button" aria-label="Stop" className="thread-send ctl shrink-0" data-stop="1" onClick={() => void weld.thread.stop(id)}><Stop size={11} weight="fill" /></button>
          ) : (
            <button type="button" aria-label="Send" className="thread-send ctl shrink-0" disabled={!text.trim()} onClick={send}><KeyReturn size={13} weight="bold" /></button>
          )}
        </div>
      </div>
      {pick && (
        <div ref={pickList} className="live-menu ui-in bottom-[calc(100%+4px)] left-3 right-3 max-h-[260px] overflow-y-auto" style={{ ["--from" as string]: "3px" }}>
          {choices.map((r, i) => {
            const I = ICONS[r.kind];
            return (
              <button key={r.key} type="button" data-i={i} data-on={i === pick.at || undefined} onMouseDown={(e) => e.preventDefault()} onMouseMove={() => setPick((p) => p && { ...p, at: i })} onClick={() => choose(r)}>
                <span className="w-3"><I size={12} /></span>
                <span className="min-w-0 flex-1 truncate">{r.label}</span>
                <span className="sub max-w-[40%] shrink-0 truncate">{r.sub}</span>
              </button>
            );
          })}
          {!choices.length && <div className="px-3 py-2 text-[12px] text-(--live-sub)">Nothing on the board by that name</div>}
        </div>
      )}
      {menu === "agent" && (
        <div className="live-menu ui-in bottom-[52px] left-3" style={{ ["--from" as string]: "3px" }}>
          {agentList(true)
            // (an ACP agent is listed once it is installed; Claude, Codex and the person's own always)
            .filter((a) => a.kind !== "flavor" || a.installed || a.id === meta.agent)
            .map((a) => (
              <button key={a.id} type="button" aria-current={meta.agent === a.id} disabled={!a.installed} onClick={() => (setMeta(id, { agent: a.id }), remember({ agent: a.id }), setMenu(null))}>
                <AgentLogo id={a.id} />
                {a.name}
                <span className="sub">{!a.installed ? "not installed" : a.id !== meta.agent && items.length && !meta.sessions[a.id] ? "picks up from here" : subOf(a)}</span>
              </button>
            ))}
        </div>
      )}
      {menu === "mode" && (
        <div className="live-menu ui-in bottom-[52px] left-[72px]" style={{ ["--from" as string]: "3px" }}>
          {(Object.keys(MODES) as Mode[]).map((m) => {
            // (a mode is offered for an agent only where Weld can make sure it holds)
            const can = agentOf(meta.agent)?.modes.includes(m) ?? true;
            return (
              <button key={m} type="button" aria-current={meta.mode === m} disabled={!can} onClick={() => (setMeta(id, { mode: m }), remember({ mode: m }), setMenu(null))}>
                {MODES[m].name}
                <span className="sub">{can ? MODES[m].sub : `Not available for ${agentName(meta.agent)} yet`}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** An ACP agent's plan, as a checklist. */
function Plan({ item }: { item: Item }) {
  return (
    <div className="thread-plan">
      {(item.entries ?? []).map((e, i) => (
        <div key={i} className={`thread-plan-step ${e.status === "completed" ? "is-done" : e.status === "in_progress" ? "is-now" : ""}`}>
          <span className="thread-plan-box">{e.status === "completed" ? "✓" : e.status === "in_progress" ? "•" : ""}</span>
          <span>{e.content}</span>
        </div>
      ))}
    </div>
  );
}

