import Link from "next/link";
import { Users } from "lucide-react";
import type { Post } from "@/lib/types";
import { adPositions, interleaveAds, type PlacementCode } from "@/lib/ads/frequency";
import { getPlacementAds } from "@/lib/ads/server";
import { Ad } from "@/components/ads/ad";
import { EmptyState, LinkButton, SetupNotice } from "@/components/ui";
import { PostCard } from "./post-card";

/** Gönderi akışı: reklamlar ayarlardaki sıklıkla, içerikten açıkça ayrılmış biçimde araya yerleştirilir. */
export async function Feed({
  posts,
  viewerId,
  dataSaver,
  error,
  placement = "community_feed",
  nextHref,
  emptyTitle = "Henüz paylaşım yok",
}: {
  posts: Post[];
  viewerId: string | null;
  dataSaver: boolean;
  error: string | null;
  placement?: PlacementCode;
  nextHref?: string | null;
  emptyTitle?: string;
}) {
  if (error === "not_configured") return <SetupNotice feature="Taraftar akışı" />;
  if (error) return <EmptyState title="Akış yüklenemedi" description="Lütfen sayfayı yenile. Sorun sürerse daha sonra tekrar dene." />;
  if (!posts.length)
    return (
      <EmptyState
        icon={<Users className="h-10 w-10" />}
        title={emptyTitle}
        description="İlk paylaşımı sen yap; maç yorumunu, tribün fotoğrafını ya da anketini taraftarlarla paylaş."
        action={<LinkButton href="/paylas">Paylaşım yap</LinkButton>}
      />
    );
  const ads = await getPlacementAds(placement);
  const positions = ads.show ? adPositions(posts.length, ads.settings.feed_first_after, ads.settings.feed_every, ads.settings.max_per_page) : [];
  const entries = interleaveAds(posts, (p) => p.id, positions);
  return (
    <div className="space-y-4">
      {entries.map((e) =>
        e.type === "item" ? (
          <PostCard key={e.key} post={e.item} viewerId={viewerId} dataSaver={dataSaver} />
        ) : (
          <Ad key={e.key} placement={placement} slot={e.slot} />
        ),
      )}
      {nextHref && (
        <div className="flex justify-center pt-2">
          <Link href={nextHref} className="rounded-full border border-border px-5 py-2 text-sm font-semibold hover:bg-muted" scroll={false}>
            Daha fazla göster
          </Link>
        </div>
      )}
    </div>
  );
}
