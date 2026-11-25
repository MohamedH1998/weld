// What a new thread was opened to do (asked on the empty board): its first message, sent as soon as the thread is ready.
import type { Id } from "@weld/canvas/types";

export const openings = new Map<Id, string>();
/** Threads whose opening was sent: if one leaves the board before long (undone, deleted), its work is stopped at once. */
export const opened = new Map<Id, number>();
