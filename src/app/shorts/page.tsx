import { Clapperboard } from "lucide-react";
import { getViewer } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getFeed, getPost } from "@/lib/data/social";
import { getPlacementAds } from "@/lib/ads/server";
import { adPositions } from "@/lib/ads/frequency";
import { Ad } from "@/components/ads/ad";
import { ShortsPlayer, type ShortEntry } from "@/components/shorts/shorts-player";
import { EmptyState, LinkButton, SetupNotice } from "@/components/ui";

export const metadata = { title: "Shorts" };

export default async function ShortsPage({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  const { v } = await searchParams;
  const [viewer, feed] = await Promise.all([getViewer(), getFeed({ scope: "shorts", limit: 20 })]);
  if (feed.error === "not_configured") return <SetupNotice feature="Shorts" />;
  let posts = feed.posts.filter((p) => p.media.some((m) => m.media_type === "video"));
  if (v) {
    const first = posts.find((p) => p.id === v) ?? (await getPost(v));
    if (first && first.kind === "short") posts = [first, ...posts.filter((p) => p.id !== first.id)];
  }
  if (!posts.length)
    return (
      <EmptyState
        icon={<Clapperboard className="h-10 w-10" />}
        title="Henüz Shorts yok"
        description="Dikey (9:16) en fazla 60 saniyelik videolarını paylaş."
        action={<LinkButton href="/paylas?tur=short">Shorts yükle</LinkButton>}
      />
    );

  let following = new Set<string>();
  const supabase = await createSupabaseServerClient();
  if (viewer && supabase) {
    const { data } = await supabase.from("follows").select("following_id").eq("follower_id", viewer.user.id).in("following_id", posts.map((p) => p.author_id));
    following = new Set((data ?? []).map((r) => r.following_id as string));
  }

  // Sponsorlu kart çok seyrek: ayarlardaki "shorts_every" aralığında, sayfa başına sınırlı
  const ads = await getPlacementAds("shorts_feed");
  const positions = new Set(ads.show ? adPositions(posts.length, ads.settings.shorts_every, ads.settings.shorts_every, Math.min(1, ads.settings.max_per_page)) : []);
  const entries: ShortEntry[] = [];
  posts.forEach((p, i) => {
    entries.push({ type: "item", post: p, following: following.has(p.author_id) });
    if (positions.has(i) && ads.campaigns.length) entries.push({ type: "ad", key: `ad-${i}`, node: <Ad placement="shorts_feed" variant="short" /> });
  });
  return <ShortsPlayer entries={entries} viewerId={viewer?.user.id ?? null} defaultDataSaver={viewer?.profile?.data_saver ?? false} />;
}
