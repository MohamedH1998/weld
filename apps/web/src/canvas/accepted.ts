// Every accepted diagram (the "all" scene), in one list: what the catalogue describes. The engine's own list, with the
// gold-standard diagrams and those first made on weld's board in front: those two live here, not in the engine, so they
// are handed to the editor too, to be put down by name like any other.
import { ACCEPTED as ENGINE } from "@weld/canvas/accepted";
import { addStamps } from "@weld/canvas/editor";
import { GOLD } from "./gold";
import { BOARD } from "./board";
export const ACCEPTED = [...GOLD, ...BOARD, ...ENGINE];
// (the engine's own come after, as they did in one list: a slug both have is the engine's)
addStamps([...GOLD, ...BOARD]);
addStamps(ENGINE);
