// What an agent writes: a diagram as data, the story notation (src/canvas/story.ts) with each helper call written as a JSON
// array. Nothing an agent sends is run as code: a call names one of the board's own helpers (src/canvas/mk.ts) and gives its
// arguments, exactly as one of the board's own drawings calls it.
//
//   { "slug": "retry", "name": "A retry waits longer each time", "about": "…",
//     "things": [["panel", "c", 0, 0, "CLIENT", "trying", 220, 104], { "call": ["gauge", "g", 0, 140, "wait", 0], "value": 0.2 }],
//     "links":  [["wire", "w", "c.r", "s.l", { "text": "GET /" }]],
//     "beats":  [{ "on": ["c"], "run": ["w"] }, { "set": { "g": 0.8 }, "hold": 1800 }] }
//
// A thing or link is a call (["helper", …args]), a call with fields laid over what it makes ({ "call": [...], "hidden": true }),
// or the plain object itself. An argument that is itself a call is written { "call": [...] }.
import * as mk from "./mk";
import { story } from "./story";
import type { Beat, Link, Thing } from "./story";
import type { StampDef } from "./stamps";

export type Spec = { slug: string; name: string; about?: string; things: unknown[]; links?: unknown[]; beats?: Beat[] };

const HELPERS = mk as unknown as Record<string, (...a: unknown[]) => unknown>;
/** The helpers an agent may call, by name. */
export const helperNames = () => Object.keys(HELPERS).filter((k) => typeof HELPERS[k] === "function").sort();

class NotationError extends Error {}
const fail = (m: string): never => { throw new NotationError(m); };

const isCall = (v: unknown): v is { call: unknown[] } => !!v && typeof v === "object" && !Array.isArray(v) && Array.isArray((v as { call?: unknown }).call);

let elements = 0;
// (how much the helpers have made for this diagram so far, as JSON: a few calls cannot add up to millions of things)
let made = 0;
function call(c: unknown[], where: string): unknown {
  const out = call0(c, where);
  made += JSON.stringify(out ?? null).length;
  if (made > LIMITS.made) fail(`${where}: the diagram makes too much: keep it smaller`);
  return out;
}
function call0(c: unknown[], where: string): unknown {
  const [name, ...args] = c;
  if (typeof name !== "string") return fail(`${where}: a call starts with a helper's name, e.g. ["panel", "id", 0, 0, "TEXT"]`);
  const f = Object.hasOwn(HELPERS, name) ? HELPERS[name] : undefined;
  if (typeof f !== "function") return fail(`${where}: no helper called "${name}" (see the guide for the list)`);
  const given = args.map((a) => {
    const v = arg(a, where);
    // (what one helper made is checked like anything sent, before another is handed it)
    if (isCall(a)) bounded(v, `${where} (made by ${String(a.call[0])})`);
    return v;
  });
  return f(...given);
}
function arg(a: unknown, where: string): unknown {
  if (isCall(a)) return call(a.call, where);
  return a;
}
/** One entry of "things" or "links" as what it makes: a thing, several, or things and links together. */
function entry(e: unknown, where: string): unknown {
  if (Array.isArray(e)) return call(e, where);
  if (isCall(e)) {
    const { call: c, ...over } = e;
    const made = call(c, where);
    if (Array.isArray(made)) return made.map((m) => ({ ...(m as object), ...over }));
    if (made && typeof made === "object" && "things" in made) return made;
    return { ...(made as object), ...over };
  }
  if (e && typeof e === "object") return e;
  return fail(`${where}: expected a call like ["card", "id", 0, 0, "Text"] or an object`);
}

/** How much an agent may send: enough for any real diagram, too little for a helper to be asked to make millions of things. */
export const LIMITS = { json: 200_000, number: 50_000, list: 500, elements: 4_000, text: 1_000, depth: 8, shapes: 5_000, made: 3_000_000 };
/** Every value in what was sent is plain, finite and small (it reaches the helpers as their arguments). */
function bounded(v: unknown, where: string, depth = 0): void {
  if (depth > LIMITS.depth) fail(`${where}: nested too deeply`);
  if (typeof v === "number") { if (!Number.isFinite(v) || Math.abs(v) > LIMITS.number) fail(`${where}: numbers must be finite and within ±${LIMITS.number}`); return; }
  if (typeof v === "string") {
    if (v.length > LIMITS.text) fail(`${where}: words longer than ${LIMITS.text} characters`);
    // (a number written as words is still a number to a helper)
    const n = v.trim() ? Number(v) : 0;
    if (Number.isFinite(n) && Math.abs(n) > LIMITS.number) fail(`${where}: numbers must be within ±${LIMITS.number}`);
    return;
  }
  if (v === null || typeof v === "boolean" || v === undefined) return;
  if (Array.isArray(v)) {
    if (v.length > LIMITS.list) fail(`${where}: a list longer than ${LIMITS.list}`);
    // (lists are counted across the whole diagram too: a helper asked to combine two long ones makes their product)
    if ((elements += v.length) > LIMITS.elements) fail(`${where}: the diagram holds more than ${LIMITS.elements} listed values`);
    v.forEach((x, i) => bounded(x, `${where}[${i}]`, depth + 1));
    return;
  }
  if (typeof v === "object") {
    const keys = Object.keys(v as object);
    if (keys.length > LIMITS.list) fail(`${where}: too many fields`);
    for (const k of keys) { if (k === "__proto__" || k === "constructor" || k === "prototype") fail(`${where}: "${k}" is not a field`); bounded((v as Record<string, unknown>)[k], `${where}.${k}`, depth + 1); }
    return;
  }
  fail(`${where}: only plain values (numbers, words, lists, objects)`);
}

/** The diagram an agent described, as a stamp the board can put down. */
export function compile(spec: Spec): StampDef {
  if (!spec || typeof spec !== "object") fail("the diagram must be an object with slug, name, things, links and beats");
  if (JSON.stringify(spec).length > LIMITS.json) fail(`the diagram is too big: keep it under ${LIMITS.json / 1000} KB of JSON`);
  elements = 0;
  bounded(spec, "diagram");
  made = 0;
  if (typeof spec.slug !== "string" || !/^[a-z0-9][a-z0-9-]{0,60}$/.test(spec.slug)) fail('"slug" must be short, lowercase letters, digits and dashes (it names the diagram on the board)');
  if (typeof spec.name !== "string" || !spec.name.trim()) fail('"name" is a short sentence saying what the diagram shows');
  if (!Array.isArray(spec.things) || !spec.things.length) fail('"things" must list what is drawn');
  if (spec.links !== undefined && !Array.isArray(spec.links)) fail('"links" must be a list');
  if (spec.beats !== undefined && !Array.isArray(spec.beats)) fail('"beats" must be a list of moments');
  if (spec.things.length + (spec.links?.length ?? 0) > 600) fail("too many parts: keep a diagram under 600 things and links");
  const things: Thing[] = [], links: Link[] = [];
  const take = (made: unknown, into: "things" | "links") => {
    if (Array.isArray(made)) for (const m of made) take(m, into);
    else if (made && typeof made === "object" && "things" in made && "links" in made) {
      const tl = made as { things: Thing[]; links: Link[] };
      things.push(...tl.things);
      links.push(...tl.links);
    } else if (made && typeof made === "object") (into === "things" ? things : links).push(made as Thing & Link);
  };
  spec.things.forEach((e, i) => take(entry(e, `things[${i}]`), "things"));
  (spec.links ?? []).forEach((e, i) => take(entry(e, `links[${i}]`), "links"));
  const beats = spec.beats?.length ? spec.beats : [{}];
  if (beats.length > 16) fail("keep it to 16 moments or fewer");
  const def = story({ slug: spec.slug, name: spec.name, about: spec.about ?? spec.name, things, links, beats }, { remember: false });
  if (def.build().length > LIMITS.shapes) fail(`the diagram makes more than ${LIMITS.shapes} shapes`);
  return def;
}

export { NotationError };
