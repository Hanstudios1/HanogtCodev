/** Where the browser remembers the theme choice (src/lib/theme.tsx). */
export const THEME_STORAGE_KEY = "theme";

/**
 * Runs before React hydrates (inlined in <head>) so the first paint already
 * uses the stored theme. Without it the page flashed dark → light and pages
 * without the header never applied the user's choice at all. It lives in a
 * plain module because the root layout (a server component) builds the
 * inline script from it; a value imported from a client module is only a
 * reference there.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem('${THEME_STORAGE_KEY}');var m=window.matchMedia('(prefers-color-scheme: dark)').matches;var d=s==='dark'||((!s||s==='system')&&m);var r=document.documentElement;r.classList.toggle('dark',d);r.style.colorScheme=d?'dark':'light';}catch(e){document.documentElement.classList.add('dark');}})();`;
