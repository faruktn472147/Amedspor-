import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "./env";

/** Kullanıcının oturumuyla çalışan istemci (RLS uygulanır). Yapılandırma yoksa null. */
export async function createSupabaseServerClient(): Promise<SupabaseClient | null> {
  // Çerezler her durumda okunur: veri kullanan sayfalar her istekte dinamik çalışır,
  // yapılandırma eksik olsa bile derleme sırasında statik/önbellekli üretilmez.
  const cookieStore = await cookies();
  const cfg = getSupabasePublicConfig();
  if (!cfg) return null;
  return createServerClient(cfg.url, cfg.anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) cookieStore.set(name, value, options);
        } catch {
          // Server Component içinde çerez yazılamaz; oturum yenileme proxy.ts'de yapılır.
        }
      },
    },
  });
}
