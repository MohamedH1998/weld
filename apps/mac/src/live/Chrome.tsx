// What sits around the board: the strip the window is carried by, a
// count of what is working and what is waiting, and a list to jump by.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ChatCircle, FrameCorners, Globe, GearSix, MagnifyingGlass, Plus, Stack, TerminalWindow } from "@phosphor-icons/react";
import type { Editor } from "@weld/canvas/editor";
import type { Box, Id } from "@weld/canvas/types";
import { folderName, agentName } from "./bridge";
import { addLive, goTo, hueOf, liveInOrder } from "./place";
import { PeekBody } from "./Agents";
import { doingNow } from "./ThreadNode";
import type { LiveKind } from "./place";
import { useFacts, useThread, useThreads } from "./threads";
import { BoardSwitch, newBoard, openBoard, useBoards } from "./Boards";

type State = "working" | "ready" | "error" | "quiet";
const ICON = { thread: ChatCircle, terminal: TerminalWindow, browser: Globe } as const;

function useLive(editor: Editor) {
  const store = editor.store;
  useSyncExternalStore(store.subscribe, store.getStill, () => 0);
  const threads = useThreads(), facts = useFacts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const boxes = useMemo(() => liveInOrder(editor), [store.doc]);
  const stateOf = (b: Box): State => {
    if (b.kind === "thread") {
      const m = threads.get(b.id)?.meta;
      // waiting on the person to allow something is waiting for them, before it is working
      return m?.asking ? "ready" : m?.status === "running" ? "working" : m?.error ? "error" : m?.unread ? "ready" : "quiet";
    }
    return facts.get(b.id)?.busy ? "working" : "quiet";
  };
  const nameOf = (b: Box): string => {
    if (b.text) return b.text;
    // (one not yet named reads as empty here, so it is never taken for the command that makes a new one)
    if (b.kind === "thread") return threads.get(b.id)?.meta.title || "Empty thread";
    if (b.kind === "terminal") return folderName(b.live?.cwd);
    return facts.get(b.id)?.label || (b.live?.url ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "") || "Empty page";
  };
  const subOf = (b: Box): string => {
    if (b.kind === "thread") return folderName(threads.get(b.id)?.meta.cwd ?? b.live?.cwd);
    if (b.kind === "terminal") return facts.get(b.id)?.label ?? "";
    return (b.live?.url ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  };
  const asks = (b: Box) => b.kind === "thread" && !!threads.get(b.id)?.meta.asking;
  return { boxes, stateOf, nameOf, subOf, asks };
}

/** The next thing that wants looking at, after the one in hand: first what is ready, then what stopped. */
export function nextWaiting(editor: Editor, boxes: Box[], stateOf: (b: Box) => State): Id | null {
  const waiting = boxes.filter((b) => b.kind === "thread" && (stateOf(b) === "ready" || stateOf(b) === "error"));
  if (!waiting.length) return null;
  const cur = [...editor.store.sel][0];
  const i = waiting.findIndex((b) => b.id === cur);
  return waiting[(i + 1) % waiting.length]!.id;
}

export function TopBar({ editor, onPalette }: { editor: Editor; onPalette: () => void }) {
  const { boxes, stateOf, asks } = useLive(editor);
  const [list, setList] = useState(false);
  const threads = boxes.filter((b) => b.kind === "thread");
  const working = threads.filter((b) => stateOf(b) === "working");
  const ready = threads.filter((b) => stateOf(b) === "ready");
  const stopped = threads.filter((b) => stateOf(b) === "error");
  const cycle = (list: Box[]) => {
    const cur = [...editor.store.sel][0];
    const i = list.findIndex((b) => b.id === cur);
    const to = list[(i + 1) % list.length];
    if (to) goTo(editor, to.id);
  };
  return (
    <div className="app-drag absolute inset-x-0 top-0 z-40 flex h-11 items-center pl-[84px] pr-3">
      <BoardSwitch editor={editor} />
      <span className="flex-1" />
      <div className="app-no-drag flex items-center gap-1">
        {working.length > 0 && (
          <button type="button" className={`top-pill ctl ${list ? "is-on" : ""}`} data-state="working" onMouseDown={(e) => e.preventDefault()} onClick={() => setList((o) => !o)}>
            <span className="live-dot" data-state="working" />
            {working.length} working
          </button>
        )}
        {ready.length > 0 && (
          <button type="button" className="top-pill ctl" data-state="ready" onMouseDown={(e) => e.preventDefault()} onClick={() => cycle(ready)}>
            <span className="live-dot" data-state="ready" />
            {/* an agent held up on a question says so: it is not done, it is waiting */}
            {ready.every(asks) ? `${ready.length} asking` : ready.some(asks) ? `${ready.length} for you` : `${ready.length} ready`}
          </button>
        )}
        {stopped.length > 0 && (
          <button type="button" className="top-pill ctl" data-state="error" onMouseDown={(e) => e.preventDefault()} onClick={() => cycle(stopped)}>
            <span className="live-dot" data-state="error" />
            {stopped.length} stopped
          </button>
        )}
        <button type="button" aria-label="Jump to" className="top-pill ctl" onMouseDown={(e) => e.preventDefault()} onClick={onPalette}>
          <MagnifyingGlass size={13} />
          <kbd>⌘K</kbd>
        </button>
        <button type="button" aria-label="Settings" title="Settings (⌘,)" className="top-pill ctl" onMouseDown={(e) => e.preventDefault()} onClick={() => window.dispatchEvent(new Event("weld:settings"))}>
          <GearSix size={14} />
        </button>
      </div>
      {list && <Running editor={editor} threads={threads} stateOf={stateOf} close={() => setList(false)} />}
    </div>
  );
}

/** Every agent at work, or waiting: what each is doing now and for how long; a look closer on hover, a press to go there. */
function Running({ editor, threads, stateOf, close }: { editor: Editor; threads: Box[]; stateOf: (b: Box) => State; close: () => void }) {
  const order: Record<State, number> = { ready: 0, working: 1, error: 2, quiet: 3 };
  const rows = threads.filter((b) => stateOf(b) !== "quiet").sort((a, b) => order[stateOf(a)] - order[stateOf(b)]);
  const [peek, setPeek] = useState<Id | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (!(e.target instanceof Node) || !panel.current?.parentElement?.contains(e.target)) close();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", esc, true);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", esc, true);
    };
  }, [close]);
  if (!rows.length) return null;
  return (
    <div ref={panel} className="running ui-in app-no-drag" onMouseLeave={() => setPeek(null)}>
      <div className="running-list">
        {rows.map((b) => (
          <RunningRow key={b.id} editor={editor} box={b} state={stateOf(b)} onHover={() => setPeek(b.id)} go={() => (close(), goTo(editor, b.id))} />
        ))}
      </div>
      {peek && (
        <div className="running-peek agent-peek ui-in">
          <PeekBody id={peek} title={(editor.store.doc.shapes[peek] as Box | undefined)?.text} />
        </div>
      )}
    </div>
  );
}
function RunningRow({ editor, box, state, onHover, go }: { editor: Editor; box: Box; state: State; onHover: () => void; go: () => void }) {
  const t = useThread(box.id);
  const [, tick] = useState(0);
  useEffect(() => {
    if (state !== "working") return;
    const i = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(i);
  }, [state]);
  const meta = t?.meta;
  const doing = meta?.asking ? "Waiting for you" : state === "working" ? doingNow(t?.items ?? [], true, meta?.cwd) : state === "error" ? "Stopped" : "Ready for you";
  const secs = meta?.startedAt && state === "working" ? Math.max(0, Math.round((Date.now() - meta.startedAt) / 1000)) : null;
  return (
    <button type="button" className="running-row" style={{ ["--hue" as string]: hueOf(editor, box.id) }} onMouseEnter={onHover} onMouseDown={(e) => e.preventDefault()} onClick={go}>
      <span className="running-hue" />
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate font-medium">{box.text || meta?.title || "New thread"}</span>
        <span className="running-doing block truncate" data-state={state}>{doing}</span>
      </span>
      {secs !== null && <span className="shrink-0 tabular-nums text-(--live-sub)">{secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${String(secs % 60).padStart(2, "0")}s`}</span>}
      <span className="shrink-0 text-[11px] text-(--live-sub)">{agentName(meta?.agent)}</span>
    </button>
  );
}

interface Row {
  key: string;
  icon: React.ReactNode;
  name: string;
  sub: string;
  state?: State;
  run: () => void;
}

export function Palette({ editor, close, leaving }: { editor: Editor; close: () => void; leaving: boolean }) {
  const { boxes, stateOf, nameOf, subOf } = useLive(editor);
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const [boards] = useBoards();
  const states = boxes.map((b) => `${stateOf(b)}${nameOf(b)}`).join("|");
  const field = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => field.current?.focus(), []);
  const rows = useMemo<Row[]>(() => {
    const order: Record<State, number> = { ready: 0, error: 1, working: 2, quiet: 3 };
    const things: Row[] = [...boxes]
      .sort((a, b) => order[stateOf(a)] - order[stateOf(b)])
      .map((b) => {
        const I = ICON[b.kind as LiveKind];
        return { key: b.id, icon: <I size={15} />, name: nameOf(b), sub: subOf(b), state: stateOf(b), run: () => goTo(editor, b.id) };
      });
    // (a new thread is asked for in the bar)
    const make = (kind: LiveKind, name: string, keys: string): Row => ({ key: `new:${kind}`, icon: <Plus size={15} />, name, sub: keys, run: () => (kind === "thread" ? void window.dispatchEvent(new Event("weld:ask")) : void addLive(editor, kind)) });
    const acts: Row[] = [make("thread", "New thread", "⌘N"), make("terminal", "New terminal", "⌘T"), make("browser", "New page", "⌘B"), { key: "fit", icon: <MagnifyingGlass size={15} />, name: "See everything", sub: "⌘1", run: () => editor.fit() }];
    // a named frame drawn round some work is a place to go back to
    const places: Row[] = editor.store.doc.order
      .map((id) => editor.store.doc.shapes[id])
      .filter((s): s is Box => !!s && (s.kind === "frame" || s.kind === "boundary") && !!s.text.trim())
      .map((f) => ({ key: f.id, icon: <FrameCorners size={15} />, name: f.text.trim(), sub: "area", run: () => editor.fit([f.id]) }));
    // the other boards, and a new one
    const others: Row[] = boards.filter((b) => !b.current).map((b) => ({ key: `board:${b.id}`, icon: <Stack size={15} />, name: b.name, sub: "board", state: b.waiting ? "ready" : b.working ? "working" : undefined, run: () => void openBoard(editor, b.id) }));
    const all = [...things, ...places, ...others, ...acts, { key: "new:board", icon: <Plus size={15} />, name: "New board", sub: "", run: () => void newBoard(editor) }, { key: "settings", icon: <GearSix size={15} />, name: "Settings", sub: "⌘,", run: () => void window.dispatchEvent(new Event("weld:settings")) }, { key: "settings:agents", icon: <GearSix size={15} />, name: "Agents", sub: "enable Claude, Codex and others", run: () => void window.dispatchEvent(new Event("weld:settings")) }, { key: "settings:t3", icon: <GearSix size={15} />, name: "Connect T3 Code", sub: "T3", run: () => void window.dispatchEvent(new Event("weld:settings")) }];
    const needle = q.trim().toLowerCase();
    return needle ? all.filter((r) => `${r.name} ${r.sub}`.toLowerCase().includes(needle)) : all;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxes, q, states, boards]);
  useEffect(() => setAt(0), [q]);
  useEffect(() => {
    list.current?.querySelector(`[data-i="${at}"]`)?.scrollIntoView({ block: "nearest" });
  }, [at]);
  const pick = (r: Row | undefined) => {
    if (!r) return;
    close();
    r.run();
  };
  return (
    <div className="absolute inset-0 z-[60]" onPointerDown={close}>
      <div
        className={`palette absolute left-1/2 top-[18%] w-[min(560px,calc(100vw-48px))] -translate-x-1/2 ${leaving ? "ui-out" : "ui-in"}`}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <input
          ref={field}
          value={q}
          spellCheck={false}
          placeholder="Jump to a thread, terminal, page or board"
          aria-label="Jump to"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "ArrowDown") (e.preventDefault(), setAt((i) => Math.min(rows.length - 1, i + 1)));
            else if (e.key === "ArrowUp") (e.preventDefault(), setAt((i) => Math.max(0, i - 1)));
            else if (e.key === "Enter") (e.preventDefault(), pick(rows[at]));
            else if (e.key === "Escape") (e.preventDefault(), close());
          }}
        />
        <div ref={list} className="max-h-[min(52vh,420px)] overflow-y-auto p-1.5">
          {rows.map((r, i) => (
            <button key={r.key} type="button" data-i={i} data-on={i === at || undefined} className="palette-row" onMouseMove={() => setAt(i)} onClick={() => pick(r)}>
              <span className="flex w-5 shrink-0 justify-center text-(--live-sub)">{r.icon}</span>
              <span className="min-w-0 flex-1 truncate text-left">{r.name}</span>
              {r.state && r.state !== "quiet" && <span className="live-dot" data-state={r.state} />}
              <span className="max-w-[40%] shrink-0 truncate text-[12px] text-(--live-sub)">{r.sub}</span>
            </button>
          ))}
          {!rows.length && <div className="px-3 py-6 text-center text-[13px] text-(--live-sub)">Nothing by that name</div>}
        </div>
      </div>
    </div>
  );
}
