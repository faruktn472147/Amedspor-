import "server-only";
import { headers } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type ActionResult<T = undefined> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; error: string };

export const fail = (error: string): ActionResult<never> => ({ ok: false, error });

/** Veritabanı tabanlı ücretsiz hız sınırı. Yapılandırma yoksa engellemez. */
export async function rateLimit(key: string, max: number, windowSeconds: number): Promise<boolean> {
  const admin = getSupabaseAdmin();
  if (!admin) return true;
  const { data, error } = await admin.rpc("check_rate_limit", { p_key: key, p_max: max, p_window_seconds: windowSeconds });
  if (error) return true; // hız sınırı servisi hata verirse kullanıcıyı kilitlemeyiz
  return data === true;
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim().slice(0, 64);
}

export async function audit(actorId: string, action: string, targetType: string | null, targetId: string | null, details: Record<string, unknown> = {}) {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  await admin.from("audit_logs").insert({ actor_id: actorId, action, target_type: targetType, target_id: targetId, details });
}

export function str(fd: FormData, key: string, max = 5000): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
