export type Theme = "dark" | "light";

export function currentTheme(): Theme {
  try {
    return localStorage.getItem("amed.theme") === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function applyTheme(t: Theme = currentTheme()): void {
  document.documentElement.classList.toggle("dark", t === "dark");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "dark" ? "#0a0d0b" : "#f6f7f5");
  try {
    localStorage.setItem("amed.theme", t);
  } catch {
    /* depolama kapalı */
  }
}
