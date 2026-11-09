/**
 * Kütüphanesiz, küçük Supabase istemcisi (Auth + PostgREST + Storage) ve web
 * sitesinin mobil API'si. Tüm yetki kontrolleri sunucuda / veritabanında (RLS)
 * yapılır; bu istemci yalnızca kullanıcının kendi oturum belirtecini gönderir.
 */
import { config, isBackendConfigured, isSiteConfigured } from "./config";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class NotConfiguredError extends Error {
  constructor(what: "backend" | "site") {
    super(what === "backend" ? "Veritabanı bağlantısı yapılandırılmadı." : "Web sitesi adresi yapılandırılmadı.");
    this.name = "NotConfiguredError";
  }
}

export interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: { id: string; email?: string };
}

const SESSION_KEY = "amed.session.v1";

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    return s?.access_token && s?.refresh_token && s?.user?.id ? s : null;
  } catch {
    return null;
  }
}

function saveSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* depolama kapalıysa oturum yalnızca bellekte kalır */
  }
}

type AuthResponse = { access_token: string; refresh_token: string; expires_in: number; expires_at?: number; user: { id: string; email?: string } };

function toSession(r: AuthResponse): Session {
  return {
    access_token: r.access_token,
    refresh_token: r.refresh_token,
    expires_at: r.expires_at ?? Math.floor(Date.now() / 1000) + (r.expires_in ?? 3600),
    user: { id: r.user.id, email: r.user.email },
  };
}

function friendlyAuthError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login")) return "E-posta veya şifre hatalı.";
  if (m.includes("email not confirmed")) return "E-posta adresin henüz doğrulanmadı.";
  if (m.includes("already registered")) return "Bu e-posta ile kayıtlı bir hesap var.";
  if (m.includes("rate limit") || m.includes("too many")) return "Çok fazla deneme yapıldı. Lütfen biraz bekle.";
  if (m.includes("expired") || m.includes("invalid") || m.includes("otp")) return "Kod hatalı veya süresi dolmuş.";
  if (m.includes("weak") || m.includes("pwned")) return "Bu şifre güvenli değil, daha güçlü bir şifre seç.";
  return "İşlem tamamlanamadı. Lütfen tekrar dene.";
}

/** PostgREST sorgu parametresi oluşturucu */
export function qs(params: Record<string, string | number | undefined | null>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") u.append(k, String(v));
  return u.toString();
}

/** PostgREST "in" filtresi için güvenli liste: in.(a,b) — yalnızca UUID'ler kabul edilir */
export function inList(ids: string[]): string {
  const safe = ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  return `in.(${safe.join(",")})`;
}

type Listener = (s: Session | null) => void;

export class Api {
  session: Session | null = loadSession();
  private refreshing: Promise<Session | null> | null = null;
  private listeners = new Set<Listener>();

  onAuthChange(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private setSession(s: Session | null) {
    this.session = s;
    saveSession(s);
    for (const fn of this.listeners) fn(s);
  }

  get userId(): string | null {
    return this.session?.user.id ?? null;
  }

  private base(): string {
    const c = config();
    if (!isBackendConfigured(c)) throw new NotConfiguredError("backend");
    return c.supabaseUrl;
  }

  private async token(): Promise<string> {
    const s = this.session;
    if (!s) return config().supabaseAnonKey;
    if (s.expires_at - 60 > Date.now() / 1000) return s.access_token;
    const fresh = await this.refresh();
    return fresh?.access_token ?? config().supabaseAnonKey;
  }

  async refresh(): Promise<Session | null> {
    if (!this.session) return null;
    this.refreshing ??= (async () => {
      try {
        const res = await fetch(`${this.base()}/auth/v1/token?grant_type=refresh_token`, {
          method: "POST",
          headers: { apikey: config().supabaseAnonKey, "content-type": "application/json" },
          body: JSON.stringify({ refresh_token: this.session?.refresh_token }),
        });
        if (!res.ok) {
          if (res.status === 400 || res.status === 401) this.setSession(null);
          return this.session;
        }
        const s = toSession((await res.json()) as AuthResponse);
        this.setSession(s);
        return s;
      } catch {
        return this.session; // çevrimdışı: mevcut oturum korunur
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  private async request<T>(path: string, init: RequestInit & { prefer?: string } = {}): Promise<T> {
    const headers: Record<string, string> = {
      apikey: config().supabaseAnonKey,
      authorization: `Bearer ${await this.token()}`,
      ...(init.headers as Record<string, string> | undefined),
    };
    if (init.body && !(init.body instanceof Blob) && !headers["content-type"]) headers["content-type"] = "application/json";
    if (init.prefer) headers.prefer = init.prefer;
    const res = await fetch(`${this.base()}${path}`, { ...init, headers });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) {
      const e = (data ?? {}) as { message?: string; msg?: string; error_description?: string; code?: string; error?: string };
      throw new ApiError(e.message ?? e.msg ?? e.error_description ?? e.error ?? `HTTP ${res.status}`, res.status, e.code);
    }
    return data as T;
  }

  // ------------------------------------------------------------- Auth
  private async auth(path: string, body: unknown): Promise<AuthResponse | Record<string, unknown>> {
    try {
      return await this.request(`/auth/v1/${path}`, { method: "POST", body: JSON.stringify(body), headers: { authorization: `Bearer ${config().supabaseAnonKey}` } });
    } catch (e) {
      if (e instanceof ApiError) throw new ApiError(friendlyAuthError(e.message), e.status, e.code);
      throw e;
    }
  }

  async signIn(email: string, password: string) {
    const r = (await this.auth("token?grant_type=password", { email, password })) as AuthResponse;
    this.setSession(toSession(r));
  }

  async signUp(email: string, password: string, username: string) {
    await this.auth("signup", { email, password, data: { username, accepted_terms: "true" } });
  }

  async verifyOtp(email: string, token: string, type: "email" | "recovery") {
    const r = (await this.auth("verify", { email, token, type })) as AuthResponse;
    if (r.access_token) this.setSession(toSession(r));
  }

  async resendSignup(email: string) {
    await this.auth("resend", { type: "signup", email });
  }

  async recover(email: string) {
    await this.auth("recover", { email });
  }

  async updatePassword(password: string) {
    try {
      await this.request("/auth/v1/user", { method: "PUT", body: JSON.stringify({ password }) });
    } catch (e) {
      if (e instanceof ApiError) throw new ApiError(friendlyAuthError(e.message), e.status);
      throw e;
    }
  }

  async signOut(scope: "local" | "global" | "others" = "local") {
    try {
      if (this.session) await this.request(`/auth/v1/logout?scope=${scope}`, { method: "POST" });
    } catch {
      /* sunucuya ulaşılamasa da yerel oturum kapatılır */
    }
    if (scope !== "others") this.setSession(null);
  }

  // ------------------------------------------------------------- PostgREST
  select<T>(table: string, query: string, opts: { single?: boolean; count?: boolean } = {}): Promise<T> {
    return this.request<T>(`/rest/v1/${table}?${query}`, {
      headers: opts.single ? { accept: "application/vnd.pgrst.object+json" } : {},
    });
  }

  async maybeSingle<T>(table: string, query: string): Promise<T | null> {
    const rows = await this.select<T[]>(table, `${query}&limit=1`);
    return rows[0] ?? null;
  }

  insert<T = unknown>(table: string, row: Record<string, unknown> | Record<string, unknown>[], returning = false): Promise<T> {
    return this.request<T>(`/rest/v1/${table}`, { method: "POST", body: JSON.stringify(row), prefer: returning ? "return=representation" : "return=minimal" });
  }

  update(table: string, filter: string, patch: Record<string, unknown>): Promise<unknown> {
    return this.request(`/rest/v1/${table}?${filter}`, { method: "PATCH", body: JSON.stringify(patch), prefer: "return=minimal" });
  }

  remove(table: string, filter: string): Promise<unknown> {
    return this.request(`/rest/v1/${table}?${filter}`, { method: "DELETE", prefer: "return=minimal" });
  }

  rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
    return this.request<T>(`/rest/v1/rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });
  }

  // ------------------------------------------------------------- Storage
  async upload(bucket: string, path: string, blob: Blob, contentType: string): Promise<void> {
    await this.request(`/storage/v1/object/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`, {
      method: "POST",
      body: blob,
      headers: { "content-type": contentType, "x-upsert": "false", "cache-control": "3600" },
    });
  }

  /** Özel kovadaki görünür medya için imzalı URL (yetki veritabanı politikasıyla kontrol edilir). */
  async signUrls(bucket: string, paths: string[], expiresIn = 3600): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (!paths.length) return map;
    try {
      const rows = await this.request<{ path: string; signedURL: string | null; error: string | null }[]>(`/storage/v1/object/sign/${bucket}`, {
        method: "POST",
        body: JSON.stringify({ expiresIn, paths }),
      });
      for (const r of rows) if (r.signedURL) map.set(r.path, `${this.base()}/storage/v1${r.signedURL}`);
    } catch {
      /* medya imzalanamazsa gönderi metni yine gösterilir */
    }
    return map;
  }

  publicUrl(bucket: string, path: string): string {
    return `${this.base()}/storage/v1/object/public/${bucket}/${path}`;
  }

  // ------------------------------------------------------------- Web sitesi mobil API'si
  /** Moderasyon gerektiren işlemler (gönderi, yorum, profil, hesap silme) sunucuda yapılır. */
  async site<T = { ok: boolean; message?: string; error?: string }>(op: string, body: unknown): Promise<T> {
    const c = config();
    if (!isSiteConfigured(c)) throw new NotConfiguredError("site");
    const res = await fetch(`${c.siteUrl}/api/mobile/${op}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${await this.token()}` },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new ApiError((data as { error?: string }).error ?? `HTTP ${res.status}`, res.status);
    return data;
  }

  /** Sponsor kartı gösterim/tıklama sayımı (gerçek sayım; hata sessizce yok sayılır). */
  trackAd(campaignId: string, placement: string, kind: "impression" | "click") {
    const c = config();
    if (!isSiteConfigured(c)) return;
    fetch(`${c.siteUrl}/api/ads/event`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ campaignId, placement, kind }),
      keepalive: true,
    }).catch(() => {});
  }
}

export const api = new Api();
