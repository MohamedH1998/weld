/** Where the app is served (VITE_SITE when it is built, as in a local .env.production): link previews need their
 *  pictures' full address. */
export const SITE = (import.meta.env.VITE_SITE as string | undefined)?.replace(/\/$/, "") ?? "http://localhost:3100";
