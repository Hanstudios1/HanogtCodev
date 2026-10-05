/** Where the browser remembers the account's accessibility settings (src/lib/appearance.tsx). */
export const APPEARANCE_STORAGE_KEY = "hanogt-appearance:v1";

/** Runs before the page paints (next to the theme script): the remembered settings as attributes on <html>. */
export const APPEARANCE_INIT_SCRIPT = `(function(){try{var a=JSON.parse(localStorage.getItem('${APPEARANCE_STORAGE_KEY}')||'{}');var r=document.documentElement;if(a.reduceAnimations===true)r.setAttribute('data-motion','reduce');if(a.highContrast===true)r.setAttribute('data-contrast','more');}catch(e){}})();`;
