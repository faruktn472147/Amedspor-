export interface SupabasePublicConfig {
  url: string;
  anonKey: string;
}

/** Supabase yapılandırılmış mı? Yapılandırılmamışsa uygulama "kurulum bekleniyor" durumunda çalışır. */
export function getSupabasePublicConfig(): SupabasePublicConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey || !/^https:\/\//.test(url)) return null;
  return { url, anonKey };
}

export const isSupabaseConfigured = () => getSupabasePublicConfig() !== null;
