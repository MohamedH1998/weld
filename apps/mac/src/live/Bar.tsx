// The bar: one place, at the bottom of the window, to ask an agent for something. A thread started here is kept off the
// board; the agent is seen on the board only while it works (its mark goes where the work is). Above the bar, a capsule
// says what each of these threads is doing, and asks for the person there when it needs them; pressed, it opens the
// whole conversation, which folds back down when done with. Any thread can still be put on the board as a card.
import { memo, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CaretDown, Folder, KeyReturn, X } from "@phosphor-icons/react";
import type { Editor } from "@weld/canvas/editor";
import { boundsOf } from "@weld/canvas/geometry";
import type { Box, Id } from "@weld/canvas/types";
import { agentList, agentName, agentsFound, agentsKnown, enable, enabled, boardDir, chosenAgent, chosenModel, defaultCwd, folderName, installed, modelsOf, remember, setBoardDir, settings, tilde, weld } from "./bridge";
import type { Item } from "./bridge";
import { smiths, smithsVersion, subscribeSmiths } from "./smith";
import { openings } from "./opening";
import { awayBox, awayThreads, goTo, landThread, startThread } from "./place";
import { doingNow, subOf, ThreadNode } from "./ThreadNode";
import { AgentLogo } from "./AgentLogo";
import { ensure, useThreads } from "./threads";
import { drawingKeys, resolve } from "./refs";
import { isSetup, SETUP, setUp } from "./setup";
import type { Native } from "./setup";

// what a new board offers to make, each showing what the board is for
const TASKS: { label: string; ask: string }[] = [
  { label: "A to-do app", ask: "Build a tiny to-do app I can use, and open it here beside us." },
  { label: "Git rebase, drawn", ask: "Explain how git rebase works in a few sentences, with a small before-and-after drawing of the commits here on the board." },
  { label: "A live clock", ask: "Write a small script that shows the time, updating every second, and run it in a terminal here on the board so I can watch it." },
];

/** With no agent switched on: the two Weld knows, each switched on with a press if it is on this Mac, or installed (and
 *  signed in to) in a terminal on the board if it is not. */
function Setup({ editor, onEnable, leaving, hold }: { editor: Editor; onEnable: () => void; leaving: boolean; hold: (on: boolean) => void }) {
  const found = agentsFound();
  // (each pressed once: then the button goes to its terminal, which says how it went)
  const [term, setTerm] = useState<Partial<Record<Native, Id>>>({});
  return (
    // (the pointer resting on it keeps it open: it goes a moment after it leaves, or with a press anywhere else)
    <div className={`setup ${leaving ? "setup-leaving" : ""}`} onPointerEnter={() => hold(true)} onPointerLeave={() => hold(false)}>
      <div className="setup-head">
        <div className="setup-title">Weld runs the coding agents you use</div>
      </div>
      <div className="setup-card">
        {(Object.keys(SETUP) as Native[]).map((a) => (
          <div key={a} className="setup-row">
            <span className="setup-logo"><AgentLogo id={a} size={16} /></span>
            <span className="setup-name">{SETUP[a].name}<span className="setup-by">{SETUP[a].by}</span></span>
            {found.some((x) => x.id === a && x.installed) ? (
              // (one button, two faces: Enable gives way to Enabled in place, the tick drawn in as the green comes up)
              <button type="button" className="setup-toggle" data-on={enabled(a) || undefined} aria-disabled={enabled(a)} onMouseDown={(e) => e.preventDefault()} onClick={() => !enabled(a) && (enable(a), onEnable())}>
                <span className="setup-toggle-off">Enable</span>
                <span className="setup-toggle-on" aria-hidden={!enabled(a)}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.4 4.9 8.7 9.6 3.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  Enabled
                </span>
              </button>
            ) : term[a] && editor.store.doc.shapes[term[a]!] ? (
              <button type="button" className="setup-go ctl" data-quiet onMouseDown={(e) => e.preventDefault()} onClick={() => goTo(editor, term[a]!)}>Installing…</button>
            ) : (
              <button type="button" className="setup-go ctl" onMouseDown={(e) => e.preventDefault()} onClick={() => setTerm((t) => ({ ...t, [a]: setUp(editor, a, "install") }))}>Install</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** What a capsule says of its thread: a question for the person, what it is doing, or that it is done. */
function lineOf(items: Item[], running: boolean, cwd: string | undefined, error: boolean): { ask?: Item; text: string } {
  const ask = [...items].reverse().find((i) => i.kind === "ask" && i.status === "waiting");
  if (ask) {
    const input = (ask.input ?? {}) as Record<string, unknown>;
    const what = ask.name === "Bash" && typeof input.command === "string" ? input.command : ask.name ?? "";
    return { ask, text: ask.name === "Bash" ? `Run ${what}?` : `Use ${what}?` };
  }
  if (running) return { text: doingNow(items, true, cwd) || "Working" };
  return { text: error ? "Stopped" : "Done" };
}

export const Bar = memo(function Bar({ editor, dark }: { editor: Editor; dark: boolean }) {
  const store = editor.store;
  useSyncExternalStore(store.subscribe, store.getStill, () => 0);
  useSyncExternalStore(subscribeSmiths, smithsVersion, () => 0);
  const threads = useThreads();
  const [text, setText] = useState("");
  const [reading, setReading] = useState<Id | null>(null);
  const [trouble, setTrouble] = useState("");
  // (the first card stays once an agent is enabled on it, so the others can be too: it goes by itself 3 s after the last
  // press, unless the pointer is resting on it, or at once with a press anywhere else)
  const [setting, setSetting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const timer = useRef(0);
  const putAway = useCallback(() => {
    window.clearTimeout(timer.current);
    setLeaving(true);
    timer.current = window.setTimeout(() => (setSetting(false), setLeaving(false)), 200);
  }, []);
  const soon = useCallback(() => (window.clearTimeout(timer.current), (timer.current = window.setTimeout(putAway, 3000))), [putAway]);
  useEffect(() => {
    if (!setting) return;
    const off = (e: PointerEvent) => !(e.target as Element | null)?.closest?.(".setup") && putAway();
    window.addEventListener("pointerdown", off, true);
    return () => window.removeEventListener("pointerdown", off, true);
  }, [setting, putAway]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const area = useRef<HTMLTextAreaElement>(null);
  const away = awayThreads(editor);
  for (const b of away) ensure(b.id);
  const agents = Object.values(installed()).some(Boolean);
  // (not yet known for a moment on a first launch: nothing is offered or refused until it is)
  const known = agentsKnown();
  // (with none yet: asked again every few seconds, so one installed from the board wakes the bar up; sooner while unknown)
  const [, looked] = useState(0);
  useEffect(() => {
    if (agents) return;
    const again = () => (agentList(true), looked((n) => n + 1));
    const off = weld.onEnv(again);
    const t = window.setInterval(again, known ? 2500 : 250);
    return () => (window.clearInterval(t), off());
  }, [agents, known]);
  // who a new thread is asked of, and with which model: chosen here, and remembered for the next
  const agentId = chosenAgent();
  const agent = agentName(agentId);
  const models = modelsOf(agentId);
  const model = chosenModel(agentId);
  const [menu, setMenu] = useState<null | "agent" | "model">(null);
  const [, chose] = useState(0);
  const choose = (change: Parameters<typeof remember>[0]) => (remember(change), setMenu(null), chose((n) => n + 1), requestAnimationFrame(() => area.current?.focus()));
  const dir = boardDir();
  // (a menu open here closes when anything else is pressed)
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const away = (e: PointerEvent) => !bar.current?.contains(e.target as Node) && setMenu(null);
    window.addEventListener("pointerdown", away, true);
    return () => window.removeEventListener("pointerdown", away, true);
  }, [menu]);

  // asked for from elsewhere: the menu's New Thread (and the toolbar's), going to a thread kept here, or reading one
  useEffect(() => {
    const ask = () => (setReading(null), requestAnimationFrame(() => area.current?.focus()));
    const read = (e: Event) => setReading((e as CustomEvent<Id>).detail);
    window.addEventListener("weld:ask", ask);
    window.addEventListener("weld:read", read);
    return () => (window.removeEventListener("weld:ask", ask), window.removeEventListener("weld:read", read));
  }, []);
  // (a conversation that left, put on the board or gone, is no longer read here)
  if (reading && !awayBox(editor, reading)) queueMicrotask(() => setReading(null));
  // Escape folds the conversation back into the bar
  useEffect(() => {
    if (!reading) return;
    // (before the conversation's own reply box takes it; a menu open in it closes first)
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector(".ask-reader .live-menu, .ask-reader [role=menu], .ask-reader [role=listbox]")) return;
      e.preventDefault();
      e.stopPropagation();
      setReading(null);
    };
    window.addEventListener("keydown", esc, true);
    return () => window.removeEventListener("keydown", esc, true);
  }, [reading]);

  // what is selected on the board goes with the ask: a chip names it, and the thread started is connected to it (× leaves it out)
  const [dropped, setDropped] = useState("");
  const pointed = pointAt(editor);
  const pointing = pointed && pointed.key !== dropped ? pointed : null;
  const start = (ask: string, own = true) => {
    const t = ask.trim();
    if (!t || !agents) return;
    // the board's folder, or (a board with none, or a suggestion, which is a try-out) a folder of its own
    const cwd = own ? defaultCwd() : (weld.scratch() ?? null);
    if (!cwd) return setTrouble("Couldn't make a folder for it to work in. Try again, or choose a folder for this board.");
    setTrouble("");
    // (and the part picked, so its work lands level with it)
    const picked = pointing && editor.store.sel.size ? boundsOf(editor.store.doc, [...editor.store.sel]) : null;
    startThread(editor, t, cwd, pointing ? [pointing.key] : [], picked ?? undefined);
    setDropped("");
    setText("");
  };

  // the threads kept here that have something to say (at work, waiting for the person, or done and not yet read), then
  // those the person closed, sent back here by its X, the latest first: a thread closed is in the bar, never just gone
  const saying = ({ b, t }: { b: Box; t: ReturnType<typeof threads.get> }) => openings.has(b.id) || !!(t && (t.meta.status === "running" || t.meta.asking || t.meta.unread || t.meta.error));
  const all = away.map((b) => ({ b, t: threads.get(b.id) }));
  const live = [...all.filter(saying), ...all.filter((x) => !saying(x) && x.b.live?.closed).sort((x, y) => (y.b.live!.closed ?? 0) - (x.b.live!.closed ?? 0))];
  const empty = store.doc.order.length === 0 && away.length === 0 && smiths.size === 0 && store.tool === "select" && !store.busy;
  const open = reading ? awayBox(editor, reading) : undefined;
  // (with no agent yet: the card offering them, on a board that is empty but for the terminals it opened; elsewhere, Settings)
  const onboarding = empty || (store.doc.order.length > 0 && store.doc.order.every((id) => isSetup(store.doc.shapes[id] as Box | undefined)) && away.length === 0 && smiths.size === 0);

  return (
    <div className="ask-dock pointer-events-none absolute inset-x-0 bottom-[76px] z-40 flex justify-center px-4">
      <div className="ask-col pointer-events-auto">
        {/* (a thread just started is told what was asked as soon as it is ready, whether or not it is being read) */}
        {away.filter((b) => openings.has(b.id) && b.id !== reading).map((b) => (
          <div key={b.id} hidden><ThreadNode box={b} editor={editor} active={false} far={false} dark={dark} /></div>
        ))}
        {trouble && <div className="welcome-trouble">{trouble}</div>}
        {((!agents && known && onboarding) || setting) && !reading && <Setup editor={editor} leaving={leaving} onEnable={() => (setSetting(true), setLeaving(false), soon(), looked((n) => n + 1))} hold={(on) => setting && (on ? window.clearTimeout(timer.current) : soon())} />}
        {empty && !reading && agents && !setting && (
          <div className="welcome-tasks">
            {TASKS.map((t) => (
              <button key={t.label} type="button" className="welcome-task ctl" onMouseDown={(e) => e.preventDefault()} onClick={() => start(t.ask, false)}>
                {t.label}
              </button>
            ))}
          </div>
        )}
        {open ? (
          <Reader key={open.id} box={open} editor={editor} dark={dark} close={() => setReading(null)} />
        ) : (
          live.length > 0 && (
            <div className="ask-capsules">
              {live.slice(0, 3).map(({ b, t }) => (
                <Capsule key={b.id} box={b} items={t?.items ?? []} running={t?.meta.status === "running" || openings.has(b.id)} error={!!t?.meta.error} title={b.text || t?.meta.title || "New thread"} cwd={t?.meta.cwd} onOpen={() => setReading(b.id)} />
              ))}
              {live.length > 3 && <span className="ask-more">+{live.length - 3}</span>}
            </div>
          )
        )}
        {!open && (
          <div className="ask-bar" ref={bar}>
            <textarea
              ref={area}
              rows={1}
              value={text}
              placeholder={agents || !known ? `Ask ${agent} to make something…` : onboarding ? "Add an agent above to start" : "Add an agent in Settings (⌘,) to start"}
              disabled={!agents}
              aria-label="Ask an agent"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                // (Escape closes a menu, then gives the keys back to the board)
                if (e.key === "Escape") return void (menu ? setMenu(null) : e.currentTarget.blur());
                e.stopPropagation();
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  start(text);
                }
              }}
            />
            <div className="ask-row">
              {pointing && (
                <span className="live-chip ask-point shrink-0" title={`Goes with what you ask: ${pointing.label}`}>
                  <span>{pointing.label}</span>
                  <button type="button" aria-label={`Leave out ${pointing.label}`} onMouseDown={(e) => e.preventDefault()} onClick={() => setDropped(pointing.key)}><X size={11} weight="bold" /></button>
                </span>
              )}
              <button type="button" className={`live-chip ctl shrink-0 ${menu === "agent" ? "is-on" : ""}`} disabled={!agents} onMouseDown={(e) => e.preventDefault()} onClick={() => setMenu((m) => (m === "agent" ? null : "agent"))}>
                <AgentLogo id={agentId} />
                <span>{agent}</span>
                <CaretDown size={9} weight="bold" className="opacity-60" />
              </button>
              {models.length > 0 && (
                <button type="button" className={`live-chip ctl min-w-0 ${menu === "model" ? "is-on" : ""}`} disabled={!agents} onMouseDown={(e) => e.preventDefault()} onClick={() => setMenu((m) => (m === "model" ? null : "model"))}>
                  <span className="truncate">{models.find((m) => m.id === model)?.name ?? "Default"}</span>
                  <CaretDown size={9} weight="bold" className="opacity-60" />
                </button>
              )}
              <button
                type="button"
                className="live-chip ctl ask-folder min-w-0"
                title={dir ? tilde(dir) : undefined}
                disabled={!agents}
                onMouseDown={(e) => e.preventDefault()}
                onClick={async () => {
                  const d = await weld.pickFolder(dir ?? undefined);
                  if (d) await setBoardDir(d);
                  store.emit();
                }}
              >
                <Folder size={12} className="shrink-0" />
                <span className="truncate">{dir ? folderName(dir) : "scratch"}</span>
              </button>
              <span className="min-w-0 flex-1" />
              <button type="button" aria-label="Ask" className="welcome-go ctl" disabled={!text.trim()} onMouseDown={(e) => e.preventDefault()} onClick={() => start(text)}>
                <KeyReturn size={14} weight="bold" />
              </button>
            </div>
            {menu === "agent" && (
              <div className="live-menu ui-in ask-menu" style={{ ["--from" as string]: "3px" }}>
                {agentList(true)
                  .filter((a) => a.kind !== "flavor" || a.installed)
                  .map((a) => (
                    <button key={a.id} type="button" aria-current={agentId === a.id} disabled={!a.installed} onMouseDown={(e) => e.preventDefault()} onClick={() => choose({ agent: a.id })}>
                      <AgentLogo id={a.id} />
                      {a.name}
                      <span className="sub">{a.installed ? subOf(a) : "not installed"}</span>
                    </button>
                  ))}
              </div>
            )}
            {menu === "model" && (
              <div className="live-menu ui-in ask-menu min-w-[150px]" style={{ ["--from" as string]: "3px" }}>
                {models.map((m) => (
                  <button key={m.id || "default"} type="button" aria-current={model === m.id} onMouseDown={(e) => e.preventDefault()} onClick={() => choose({ models: { ...settings.models, [agentId]: m.id } })}>
                    {m.name}
                    {m.sub && <span className="sub">{m.sub}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

function Capsule({ box, items, running, error, title, cwd, onOpen }: { box: Box; items: Item[]; running: boolean; error: boolean; title: string; cwd?: string; onOpen: () => void }) {
  const { ask, text } = lineOf(items, running, cwd, error);
  const state = ask ? "ready" : running ? "working" : error ? "error" : "done";
  return (
    <div className="ask-capsule" data-state={state} role="button" tabIndex={0} onClick={(e) => !(e.target as Element).closest("button") && onOpen()} onKeyDown={(e) => e.key === "Enter" && onOpen()}>
      <span className="live-dot" data-state={state === "done" ? "ready" : state} />
      <b className="ask-title">{title}</b>
      <span className="ask-line">{text}</span>
      {ask && (
        <>
          <button type="button" className="thread-ask-yes ctl" onMouseDown={(e) => e.preventDefault()} onClick={() => void weld.thread.answer(box.id, ask.id, true)}>Allow</button>
          <button type="button" className="thread-ask-no ctl" onMouseDown={(e) => e.preventDefault()} onClick={() => void weld.thread.answer(box.id, ask.id, false)}>Decline</button>
        </>
      )}
    </div>
  );
}

/** The whole conversation, risen from the bar: read and replied to here, put on the board, or folded back down. */
function Reader({ box, editor, dark, close }: { box: Box; editor: Editor; dark: boolean; close: () => void }) {
  return (
    <div className="ask-reader ui-in" data-live>
      <div className="ask-reader-acts">
        <button type="button" className="live-chip ctl" onMouseDown={(e) => e.preventDefault()} onClick={() => landThread(editor, box.id)}>Put on the board</button>
        <button type="button" className="live-chip ctl" onMouseDown={(e) => e.preventDefault()} onClick={close}>Fold</button>
      </div>
      <div className="ask-reader-sheet">
        <ThreadNode box={box} editor={editor} active far={false} dark={dark} />
      </div>
    </div>
  );
}

/** The one thing selected on the board, as a thread would be shown it: a page by its path, a drawing by its name. */
function pointAt(editor: Editor): { key: string; label: string } | null {
  const doc = editor.store.doc, sel = [...editor.store.sel];
  if (!sel.length) return null;
  const one = doc.shapes[sel[0]!] as Box | undefined;
  // (a terminal Weld opened to install or sign in to an agent holds sign-in links and codes: it never goes with a question by itself)
  if (sel.length === 1 && isSetup(one)) return null;
  if (sel.length === 1 && one && (one.kind === "browser" || one.kind === "terminal" || one.kind === "thread")) {
    if (one.kind !== "browser") return { key: `live:${one.id}`, label: one.text || (one.kind === "terminal" ? "Terminal" : "Thread") };
    const url = one.live?.url ?? "";
    let label = one.text || "Page";
    try { const u = new URL(/^[a-z]+:/i.test(url) ? url : `http://${url}`); label = u.pathname && u.pathname !== "/" ? u.pathname : u.host; } catch { /* named as it is */ }
    return { key: `live:${one.id}`, label };
  }
  const key = drawingKeys(editor, sel)[0];
  const r = key ? resolve(editor, key) : null;
  return key && r ? { key, label: r.label || "Drawing" } : null;
}
