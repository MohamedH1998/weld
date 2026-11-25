import { createFileRoute } from "@tanstack/react-router";
import { CanvasView } from "@/canvas/CanvasView";
import { SITE } from "../site";

const TITLE = "You're invited to a board · Weld Canvas";
const ABOUT = "Draw and play diagrams together on Weld Canvas. Anyone with the link can edit.";

// a shared board, at its secret link; pasted anywhere, it reads as an invitation (never the board's contents)
export const Route = createFileRoute("/b/$key")({
  component: Shared,
  head: () => ({
    meta: [
      { name: "description", content: ABOUT },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: ABOUT },
      { property: "og:image", content: `${SITE}/og-invite.png` },
      { property: "og:image:alt", content: "You're invited to a board on Weld Canvas" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: ABOUT },
      { name: "twitter:image", content: `${SITE}/og-invite.png` },
    ],
  }),
});

function Shared() {
  const { key } = Route.useParams();
  return <CanvasView key={key} board={key} />;
}
