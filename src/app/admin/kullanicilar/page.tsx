import { requireRole } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { setRoleAction, setUserStatusAction } from "@/app/actions/admin";
import { ActionButton } from "@/components/admin/action-button";
import { Avatar, Badge, Card, EmptyState, Input } from "@/components/ui";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Kullanıcılar" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const v = await requireRole("moderator", "/admin/kullanicilar");
  const { q = "" } = await searchParams;
  const admin = getSupabaseAdmin();
  if (!admin) return <EmptyState title="Veritabanı yapılandırılmadı" />;
  let query = admin.from("profiles").select("id, username, display_name, avatar_url, status, created_at, posts_count, followers_count").order("created_at", { ascending: false }).limit(50);
  const safe = q.replace(/[%_,()]/g, "").slice(0, 30);
  if (safe) query = query.ilike("username", `%${safe}%`);
  const { data: users } = await query;
  const ids = (users ?? []).map((u) => u.id);
  const { data: roles } = ids.length ? await admin.from("admin_roles").select("user_id, role").in("user_id", ids) : { data: [] };
  const rolesOf = (id: string) => (roles ?? []).filter((r) => r.user_id === id).map((r) => r.role as string);
  const isOwner = v.roles.includes("owner");
  return (
    <div className="space-y-4">
      <form className="flex gap-2"><Input name="q" defaultValue={q} placeholder="Kullanıcı adına göre ara" /></form>
      {!isOwner && <p className="text-xs text-fg-muted">Rol atamaları yalnızca platform sahibi (2FA ile) tarafından yapılabilir.</p>}
      <Card className="divide-y divide-border">
        {(users ?? []).map((u) => {
          const r = rolesOf(u.id);
          return (
            <div key={u.id} className="flex flex-wrap items-center gap-3 p-4">
              <Avatar src={u.avatar_url} name={u.username} size={40} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">@{u.username} {r.map((x) => <Badge key={x} tone="green" className="ml-1">{x}</Badge>)} {u.status !== "active" && <Badge tone="red" className="ml-1">{u.status}</Badge>}</p>
                <p className="text-xs text-fg-muted">{formatDate(u.created_at)} · {u.posts_count} gönderi · {u.followers_count} takipçi</p>
              </div>
              {!r.includes("owner") && u.id !== v.user.id && (
                <div className="flex flex-wrap gap-2">
                  {u.status === "active" ? (
                    <>
                      <ActionButton action={setUserStatusAction.bind(null, u.id, "suspended", "Topluluk kuralı ihlali")} confirmText="Hesap askıya alınsın mı?">Askıya al</ActionButton>
                      <ActionButton variant="danger" action={setUserStatusAction.bind(null, u.id, "banned", "Ağır ihlal")} confirmText="Hesap kalıcı olarak yasaklansın mı?">Yasakla</ActionButton>
                    </>
                  ) : (
                    <ActionButton action={setUserStatusAction.bind(null, u.id, "active", "Kısıtlama kaldırıldı")}>Kısıtlamayı kaldır</ActionButton>
                  )}
                  {isOwner && (["moderator", "editor", "admin"] as const).map((role) => (
                    <ActionButton key={role} variant="ghost" action={setRoleAction.bind(null, u.id, role, !r.includes(role))}>{r.includes(role) ? `− ${role}` : `+ ${role}`}</ActionButton>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </Card>
    </div>
  );
}
