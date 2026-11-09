/**
 * Uygulama içi yönlendirici.
 *
 * Tek HTML dosyası çok farklı ortamlarda açılabilir: Android uygulaması (Capacitor,
 * https://localhost), tarayıcı, dosya olarak (file://) veya iPhone/Claude dosya
 * önizleyicisi gibi KORUMALI çerçeveler (sandbox + srcdoc). Korumalı çerçevelerde
 * adres çubuğu (history API) değiştirilemez ve "#/..." bağlantıları yanlış adrese
 * gidebilir. Bu yüzden:
 *  - Geçerli sayfa uygulamanın kendi durumunda tutulur (adres çubuğuna bağımlı değil).
 *  - Uygulama içi bağlantı tıklamaları yakalanır; tarayıcı gezintisi hiç yapılmaz.
 *  - Adres çubuğu yalnızca mümkünse güncellenir (Android geri tuşu için geçmiş kaydı).
 *  - Geçmiş API'si kullanılamıyorsa uygulama kendi geri yığınını kullanır.
 */
export type RouteHandler = (params: Record<string, string>, query: URLSearchParams) => Promise<Node> | Node;

interface Route {
  pattern: RegExp;
  keys: string[];
  handler: RouteHandler;
  title: string;
}

const routes: Route[] = [];

export function route(path: string, title: string, handler: RouteHandler): void {
  const keys: string[] = [];
  const pattern = new RegExp(
    "^" +
      path.replace(/\//g, "\\/").replace(/:([a-zA-Z]+)/g, (_, k: string) => {
        keys.push(k);
        return "([^/]+)";
      }) +
      "$",
  );
  routes.push({ pattern, keys, handler, title });
}

export interface Match {
  handler: RouteHandler;
  params: Record<string, string>;
  query: URLSearchParams;
  title: string;
  path: string;
}

/** "#/haber/123?x=1" → eşleşen rota (bulunamazsa null) */
export function resolve(hash: string): Match | null {
  const raw = hash.replace(/^#/, "") || "/";
  const [path, q = ""] = raw.split("?");
  for (const r of routes) {
    const m = r.pattern.exec(path);
    if (m) {
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => (params[k] = safeDecode(m[i + 1])));
      return { handler: r.handler, params, query: new URLSearchParams(q), title: r.title, path };
    }
  }
  return null;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Uygulama içi yönlendirme hedefinin güvenli olduğunu doğrular (yalnızca #/ ile başlayanlar). */
export function safeNextHash(next: string | null | undefined): string {
  return next && /^#\/[^\s]*$/.test(next) && !next.includes("//") ? next : "#/";
}

// ---------------------------------------------------------------- Durum
const normalize = (hash: string) => (hash.startsWith("#/") ? hash : hash.startsWith("/") ? `#${hash}` : "#/");

function readLocationHash(): string | null {
  try {
    const h = typeof location !== "undefined" ? location.hash : "";
    return h && h.startsWith("#/") ? h : null;
  } catch {
    return null;
  }
}

let current = "#/";
const backStack: string[] = [];
let historyWorks = true;
const listeners = new Set<() => void>();

export function currentHash(): string {
  return current;
}

function notify() {
  for (const fn of listeners) fn();
}

/** Adres çubuğunu güncellemeyi dener; korumalı ortamlarda sessizce vazgeçer. */
function syncHistory(hash: string, replace: boolean) {
  if (!historyWorks) return;
  try {
    if (replace) history.replaceState({ amed: hash }, "", hash);
    else history.pushState({ amed: hash }, "", hash);
  } catch {
    historyWorks = false; // ör. sandbox + srcdoc: uygulama kendi geçmişini kullanır
  }
}

export function navigate(hash: string, replace = false): void {
  const target = normalize(hash);
  if (target !== current && !replace) backStack.push(current);
  if (backStack.length > 50) backStack.shift();
  current = target;
  syncHistory(target, replace);
  notify();
}

/** Geçerli sayfayı yeniden yükler (veriyi tazeler). */
export function refresh(): void {
  notify();
}

export function canGoBack(): boolean {
  return backStack.length > 0;
}

export function goBack(): void {
  if (historyWorks) {
    try {
      history.back(); // popstate ile geri gelinir (Android geri tuşu ile aynı yol)
      return;
    } catch {
      historyWorks = false;
    }
  }
  const prev = backStack.pop();
  current = prev ?? "#/";
  notify();
}

/** Yönlendiriciyi başlatır: tıklama yakalama, geri tuşu ve adres değişiklikleri. */
export function startRouter(onChange: () => void): void {
  listeners.add(onChange);
  current = readLocationHash() ?? "#/";

  window.addEventListener("popstate", () => {
    const h = readLocationHash() ?? "#/";
    if (backStack[backStack.length - 1] === h) backStack.pop();
    current = h;
    notify();
  });
  window.addEventListener("hashchange", () => {
    const h = readLocationHash();
    if (h && h !== current) {
      current = h;
      notify();
    }
  });
  // Uygulama içi bağlantılar ("#/...") tarayıcıya bırakılmaz
  document.addEventListener(
    "click",
    (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      const href = a?.getAttribute("href");
      if (!a || !href || !href.startsWith("#/") || a.getAttribute("target")) return;
      e.preventDefault();
      navigate(href);
    },
    true,
  );
}
