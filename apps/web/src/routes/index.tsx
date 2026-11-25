import { createFileRoute } from "@tanstack/react-router";
import { CanvasView } from "@/canvas/CanvasView";

export const Route = createFileRoute("/")({ component: CanvasView });
