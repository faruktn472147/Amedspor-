/**
 * Uygulama yapılandırması. Değerler tek HTML dosyasının başındaki
 * `<script type="application/json" id="amed-config">` bloğundan okunur (build.mjs ortam değişkenleriyle doldurur
 * veya dosya elle düzenlenebilir). Supabase anon anahtarı herkese açık olacak
 * şekilde tasarlanmıştır; veriler veritabanındaki RLS politikalarıyla korunur.
 */
export interface AppConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  siteUrl: string;
  appVersion: string;
}

declare global {
  interface Window {
    AMED_CONFIG?: Partial<AppConfig>;
  }
}

export function readConfig(raw: Partial<AppConfig> | undefined): AppConfig {
  const clean = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\/+$/, "") : "");
  return {
    supabaseUrl: clean(raw?.supabaseUrl),
    supabaseAnonKey: typeof raw?.supabaseAnonKey === "string" ? raw.supabaseAnonKey.trim() : "",
    siteUrl: clean(raw?.siteUrl),
    appVersion: typeof raw?.appVersion === "string" ? raw.appVersion : "1.0.0",
  };
}

export const isHttpsUrl = (u: string) => /^https:\/\/[^\s/$.?#][^\s]*$/i.test(u);

/** Veritabanı bağlantısı yapılandırılmış mı? (yer tutucular yapılandırılmamış sayılır) */
export function isBackendConfigured(c: AppConfig): boolean {
  return isHttpsUrl(c.supabaseUrl) && c.supabaseAnonKey.length > 20 && !c.supabaseAnonKey.startsWith("__");
}

/** Web sitesi (paylaşım/moderasyon API'si, yasal sayfalar) yapılandırılmış mı? */
export function isSiteConfigured(c: AppConfig): boolean {
  return isHttpsUrl(c.siteUrl);
}

/** Yapılandırmayı HTML içindeki çalıştırılamaz JSON bloğundan (veya test için window'dan) okur. */
function readFromDocument(): Partial<AppConfig> | undefined {
  if (typeof document === "undefined") return undefined;
  const el = document.getElementById("amed-config");
  if (el?.textContent) {
    try {
      return JSON.parse(el.textContent) as Partial<AppConfig>;
    } catch {
      console.error("AMEDSPOR: yapılandırma JSON'u okunamadı");
    }
  }
  return typeof window !== "undefined" ? window.AMED_CONFIG : undefined;
}

let current: AppConfig | null = null;
export function config(): AppConfig {
  current ??= readConfig(readFromDocument());
  return current;
}
