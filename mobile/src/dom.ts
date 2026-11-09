/**
 * Güvenli DOM üretici. Kullanıcı içeriği HER ZAMAN metin düğümü olarak eklenir;
 * innerHTML yalnızca kodun içindeki sabit SVG ikonları için kullanılır (icons.ts).
 * Bu sayede gönderi/yorum/kullanıcı adı üzerinden XSS mümkün değildir.
 */
export type Child = Node | string | number | null | undefined | false | Child[];

type Handler = (ev: Event) => void;
export interface Props {
  class?: string;
  style?: string;
  [key: string]: string | number | boolean | Handler | null | undefined;
}

/** Yalnızca güvenli bağlantı şemalarına izin verir (javascript: vb. engellenir). */
export function safeHref(url: string | null | undefined): string {
  if (!url) return "#";
  const u = url.trim();
  if (u.startsWith("#") || u.startsWith("/")) return u.startsWith("//") ? "#" : u;
  return /^(https?:|mailto:)/i.test(u) ? u : "#";
}

const URL_ATTRS = new Set(["href", "src", "poster", "action"]);

export function h(tag: string, props?: Props | null, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k.startsWith("on") && typeof v === "function") {
        el.addEventListener(k.slice(2).toLowerCase(), v as Handler);
      } else if (k === "class") {
        el.className = String(v);
      } else if (k === "value" && "value" in el) {
        (el as HTMLInputElement).value = String(v);
      } else if (k === "checked" && "checked" in el) {
        (el as HTMLInputElement).checked = Boolean(v);
      } else if (URL_ATTRS.has(k)) {
        el.setAttribute(k, k === "href" ? safeHref(String(v)) : /^(https:|blob:|data:image\/)/i.test(String(v)) ? String(v) : "");
      } else {
        el.setAttribute(k, v === true ? "" : String(v));
      }
    }
  }
  append(el, children);
  return el;
}

export function append(parent: Node, children: Child[]): void {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(parent, c);
    else if (c instanceof Node) parent.appendChild(c);
    else parent.appendChild(document.createTextNode(String(c)));
  }
}

export function frag(...children: Child[]): DocumentFragment {
  const f = document.createDocumentFragment();
  append(f, children);
  return f;
}

export function clear(el: Element, ...children: Child[]): void {
  el.replaceChildren();
  append(el, children);
}

export function $(sel: string, root: ParentNode = document): HTMLElement | null {
  return root.querySelector(sel);
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;
/** Kısa bilgilendirme mesajı */
export function toast(message: string, tone: "info" | "error" | "success" = "info"): void {
  let el = document.getElementById("toast");
  if (!el) {
    el = h("div", { id: "toast", role: "status", "aria-live": "polite" });
    document.body.appendChild(el);
  }
  el.className = `toast toast-${tone} show`;
  el.textContent = message;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el?.classList.remove("show"), 3200);
}

/** Basit onay penceresi (tarayıcının confirm'ü Android WebView'da desteklenir). */
export function confirmAction(message: string): boolean {
  return window.confirm(message);
}

/** Modal alt sayfa */
export function sheet(title: string, body: Child, onClose?: () => void): { close: () => void } {
  const close = () => {
    overlay.remove();
    onClose?.();
  };
  const overlay = h(
    "div",
    { class: "sheet-overlay", role: "dialog", "aria-modal": "true", "aria-label": title, onclick: (e: Event) => e.target === overlay && close() },
    h("div", { class: "sheet" }, h("div", { class: "sheet-head" }, h("strong", null, title), h("button", { class: "icon-btn", "aria-label": "Kapat", onclick: close }, "✕")), body),
  );
  document.body.appendChild(overlay);
  return { close };
}
