// The face and the rasteriser, loaded once in whichever isolate needs them (the Worker for pictures, a board for measuring
// words as it places a diagram: each has its own globals).
import FONT from "@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2?inline";
import WASM from "@resvg/resvg-wasm/index_bg.wasm?module";
import { prepare } from "./picture";

export const outlines = () => prepare(async () => Uint8Array.from(atob(FONT.slice(FONT.indexOf(",") + 1)), (c) => c.charCodeAt(0)).buffer, async () => WASM);
