// The board's look and behaviour, as one set of choices. Each could be otherwise (the code keeps the alternatives a
// choice can take), but the app ships with these.
/** Where the tools rest: the middle of an edge, or a corner. */
export type Dock = "bottom" | "top" | "left" | "right" | "tl" | "tr" | "bl" | "br";
export const DOCK_NAMES: readonly Dock[] = ["bottom", "top", "left", "right", "tl", "tr", "bl", "br"];

export interface Variant {
  /** How the active tool is marked. */
  marker: "soft" | "ink" | "brand" | "dot";
  /** Where the tools sit. */
  dock: Dock;
  /** Where the style controls appear. */
  bar: "top" | "follow" | "dock";
  /** How a connected box is added by pointer. */
  connect: "stubs" | "hover" | "keys";
  /** Whether a shape tool stays active after use. */
  arm: "stay" | "once";
  /** How shapes line up with their neighbours while being dragged. */
  snap: "gentle" | "always" | "held" | "off";
  /** Where a dropped arrow end attaches to a box. */
  attach: "centre" | "exact";
  /** Where an arrow's label sits. */
  label: "beside" | "on";
  /** How heavy lines and labels are. */
  ink: "fine" | "regular" | "strong";
  /** How the shapes beyond the basics are reached. */
  library: "popover" | "rail";
  /** Where the patterns are reached from. */
  patterns: "tab" | "button";
  /** Moving through a drawing's time by hand: not at all (play, or pick a moment), along a thin strip under the moments, by sliding across the moments by the clock, or by sliding across them by place (every change as wide as a moment). */
  scrub: "none" | "strip" | "tabs" | "glide";
  /** The voice a shape's own words are set in (headers, names, captions). */
  voice: "caps" | "mono" | "typed";
  /** Whether things stand on paper of their own or are see-through outlines. */
  paper: "opaque" | "clear";
  /** Whether cards carry the notches wires dock into. */
  notch: "on" | "off";
}

export const DEFAULTS: Variant = {
  marker: "brand", dock: "bottom", bar: "top", connect: "hover", arm: "once", snap: "gentle", attach: "centre", label: "on", ink: "regular", library: "popover", patterns: "tab", scrub: "none", voice: "mono", paper: "opaque", notch: "on",
};

/** How the board looks and behaves as shipped (the toolbar's place is the person's, and is kept by the board). */
export const shipped = (): Variant => ({ ...DEFAULTS });
