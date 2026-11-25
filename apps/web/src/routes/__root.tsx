import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import appCss from "../styles.css?url";
import { SITE } from "../site";
import { THEME_SCRIPT } from "../canvas/theme";

const ABOUT = "Diagrams that show how systems work, on Weld's canvas: play them, change them, copy them onto your board.";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      // The page never zooms; only the canvas does.
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" },
      { name: "color-scheme", content: "light dark" },
      { title: "Weld Canvas" },
      { name: "description", content: ABOUT },
      // how a link to it looks when shared: Weld's card (the same for every board; a shared board's contents stay private)
      { property: "og:site_name", content: "Weld" },
      { property: "og:type", content: "website" },
      { property: "og:title", content: "Weld Canvas" },
      { property: "og:description", content: ABOUT },
      { property: "og:image", content: `${SITE}/og.png` },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "Weld Canvas: diagrams that show how systems work" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Weld Canvas" },
      { name: "twitter:description", content: ABOUT },
      { name: "twitter:image", content: `${SITE}/og.png` },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      // Weld's mark (the SVG follows the light or dark setting)
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "icon", href: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),
  shellComponent: RootDocument,
  component: Outlet,
  notFoundComponent: () => null,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    // (light or dark is set on <html> by the script below before React arrives, so it differs from the server's on purpose)
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* light or dark, decided before the first paint (see canvas/theme.ts) */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
