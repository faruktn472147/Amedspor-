"use client";
import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

function subscribe(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => obs.disconnect();
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(
    subscribe,
    () => document.documentElement.classList.contains("dark"),
    () => true,
  );
  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      /* gizli sekmede depolama kapalı olabilir */
    }
  };
  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full text-fg hover:bg-muted"
      aria-label={dark ? "Aydınlık temaya geç" : "Karanlık temaya geç"}
    >
      {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}

/** İlk boyamadan önce temayı uygular (yanıp sönmeyi önler). Varsayılan: karanlık. */
export const THEME_SCRIPT = `(function(){var d=true;try{d=localStorage.getItem('theme')!=='light'}catch(e){}document.documentElement.classList.toggle('dark',d)})();`;
