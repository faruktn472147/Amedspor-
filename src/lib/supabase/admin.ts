import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "./env";

let cached: SupabaseClient | null = null;

/**
 * service_role istemcisi — RLS'yi ATLAR. Yalnızca sunucuda, kullanıcı kimliği ve yetkisi
 * doğrulandıktan sonra kullanılmalıdır. Anahtar asla istemciye gönderilmez.
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  const cfg = getSupabasePublicConfig();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!cfg || !key) return null;
  cached ??= createClient(cfg.url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
