// The boards someone keeps: the one on screen named at the top of the window, the others a press away. Work on a board
// that is away goes on (its agents, its servers); a dot says one of them is at work or waiting.
import { useCallback, useEffect, useRef, useState } from "react";
import { CaretDown, Folder, Plus, X } from "@phosphor-icons/react";
import type { Editor } from "@weld/canvas/editor";
import { folderName, setBoardDir, tilde, weld } from "./bridge";
import type { BoardEntry } from "./bridge";
import { applied } from "./applied";

/** The board on screen written down, then another opened (the window loads afresh on it). If it could not be written
 *  down, it stays on screen: nothing on it is let go. */
export function openBoard(editor: Editor, id: string) {
  return leave(editor) ? weld.boards.open(id) : Promise.resolve(false);
}
function leave(editor: Editor) {
  const s = editor.store;
  editor.rest();
  if (!s.persist) return true;
  s.saveNow();
  return weld.board.saveNow({ doc: s.docJson(), cam: JSON.stringify(s.cam), board: weld.info.board?.id, done: [...applied] });
}

/** A new board for a folder (a project): named after it, and what is started on it works there. A folder that already has
 *  a board opens that one. Nothing is made if no folder is chosen. */
export async function newBoard(editor: Editor) {
  const dir = await weld.pickFolder(weld.info.board?.dir ?? undefined);
  if (!dir || !leave(editor)) return false;
  await weld.boards.create(undefined, dir);
  return true;
}

export function useBoards(): [BoardEntry[], () => void] {
  const [list, setList] = useState<BoardEntry[]>([]);
  const again = useCallback(() => void weld.boards?.list().then(setList, () => {}), []);
  useEffect(() => {
    again();
    // (how the others are doing, now and then: an agent away may finish or ask)
    const t = setInterval(again, 4000);
    return () => clearInterval(t);
  }, [again]);
  return [list, again];
}

const stateOf = (b: BoardEntry) => (b.waiting ? "ready" : b.working ? "working" : null);

export function BoardSwitch({ editor }: { editor: Editor }) {
  const [list, again] = useBoards();
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const me = list.find((b) => b.current) ?? { id: weld.info.board?.id ?? "main", name: weld.info.board?.name ?? "Board", dir: weld.info.board?.dir ?? null, current: true, working: 0, waiting: 0 };
  const away = list.filter((b) => !b.current);
  const elsewhere = away.some((b) => b.waiting) ? "ready" : away.some((b) => b.working) ? "working" : null;
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => !(e.target instanceof Node && wrap.current?.contains(e.target)) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", off, true);
    window.addEventListener("keydown", esc, true);
    return () => (window.removeEventListener("pointerdown", off, true), window.removeEventListener("keydown", esc, true));
  }, [open]);
  const rename = (name: string) => {
    setNaming(null);
    const n = name.trim();
    if (n && n !== me.name) void weld.boards.rename(me.id, n).then(again);
  };

  return (
    <div ref={wrap} className="board-switch app-no-drag relative">
      {naming !== null ? (
        <input
          autoFocus
          className="board-name-field"
          value={naming}
          aria-label="Board name"
          spellCheck={false}
          onChange={(e) => setNaming(e.target.value)}
          onBlur={() => rename(naming)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") rename(naming);
            else if (e.key === "Escape") setNaming(null);
          }}
        />
      ) : (
        <button
          type="button"
          className={`top-pill ctl board-name ${open ? "is-on" : ""}`}
          title="Boards"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => (setOpen((o) => !o), again())}
          onDoubleClick={() => (setOpen(false), setNaming(me.name))}
        >
          <span className="max-w-[220px] truncate">{me.name}</span>
          {elsewhere && <span className="live-dot" data-state={elsewhere} />}
          <CaretDown size={11} className="opacity-60" />
        </button>
      )}
      {open && (
        <div className="boards-menu ui-in">
          {list.map((b) => (
            <div key={b.id} className="boards-row" data-on={b.current || undefined}>
              <button
                type="button"
                className="boards-pick"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => (b.current ? (setOpen(false), setNaming(b.name)) : (setOpen(false), void openBoard(editor, b.id)))}
              >
                <span className="min-w-0 flex-1 truncate text-left">
                  {b.name}
                  {b.dir && folderName(b.dir) !== b.name && <span className="boards-dir"> · {folderName(b.dir)}</span>}
                </span>
                {stateOf(b) && <span className="live-dot" data-state={stateOf(b)!} />}
                {(b.working > 0 || b.waiting > 0) && (
                  <span className="shrink-0 text-[11px] text-(--live-sub)">{b.waiting ? `${b.waiting} for you` : `${b.working} working`}</span>
                )}
              </button>
              {!b.current && !b.working && (
                <button type="button" aria-label={`Put “${b.name}” away`} title="Put away" className="boards-away live-icon ctl" onMouseDown={(e) => e.preventDefault()} onClick={() => void weld.boards.putAway(b.id).then(again)}>
                  <X size={11} />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="boards-row boards-new boards-folder"
            title={me.dir ? tilde(me.dir) : undefined}
            onMouseDown={(e) => e.preventDefault()}
            onClick={async () => {
              setOpen(false);
              const dir = await weld.pickFolder(me.dir ?? undefined);
              if (dir && (await setBoardDir(dir))) again();
            }}
          >
            <Folder size={13} />
            <span className="min-w-0 truncate">{me.dir ? folderName(me.dir) : "Choose a folder"}</span>
          </button>
          <button type="button" className="boards-row boards-new" onMouseDown={(e) => e.preventDefault()} onClick={() => (setOpen(false), void newBoard(editor))}>
            <Plus size={13} />
            <span>New board</span>
          </button>
        </div>
      )}
    </div>
  );
}
