// What the page can ask of the app's own process (see electron/preload.cjs).
/** An agent's id: "claude", "codex", "acp:<flavor>" or "cmd:<id>". */
export type Agent = string;
/** A board someone keeps, and whether an agent on it is at work or waiting for them. */
export interface BoardEntry { id: string; name: string; dir: string | null; current: boolean; working: number; waiting: number }
export interface AgentInfo {
  id: Agent;
  name: string;
  kind: "native" | "flavor" | "command";
  installed: boolean;
  experimental?: boolean;
  modes: Mode[];
  signIn?: string;
}
export type Mode = "edits" | "full";

export interface Item {
  id: string;
  kind: "user" | "text" | "thinking" | "tool" | "error" | "note" | "ask" | "changes" | "plan";
  /** An ACP agent's plan: its steps and how far each has got. */
  entries?: { content: string; status?: string; priority?: string }[];
  /** An ACP agent's own word for what kind of step this is, and the files it touches. */
  acpKind?: string;
  locations?: { path: string; line?: number }[];
  /** What a turn changed on disk: each file, and the changes themselves. */
  files?: { path: string; add: number | null; del: number | null }[];
  patch?: string;
  cut?: boolean;
  /** Other threads that worked in the same folder during the turn these changes are of. */
  alongside?: string[];
  text?: string;
  at?: number;
  endedAt?: number;
  agent?: Agent;
  streaming?: boolean;
  /** A tool's name, what it was pointed at, what it was given and what came back. */
  name?: string;
  title?: string;
  input?: Record<string, unknown>;
  output?: string;
  status?: "running" | "done" | "error" | "stopped" | "waiting" | "allowed" | "denied";
  /** Done by a helper the agent started: the tool call that started it. */
  parent?: string;
}
export interface Meta {
  agent: Agent;
  /** Work its agent has going on in the background after its turn (a command, a helper agent), while it runs. */
  background?: { id: string; what: string; kind?: string; since: number }[];
  /** How many more than those shown (the newest dozen) it has going. */
  backgroundMore?: number;
  /** When the oldest of all it has going in the background began (ms). */
  backgroundSince?: number | null;
  mode: Mode;
  /** The model asked for, and the agent it was asked of (another agent goes with its own default). */
  model?: string;
  modelFor?: Agent;
  cwd: string;
  /** The real folder, widened to its git checkout: threads with the same one change the same files. */
  workspace?: string;
  title: string;
  status: "idle" | "running";
  unread: boolean;
  error?: string | null;
  queue: { text: string; at: number }[];
  sessions: Partial<Record<Agent, string>>;
  startedAt?: number;
  endedAt?: number;
  modelName?: string;
  lastAgent?: Agent;
  handoff?: boolean;
  /** It is waiting for the person to allow or decline something. */
  asking?: boolean;
  /** A smith: a helper with no card on the board, gone when its bubble is closed. */
  smith?: boolean;
  /** A smith over a page: it may edit that page's project (its working folder), and nothing more. */
  smithEdits?: boolean;
  /** What it has left running in the background (servers, watchers), each in a shell of its own. */
  services?: { id: string; cmd: string; cwd: string; alive: boolean; at: number }[];
}
export interface Thread {
  id: string;
  items: Item[];
  meta: Meta;
  /** Why the app couldn't write this thread to disk just now (it keeps trying); null when it is saved. */
  unsaved?: string | null;
}
export type ThreadEvent = { t: "item"; item: Item } | { t: "delta"; id: string; text: string } | { t: "meta"; meta: Meta } | { t: "unsaved"; why: string | null };
export type PtyEvent = { t: "data"; d: string } | { t: "proc"; proc: string } | { t: "exit"; code: number };
export interface Server {
  port: number;
  process: string;
  title: string;
  url: string;
}
export interface Settings {
  cwd?: string;
  agent?: Agent;
  mode?: Mode;
  /** The model last chosen for each agent (none: the agent's own default). */
  models?: Partial<Record<Agent, string>>;
  recent?: string[];
  /** The first board has been laid out once. */
  started?: boolean;
  /** The agents the person has switched on (an agent found on this Mac is offered, never used, until it is). */
  enabled?: Agent[];
}
/** Something on the board a message points at, as it is now (see live/refs.ts). */
export interface BoardRef {
  key: string;
  id?: string;
  kind: string;
  label: string;
  url?: string;
  webContentsId?: number;
  place?: { x: number; y: number; w: number; h: number };
  /** What the person's window shows of the board (with "self"). */
  view?: { x: number; y: number; w: number; h: number };
  structure?: { shapes: { id: string; kind: string; text: string; x: number; y: number; w: number; h: number; hidden?: true }[]; links: { id: string; from: string; to: string; text: string; hidden?: true }[]; states?: string[] };
  png?: string;
  /** Pictures among what is connected: their files and what was marked on them (in the picture's own pixels). */
  pictures?: {
    id: string;
    name: string;
    hash: string;
    ext: string;
    w: number;
    h: number;
    origin?: string;
    place: { x: number; y: number; w: number; h: number };
    marks: ({ kind: string; text: string; x: number; y: number; w: number; h: number } | { kind: "arrow"; text: string; from: { x: number; y: number }; to: { x: number; y: number } })[];
    /** Everything that decides how it and its marked files look (so "unchanged" means unchanged). */
    sig?: string;
    marked?: { file: string; w: number; h: number };
    crop?: { file: string; w: number; h: number };
  }[];
}
/** A picture kept by the app (electron/assets.mjs). */
export interface PictureAsset {
  hash: string;
  ext: string;
  w: number;
  h: number;
  name: string;
  preview?: boolean;
  origin?: string;
  error?: string;
}
export interface Weld {
  agentsNow: () => Record<Agent, boolean>;
  assets: {
    put: (buf: ArrayBuffer, meta: { name: string; mime: string; made?: boolean }) => Promise<PictureAsset & { file?: string }>;
    importFile: (abs: string) => Promise<PictureAsset>;
    read: (hash: string, ext: string, preview: boolean) => Promise<Uint8Array | null>;
    origins: (list: string[]) => Promise<void>;
    snapshot: (wcId: number, name: string) => Promise<PictureAsset>;
    pathOf: (file: File) => string;
  };
  onImage: (fn: (o: { asset: PictureAsset; from?: string; key?: string }) => void) => () => void;
  onImageChanged: (fn: (o: { origin: string; asset: PictureAsset }) => void) => () => void;
  agentList: () => AgentInfo[];
  saveAgent: (c: { id?: string; name: string; command: string; args: string[]; env: Record<string, string> }) => Promise<{ id?: string; error?: string }>;
  removeAgent: (id: string) => Promise<boolean>;
  /** T3 Code: whether it is on this Mac, and whether Weld is one of its agents; adding Weld to it, or taking it off. */
  t3: { state: () => Promise<{ installed: boolean; connected: boolean }>; connect: () => Promise<{ ok?: boolean; error?: string }>; disconnect: () => Promise<{ ok?: boolean; error?: string }> };
  info: { envKnown?: boolean; home: string; dev: boolean; version: string; agents: Record<Agent, boolean>; settings: Settings; models?: { codex?: { id: string; name: string; sub?: string }[] }; seed?: boolean; test?: boolean; board?: { id: string; name: string; dir?: string | null } };
  board: { load: () => { doc?: string; cam?: string } | null; save: (b: { doc: string | null; cam: string | null; board?: string; done?: string[] }) => Promise<boolean>; saveNow: (b: { doc: string | null; cam: string | null; board?: string; done?: string[] }) => boolean; keepAside: (board?: string) => void; threads: (ids: string[], ok: boolean, board?: string) => void };
  boards: {
    list: () => Promise<BoardEntry[]>;
    create: (name?: string, dir?: string) => Promise<string>;
    open: (id: string) => Promise<boolean>;
    rename: (id: string, name: string) => Promise<boolean>;
    setDir: (id: string, dir: string | null) => Promise<boolean>;
    putAway: (id: string) => Promise<boolean>;
  };
  saveSettings: (s: Settings) => Promise<void>;
  pickFolder: (start?: string) => Promise<string | null>;
  openExternal: (url: string) => Promise<void>;
  reveal: (p: string) => Promise<void>;
  servers: () => Promise<Server[]>;
  pty: {
    open: (id: string, o: { cwd?: string; cols: number; rows: number; run?: string }) => Promise<{ replay: string; alive: boolean; proc: string; fresh?: boolean }>;
    write: (id: string, d: string) => void;
    rerun: (id: string, command: string) => Promise<{ ok: boolean }>;
    typed: (id: string) => void;
    resize: (id: string, cols: number, rows: number) => void;
    close: (id: string) => Promise<void>;
    cwd: (id: string) => Promise<string | null>;
    onEvent: (fn: (id: string, ev: PtyEvent) => void) => () => void;
  };
  thread: {
    get: (id: string) => Promise<Thread>;
    send: (id: string, msg: { text: string; keys?: string[]; cwd?: string }) => Promise<void>;
    stop: (id: string) => Promise<void>;
    warm: (id: string) => void;
    set: (id: string, change: Partial<Pick<Meta, "agent" | "mode" | "cwd" | "title" | "smith">>) => Promise<Meta>;
    forget: (id: string) => Promise<void>;
    onBoard: (ids: string[]) => Promise<void>;
    seen: (id: string) => Promise<void>;
    unqueue: (id: string, at: number) => Promise<void>;
    sendQueued: (id: string, at: number) => Promise<void>;
    answer: (id: string, askId: string, allow: boolean) => Promise<void>;
    unservice: (id: string, svc: string) => Promise<void>;
    fork: (from: string, to: string) => Promise<Thread>;
    onEvent: (fn: (id: string, ev: ThreadEvent) => void) => () => void;
  };
  onMenu: (fn: (what: string) => void) => () => void;
  /** Something a shell or an agent asked the board for. */
  onDo: (fn: (o: ({ op: "open"; url: string; from: string | null } | { op: "run"; command: string; cwd?: string; from: string | null }) & { key?: string }) => void) => () => void;
  onOpen: (fn: (o: { url: string; from: number | null }) => void) => () => void;
  onPinch: (fn: (o: { from: number; dir?: "in" | "out"; dy?: number; x?: number; y?: number; sx?: number; sy?: number }) => void) => () => void;
  stillNow: (webContentsId: number) => void;
  pageAsleep: (webContentsId: number, on: boolean) => void;
  onStill: (fn: (o: { from: number; jpeg: Uint8Array }) => void) => () => void;
  scratch: () => string | null;
  /** A file address as the address of its own folder (a page shows local files only from there). */
  /** A file address as a local page's address: approving its folder only when the person gave it (`given`). */
  localUrl: (u: string, given?: boolean) => Promise<string>;
  onReveal: (fn: (id: string) => void) => () => void;
  onLook: (fn: (o: { thread: string; req: string; keys?: string[] }) => void) => () => void;
  onDraw: (fn: (o: { thread: string; req: string; ops: unknown }) => void) => () => void;
  drew: (req: string, r: { made: Record<string, string>; changed: number; removed: number; problems: string[]; held?: number }) => void;
  onGuide: (fn: (o: { req: string; name: string }) => void) => () => void;
  guided: (req: string, text: string) => void;
  looked: (req: string, refs: BoardRef[]) => void;
  /** An agent wants to use a page: which ones it may (those it opened, and those it was shown). */
  onPages: (fn: (o: { thread: string; req: string }) => void) => () => void;
  pagesAre: (req: string, list: { id: string; name: string; webContentsId?: number }[]) => void;
  /** An agent's mark goes to a spot on a page (in the page's own pixels), pressing there when it clicks. */
  /** A page an agent is using just now: kept laid out, wherever it is. */
  onUsing: (fn: (o: { at: string; on: boolean }) => void) => () => void;
  onPoint: (fn: (o: { thread: string; at: string; x: number; y: number; press: boolean; label?: string }) => void) => () => void;
  /** T3 Code's first message in a new session: a thread card to make, with this id, working in this folder. */
  onAcpNew: (fn: (o: { id: string; cwd: string; req: string }) => void) => () => void;
  acpMade: (req: string) => void;
  onFocus: (fn: (on: boolean) => void) => () => void;
  /** The shell's environment is in (so which agents are on this Mac is known): told once, and asked. */
  onEnv: (fn: () => void) => () => void;
  envKnown: () => boolean;
}
export const weld = (window as unknown as { weld: Weld }).weld;

/** The app's few remembered choices: the folder, agent and mode a new thing starts with. */
export const settings: Settings = { ...(weld?.info.settings ?? {}) };
export function remember(change: Settings) {
  Object.assign(settings, change);
  if (change.cwd) settings.recent = [change.cwd, ...(settings.recent ?? []).filter((d) => d !== change.cwd)].slice(0, 8);
  void weld.saveSettings(settings);
}
export const home = () => weld.info.home;
/** Where work starts when no folder was chosen for it: a new, empty folder of its own (never home, never whichever folder was used last). */
/** Which agents are installed, asked of the app now and then (one installed after the window opened is found). */
let agentsAt = 0, agentsWere: AgentInfo[] | null = null;
/** Whether the person has switched an agent on. Someone who used Weld before agents had to be (a choice of agent remembered)
 *  keeps every one found, as before; a copy run by the checks has them all. */
export function enabled(id: Agent): boolean {
  if (settings.enabled) return settings.enabled.includes(id);
  return !!settings.agent || !!weld.info.test;
}
/** Switch an agent on (one press, in Settings or on the first board), and ask new things of it. */
export function enable(id: Agent) {
  const was = settings.enabled ?? agentsFound().filter((a) => enabled(a.id)).map((a) => a.id);
  // (the first one switched on is the one new things are asked of; enabling another later doesn't change that)
  const first = !(settings.agent && was.includes(settings.agent));
  remember({ enabled: [...new Set([...was, id])], ...(first ? { agent: id } : {}) });
}
export function disable(id: Agent) {
  const was = settings.enabled ?? agentsFound().filter((a) => enabled(a.id)).map((a) => a.id);
  remember({ enabled: was.filter((a) => a !== id) });
}
/** Every agent a thread can run on, as found on this Mac (installed: present, switched on or not). */
export function agentsFound(fresh = false): AgentInfo[] {
  return rawAgents(fresh);
}
/** Every agent a thread can run on: installed means present on this Mac and switched on by the person. */
export function agentList(fresh = false): AgentInfo[] {
  return rawAgents(fresh).map((a) => ({ ...a, installed: a.installed && (a.kind === "command" || enabled(a.id)) }));
}
function rawAgents(fresh = false): AgentInfo[] {
  if (fresh || !agentsWere || Date.now() - agentsAt > 4000) {
    agentsAt = Date.now();
    try {
      agentsWere = weld.agentList();
    } catch {
      agentsWere = [
        { id: "claude", name: "Claude", kind: "native", installed: !!weld.info.agents.claude, modes: ["full", "edits"] },
        { id: "codex", name: "Codex", kind: "native", installed: !!weld.info.agents.codex, modes: ["full", "edits"] },
      ];
    }
  }
  return agentsWere!;
}
/** Whether which agents are on this Mac is known yet (it isn't for a moment on a first launch, while the shell is read). */
let known = false;
export function agentsKnown(): boolean {
  if (!known) known = !!weld.info.envKnown || weld.envKnown();
  return known;
}
export function installed(): Record<Agent, boolean> {
  return Object.fromEntries(agentList().map((a) => [a.id, a.installed]));
}
export function agentOf(id: Agent | undefined): AgentInfo | undefined {
  return agentList().find((a) => a.id === (id || "claude"));
}
export function agentName(id: Agent | undefined): string {
  return agentOf(id)?.name ?? (id?.startsWith("cmd:") ? `${id.slice(4)} (not available)` : (id ?? "Claude"));
}
/** The agent something new is asked of: the one last chosen, if it is here and works in the mode last chosen. */
export function chosenAgent(): Agent {
  const list = agentList(), mode = settings.mode ?? "full";
  const usable = (a: string) => list.some((x) => x.id === a && x.installed && x.modes.includes(mode));
  return settings.agent && usable(settings.agent) ? settings.agent : installed().claude ? "claude" : installed().codex ? "codex" : (list.find((x) => x.installed)?.id ?? "claude");
}
/** The models an agent can be asked to use ("" is its own default). Claude Code takes its aliases; Codex lists its own. */
export function modelsOf(agent: Agent): { id: string; name: string; sub?: string }[] {
  if (agent === "claude") return [{ id: "", name: "Default" }, ...["Fable", "Opus", "Sonnet", "Haiku"].map((n) => ({ id: n.toLowerCase(), name: n }))];
  if (agent === "codex") return [{ id: "", name: "Default" }, ...(weld.info.models?.codex ?? [])];
  return [];
}
/** The model something new is asked to use with this agent ("" for its default), if that model is still offered. */
export function chosenModel(agent: Agent): string {
  const m = settings.models?.[agent] ?? "";
  return modelsOf(agent).some((x) => x.id === m) ? m : "";
}
/** The folder the board on screen belongs to, if it belongs to one. */
export const boardDir = () => weld.info.board?.dir ?? null;
/** Where something new works: the board's folder, or (a board with none) a new folder of its own. */
export const defaultCwd = () => boardDir() ?? weld.scratch() ?? home();
/** Give the board on screen its folder: what is started on it from now on works there. */
export async function setBoardDir(dir: string) {
  const b = weld.info.board;
  if (!b || !(await weld.boards.setDir(b.id, dir))) return false;
  b.dir = dir;
  remember({ cwd: dir });
  return true;
}
export const isScratch = (p: string | undefined) => !!p && /\/scratch\/\d{4}-\d\d-\d\d-\d{4}(-\d+)?$/.test(p);
/** A folder as a person would say it: its own name, or ~ for home. */
export function folderName(p: string | undefined): string {
  if (!p) return "~";
  if (p === home()) return "~";
  if (isScratch(p)) return "scratch";
  return p.split("/").filter(Boolean).pop() || "/";
}
export const tilde = (p: string) => (p.startsWith(home()) ? `~${p.slice(home().length)}` : p);
