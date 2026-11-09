import { Bookmark } from "lucide-react";
import { requireViewer } from "@/lib/auth";
import { getBookmarks } from "@/lib/data/social";
import { PostCard } from "@/components/social/post-card";
import { EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "Kaydedilenler" };

export default async function SavedPage() {
  const v = await requireViewer("/kaydedilenler");
  const posts = await getBookmarks();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Kaydedilenler" description="Yalnızca sen görebilirsin." />
      {posts.length ? <div className="space-y-4">{posts.map((p) => <PostCard key={p.id} post={p} viewerId={v.user.id} dataSaver={v.profile?.data_saver ?? false} />)}</div> : <EmptyState icon={<Bookmark className="h-10 w-10" />} title="Kaydettiğin gönderi yok" />}
    </div>
  );
}
