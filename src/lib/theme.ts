/**
 * Runs before hydration so a reload never flashes the wrong theme.
 *
 * Lives outside `prefs.ts` because that module is client-only, and the root
 * layout — a server component — needs this as a plain string. The key and the
 * default must match `usePrefs` there.
 */
export const THEME_BOOT_SCRIPT = `try{var p=JSON.parse(localStorage.getItem("venti-prefs")||"{}");var t=((p.version||0)>=3&&p.state&&p.state.theme)||"dark";document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t}catch(e){document.documentElement.dataset.theme="dark"}`;
