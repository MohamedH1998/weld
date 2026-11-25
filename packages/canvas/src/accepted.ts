// Every accepted diagram, in one list: what the library's Diagrams tab offers, and what the catalogue describes.
import { BUILT } from "./built";
import { NOTCHED } from "./notched";
import { ROUNDS } from "./rounds";
import { PICKED } from "./picked";
export const ACCEPTED = [...BUILT, ...NOTCHED, ...ROUNDS, ...PICKED];
