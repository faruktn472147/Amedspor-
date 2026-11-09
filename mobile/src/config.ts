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

const DEVICE_KEY = "amed.config.v1";

/** Uygulamanın içinden (Kurulum ekranı) kaydedilmiş bağlantı — yalnızca dosyada yapılandırma YOKSA kullanılır. */
function readDeviceConfig(): Partial<AppConfig> | undefined {
  try {
    const raw = localStorage.getItem(DEVICE_KEY);
    return raw ? (JSON.parse(raw) as Partial<AppConfig>) : undefined;
  } catch {
    return undefined;
  }
}

export type ConfigSource = "file" | "device" | "none";
let current: AppConfig | null = null;
let source: ConfigSource = "none";

export function config(): AppConfig {
  if (current) return current;
  const fromFile = readConfig(readFromDocument());
  if (isBackendConfigured(fromFile)) {
    source = "file";
    current = fromFile;
  } else {
    const dev = readConfig(readDeviceConfig());
    if (isBackendConfigured(dev)) {
      source = "device";
      current = { ...dev, appVersion: fromFile.appVersion };
    } else {
      source = "none";
      current = fromFile;
    }
  }
  return current;
}

export function configSource(): ConfigSource {
  config();
  return source;
}

/** Bağlantıyı bu cihaza kaydeder. Dosyaya gömülü yapılandırma varsa ona dokunulmaz. */
export function saveDeviceConfig(c: Pick<AppConfig, "supabaseUrl" | "supabaseAnonKey" | "siteUrl">): boolean {
  try {
    localStorage.setItem(DEVICE_KEY, JSON.stringify(c));
  } catch {
    // Depolama kapalı (ör. korumalı önizleme): yalnızca bu oturum için bellekte tutulur
    current = { ...readConfig(c), appVersion: config().appVersion };
    source = "device";
    return false;
  }
  current = null;
  return true;
}

export function clearDeviceConfig(): void {
  try {
    localStorage.removeItem(DEVICE_KEY);
  } catch {
    /* depolama kapalı */
  }
  current = null;
}
