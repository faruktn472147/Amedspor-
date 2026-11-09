import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { dismissReportAction, moderateContentAction, reviewAppealAction } from "@/app/actions/admin";
import { ActionButton } from "@/components/admin/action-button";
import { Badge, Card, EmptyState, SectionHeader } from "@/components/ui";
import { timeAgo } from "@/lib/utils";

export const metadata = { title: "Moderasyon" };

export default async function ModerationPage() {
  await requireRole("moderator", "/admin/moderasyon");
  const admin = getSupabaseAdmin();
  if (!admin) return <EmptyState title="Veritabanı yapılandırılmadı" />;
  const [posts, comments, reports, appeals] = await Promise.all([
    admin.from("posts").select("id, body, kind, moderation_reason, created_at, author:profiles!posts_author_id_fkey(username)").eq("moderation_status", "pending").order("created_at").limit(50),
    admin.from("comments").select("id, body, post_id, moderation_reason, created_at, author:profiles!comments_author_id_fkey(username)").eq("moderation_status", "pending").order("created_at").limit(50),
    admin.from("reports").select("id, target_type, target_id, reason, details, created_at").in("status", ["open", "reviewing"]).order("created_at").limit(100),
    admin.from("appeals").select("id, message, created_at, user:profiles!appeals_user_id_fkey(username), action:moderation_actions(target_type, target_id, action, reason)").eq("status", "open").order("created_at").limit(50),
  ]);
  type A = { username: string } | null;
  return (
    <div className="space-y-8">
      <section>
        <SectionHeader title={`İncelemedeki gönderiler (${posts.data?.length ?? 0})`} />
        {posts.data?.length ? (
          <div className="space-y-3">
            {posts.data.map((p) => (
              <Card key={p.id} className="p-4">
                <div className="mb-2 flex items-center gap-2 text-xs text-fg-muted"><b>@{(p.author as unknown as A)?.username}</b> · {timeAgo(p.created_at)} · <Badge>{p.kind}</Badge> <Link href={`/gonderi/${p.id}`} className="underline">görüntüle (medya)</Link></div>
                <p className="whitespace-pre-wrap text-sm">{p.body || <i>(yalnızca medya)</i>}</p>
                {p.moderation_reason && <p className="mt-1 text-xs text-amber-600">Otomatik: {p.moderation_reason}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <ActionButton variant="primary" action={moderateContentAction.bind(null, "post", p.id, "approve", "")}>Onayla</ActionButton>
                  <ActionButton variant="danger" action={moderateContentAction.bind(null, "post", p.id, "reject", "Topluluk kurallarına aykırı")}>Reddet</ActionButton>
                </div>
              </Card>
            ))}
          </div>
        ) : <EmptyState title="İnceleme bekleyen gönderi yok" />}
      </section>

      <section>
        <SectionHeader title={`İncelemedeki yorumlar (${comments.data?.length ?? 0})`} />
        {comments.data?.length ? (
          <Card className="divide-y divide-border">
            {comments.data.map((c) => (
              <div key={c.id} className="p-4">
                <p className="text-xs text-fg-muted"><b>@{(c.author as unknown as A)?.username}</b> · {timeAgo(c.created_at)} · <Link href={`/gonderi/${c.post_id}`} className="underline">gönderi</Link></p>
                <p className="mt-1 text-sm">{c.body}</p>
                <div className="mt-2 flex gap-2">
                  <ActionButton variant="primary" action={moderateContentAction.bind(null, "comment", c.id, "approve", "")}>Onayla</ActionButton>
                  <ActionButton variant="danger" action={moderateContentAction.bind(null, "comment", c.id, "reject", "Topluluk kurallarına aykırı")}>Reddet</ActionButton>
                </div>
              </div>
            ))}
          </Card>
        ) : <EmptyState title="İnceleme bekleyen yorum yok" />}
      </section>

      <section>
        <SectionHeader title={`Açık şikâyetler (${reports.data?.length ?? 0})`} />
        {reports.data?.length ? (
          <Card className="divide-y divide-border">
            {reports.data.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm"><Badge tone="red">{r.reason}</Badge> <span className="ml-1">{r.target_type}</span> · <span className="text-fg-muted">{timeAgo(r.created_at)}</span></p>
                  {r.details && <p className="mt-1 text-sm text-fg-muted">{r.details}</p>}
                  {r.target_type === "post" && <Link href={`/gonderi/${r.target_id}`} className="text-xs underline">İçeriği aç</Link>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {(r.target_type === "post" || r.target_type === "comment") && (
                    <ActionButton variant="danger" action={moderateContentAction.bind(null, r.target_type, r.target_id, "remove", `Şikâyet: ${r.reason}`)}>İçeriği kaldır</ActionButton>
                  )}
                  <ActionButton action={dismissReportAction.bind(null, r.id)}>Yersiz</ActionButton>
                </div>
              </div>
            ))}
          </Card>
        ) : <EmptyState title="Açık şikâyet yok" />}
      </section>

      <section>
        <SectionHeader title={`İtirazlar (${appeals.data?.length ?? 0})`} />
        {appeals.data?.length ? (
          <Card className="divide-y divide-border">
            {appeals.data.map((a) => {
              const act = a.action as unknown as { target_type: string; target_id: string; action: string; reason: string } | null;
              return (
                <div key={a.id} className="p-4">
                  <p className="text-xs text-fg-muted"><b>@{(a.user as unknown as A)?.username}</b> · {timeAgo(a.created_at)} · Karar: {act?.action} ({act?.reason})</p>
                  <p className="mt-1 text-sm">{a.message}</p>
                  {act?.target_type === "post" && <Link href={`/gonderi/${act.target_id}`} className="text-xs underline">İçeriği aç</Link>}
                  <div className="mt-2 flex gap-2">
                    <ActionButton variant="primary" action={reviewAppealAction.bind(null, a.id, true)}>Kabul et (içeriği geri yükle)</ActionButton>
                    <ActionButton action={reviewAppealAction.bind(null, a.id, false)}>Reddet</ActionButton>
                  </div>
                </div>
              );
            })}
          </Card>
        ) : <EmptyState title="Açık itiraz yok" />}
      </section>
    </div>
  );
}
