import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "@/lib/supabase/env";
import type { Profile } from "@/lib/types";

/**
 * Mobil uygulama (Capacitor) isteklerinin kaynakları. Kimlik doğrulama çerezle
 * değil "Authorization: Bearer <erişim belirteci>" başlığıyla yapılır; bu yüzden
 * CORS bir güvenlik sınırı değildir ama yine de yalnızca bilinen kaynaklara izin verilir.
 */
const DEFAULT_ORIGINS = ["https://localhost", "http://localhost", "capacitor://localhost"];

export function allowedOrigins(): string[] {
  const extra = (process.env.MOBILE_ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const site = process.env.NEXT_PUBLIC_SITE_URL ? [new URL(process.env.NEXT_PUBLIC_SITE_URL).origin] : [];
  return [...DEFAULT_ORIGINS, ...site, ...extra];
}

export function corsHeaders(origin: string | null): Record<string, string> {
  const h: Record<string, string> = { vary: "Origin" };
  if (origin && allowedOrigins().includes(origin)) {
    h["access-control-allow-origin"] = origin;
    h["access-control-allow-methods"] = "POST, OPTIONS";
    h["access-control-allow-headers"] = "authorization, content-type";
    h["access-control-max-age"] = "600";
  }
  return h;
}

export interface MobileContext {
  userId: string;
  db: SupabaseClient;
  profile: Profile | null;
}

/** Bearer belirtecini Supabase Auth sunucusunda doğrular ve kullanıcının RLS'li istemcisini döndürür. */
export async function mobileContext(request: Request): Promise<MobileContext | null> {
  const cfg = getSupabasePublicConfig();
  const auth = request.headers.get("authorization") ?? "";
  const token = /^Bearer\s+([A-Za-z0-9._-]{20,4096})$/.exec(auth)?.[1];
  if (!cfg || !token || token === cfg.anonKey) return null;
  const db = createClient(cfg.url, cfg.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: rows } = await db.rpc("get_my_profile");
  const profile = (Array.isArray(rows) ? rows[0] : rows) as Profile | null;
  return { userId: data.user.id, db, profile: profile ?? null };
}
