import { createRoot } from "react-dom/client";
import "./styles.css";
import "./live/live.css";
import { CanvasView } from "@/canvas/CanvasView";
import { CAM_KEY, DOC_KEY } from "@weld/canvas/store";
import { weld } from "@/live/bridge";

// The board is kept in a file of the app's own. The page's storage is
// only where the board's code looks for it, so the file is copied there
// before anything reads it.
try {
  const disk = weld?.board.load();
  (globalThis as { __weldBoard?: unknown }).__weldBoard = disk;
  if (disk?.doc) localStorage.setItem(DOC_KEY, disk.doc);
  else if (disk === null) localStorage.removeItem(DOC_KEY);
  if (disk?.cam) localStorage.setItem(CAM_KEY, disk.cam);
  else if (disk === null) localStorage.removeItem(CAM_KEY);
} catch {
  /* storage blocked: the board starts from what the page has */
}

createRoot(document.getElementById("root")!).render(<CanvasView />);
