import Link from "next/link";
import { notFound } from "next/navigation";
import { getFollowList, getProfileByUsername } from "@/lib/data/social";
import { Avatar, Card, EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "Takipçiler" };

export default async function Page({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const data = await getProfileByUsername(username);
  if (!data) notFound();
  if (!data.canView) return <EmptyState title="Bu hesap gizli" description="Listeyi görmek için hesabı takip etmelisin." />;
  const list = await getFollowList(data.profile.id, "followers");
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Takipçiler" description={`@${data.profile.username}`} />
      {list.length ? (
        <Card className="divide-y divide-border">
          {list.map((u) => (
            <Link key={u.id} href={`/u/${u.username}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted">
              <Avatar src={u.avatar_url} name={u.display_name || u.username} size={42} />
              <span><span className="block font-semibold">{u.display_name || u.username}</span><span className="text-sm text-fg-muted">@{u.username}</span></span>
            </Link>
          ))}
        </Card>
      ) : (
        <EmptyState title="Liste boş" />
      )}
    </div>
  );
}
