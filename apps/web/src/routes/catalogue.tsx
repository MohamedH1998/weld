// The catalogue: every kept diagram on one board, a row to a subject. Browse it as a board, play any drawing, change
// anything (nothing here is saved), and take what you want with ⌘C onto your own board.
import { createFileRoute } from "@tanstack/react-router";
import { CanvasView } from "@/canvas/CanvasView";

export const Route = createFileRoute("/catalogue")({
  component: () => <CanvasView catalogue />,
  head: () => ({ meta: [{ title: "Catalogue · Weld Canvas" }, { name: "description", content: "Diagrams that show how systems work, on one board: play them, change them, copy them onto yours." }, { property: "og:title", content: "Catalogue · Weld Canvas" }, { property: "og:description", content: "Weld's catalogue: diagrams that show how systems work, on one board. Play them, change them, copy them onto yours." }, { name: "twitter:title", content: "Catalogue · Weld Canvas" }, { name: "twitter:description", content: "Weld's catalogue: diagrams that show how systems work, on one board. Play them, change them, copy them onto yours." }] }),
});
