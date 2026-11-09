import Link from "next/link";
import { Bell } from "lucide-react";
import { requireViewer } from "@/lib/auth";
import { getNotifications } from "@/lib/data/content";
import { getFollowRequests } from "@/lib/data/social";
import { FollowRequestButtons, MarkRead } from "@/components/social/notification-list";
import { Avatar, Card, EmptyState, PageHeader } from "@/components/ui";
import { timeAgo } from "@/lib/utils";

export const metadata = { title: "Bildirimler" };

export default async function NotificationsPage() {
  await requireViewer("/bildirimler");
  const [items, requests] = await Promise.all([getNotifications(), getFollowRequests()]);
  const unread = items.filter((n) => !n.read_at).length;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title="Bildirimler" />
      <MarkRead unread={unread} />
      {requests.length > 0 && (
        <Card className="p-4">
          <h2 className="mb-3 font-bold">Takip istekleri ({requests.length})</h2>
          <div className="space-y-3">
            {requests.map((r) => (
              <div key={r.requester_id} className="flex items-center gap-3">
                <Link href={`/u/${r.requester.username}`} className="flex min-w-0 flex-1 items-center gap-3"><Avatar src={r.requester.avatar_url} name={r.requester.username} size={38} /><span className="truncate font-semibold">@{r.requester.username}</span></Link>
                <FollowRequestButtons requesterId={r.requester_id} />
              </div>
            ))}
          </div>
        </Card>
      )}
      {items.length ? (
        <Card className="divide-y divide-border">
          {items.map((n) => {
            const inner = (
              <div className={`flex items-start gap-3 px-4 py-3 ${n.read_at ? "" : "bg-green/5"}`}>
                {n.actor ? <Avatar src={n.actor.avatar_url} name={n.actor.username} size={38} /> : <span className="brand-gradient flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full text-white"><Bell className="h-4 w-4" /></span>}
                <p className="min-w-0 flex-1 text-sm">{n.actor && <b>@{n.actor.username} </b>}{n.message}<span className="block text-xs text-fg-muted">{timeAgo(n.created_at)}</span></p>
                {!n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red" aria-label="okunmamış" />}
              </div>
            );
            const href = n.link ?? (n.actor ? `/u/${n.actor.username}` : null);
            return href ? <Link key={n.id} href={href} className="block hover:bg-muted">{inner}</Link> : <div key={n.id}>{inner}</div>;
          })}
        </Card>
      ) : (
        <EmptyState icon={<Bell className="h-10 w-10" />} title="Bildirimin yok" description="Beğeni, yorum, takip ve maç bildirimleri burada görünür." />
      )}
    </div>
  );
}
