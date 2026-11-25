// Light, dark, or as the system is: chosen on the board (its bar and its menu), remembered in this browser, and applied
// before the page is first painted (THEME_SCRIPT, in the page's head), so a dark board never opens on a flash of white.
export type ThemePref = "system" | "light" | "dark";
export const THEME_KEY = "canvas:theme:v1";
export const THEME_EVENT = "canvas:theme";
export const THEMES: { id: ThemePref; name: string }[] = [
  { id: "system", name: "Match system" },
  { id: "light", name: "Light" },
  { id: "dark", name: "Dark" },
];

export function themePref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function setThemePref(to: ThemePref) {
  try {
    if (to === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, to);
  } catch {
    /* storage blocked: it still applies for now */
  }
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: to }));
}

/** Whether the board is dark: as the address asks (a study board), else as chosen, else as the system is. */
export function wantsDark(asked: string | null, pref: ThemePref, system: boolean): boolean {
  if (asked === "dark" || asked === "black") return true;
  if (asked === "light") return false;
  return pref === "dark" ? true : pref === "light" ? false : system;
}

/** The same decision, made in the page's head before anything is painted. */
export const THEME_SCRIPT = `(function(){try{var a=new URLSearchParams(location.search).get("theme"),p=null;try{p=localStorage.getItem(${JSON.stringify(THEME_KEY)})}catch(e){}var d=a==="dark"||a==="black"?true:a==="light"?false:p==="dark"?true:p==="light"?false:matchMedia("(prefers-color-scheme: dark)").matches,r=document.documentElement;r.dataset.mode=d?"dark":"light";r.style.colorScheme=d?"dark":"light"}catch(e){}})()`;
