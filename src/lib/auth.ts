import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Profile, Role } from "@/lib/types";

export interface SessionUser {
  id: string;
  email: string | null;
  aal: "aal1" | "aal2";
}

export interface Viewer {
  user: SessionUser;
  profile: Profile | null;
  roles: Role[];
  isPremium: boolean;
}

/**
 * Oturumdaki kullanıcıyı döndürür. JWT, Supabase tarafından imzası doğrulanarak
 * okunur (getClaims). İstemciden gelen hiçbir değere güvenilmez.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  const c = data.claims as { sub: string; email?: string; aal?: string };
  return { id: c.sub, email: c.email ?? null, aal: c.aal === "aal2" ? "aal2" : "aal1" };
});

export const getViewer = cache(async (): Promise<Viewer | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const [profileRes, rolesRes, premiumRes] = await Promise.all([
    supabase.rpc("get_my_profile").maybeSingle(),
    supabase.from("admin_roles").select("role").eq("user_id", user.id),
    supabase.rpc("is_premium"),
  ]);
  return {
    user,
    profile: (profileRes.data as Profile | null) ?? null,
    roles: ((rolesRes.data ?? []) as { role: Role }[]).map((r) => r.role),
    isPremium: premiumRes.data === true,
  };
});

/** Premium durumu — sunucuda veritabanından (is_premium) okunur. */
export async function viewerIsPremium(): Promise<boolean> {
  const v = await getViewer();
  return v?.isPremium ?? false;
}

export function hasRole(roles: Role[], required: Role): boolean {
  if (roles.includes("owner")) return true;
  if (roles.includes(required)) return true;
  if (roles.includes("admin") && (required === "moderator" || required === "editor")) return true;
  return false;
}

export async function requireViewer(next = "/"): Promise<Viewer> {
  const v = await getViewer();
  if (!v) redirect(`/giris?next=${encodeURIComponent(next)}`);
  if (v.profile?.status && v.profile.status !== "active") redirect("/hesap-askida");
  return v;
}

export async function requireRole(role: Role, next = "/admin"): Promise<Viewer> {
  const v = await requireViewer(next);
  if (!hasRole(v.roles, role)) redirect("/?yetki=yok");
  return v;
}

/** Finansal ekranlar: yalnızca sahip + iki aşamalı doğrulama (aal2). */
export async function requireOwnerAal2(): Promise<Viewer> {
  const v = await requireViewer("/admin/gelir");
  if (!v.roles.includes("owner")) redirect("/admin?yetki=yok");
  if (v.user.aal !== "aal2") redirect("/ayarlar/guvenlik?gerekli=2fa&next=/admin/gelir");
  return v;
}
