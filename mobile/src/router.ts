/**
 * Basit hash tabanlı yönlendirici. Android geri tuşu WebView geçmişini kullanır;
 * her ekran değişimi bir geçmiş kaydı oluşturduğu için geri tuşu doğal çalışır.
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
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return { handler: r.handler, params, query: new URLSearchParams(q), title: r.title, path };
    }
  }
  return null;
}

export function navigate(hash: string, replace = false): void {
  const target = hash.startsWith("#") ? hash : `#${hash}`;
  if (replace) {
    history.replaceState(null, "", target);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else if (location.hash === target) {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    location.hash = target;
  }
}

/** Uygulama içi yönlendirme hedefinin güvenli olduğunu doğrular (yalnızca #/ ile başlayanlar). */
export function safeNextHash(next: string | null | undefined): string {
  return next && /^#\/[^\s]*$/.test(next) && !next.includes("//") ? next : "#/";
}
