import Link from "next/link";
import { getViewer } from "@/lib/auth";
import { getFeed } from "@/lib/data/social";
import { Feed } from "@/components/social/feed";
import { LinkButton, PageHeader } from "@/components/ui";
import { cn } from "@/lib/utils";

export const metadata = { title: "Taraftar Akışı" };

const TABS = [
  ["kesfet", "Keşfet"],
  ["takip", "Takip ettiklerim"],
  ["populer", "Haftanın popülerleri"],
] as const;

export default async function FeedPage({ searchParams }: { searchParams: Promise<{ sekme?: string; once?: string }> }) {
  const sp = await searchParams;
  const viewer = await getViewer();
  const tab = TABS.some(([k]) => k === sp.sekme) ? sp.sekme! : "kesfet";
  const scope = tab === "takip" ? "following" : tab === "populer" ? "popular" : "all";
  const cursor = sp.once && !Number.isNaN(Date.parse(sp.once)) ? sp.once : null;
  const feed = tab === "takip" && !viewer ? { posts: [], nextCursor: null, error: null } : await getFeed({ scope, cursor });
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Taraftar Akışı" description="Taraftarların paylaşımları, anketleri ve maç yorumları.">
        <LinkButton href="/paylas">Paylaş</LinkButton>
      </PageHeader>
      <nav className="no-scrollbar mb-4 flex gap-2 overflow-x-auto" aria-label="Akış sekmeleri">
        {TABS.map(([k, label]) => (
          <Link key={k} href={`/akis?sekme=${k}`} aria-current={tab === k ? "page" : undefined} className={cn("shrink-0 rounded-full px-4 py-2 text-sm font-semibold", tab === k ? "bg-fg text-bg" : "bg-muted text-fg")}>
            {label}
          </Link>
        ))}
      </nav>
      <Feed
        posts={feed.posts}
        viewerId={viewer?.user.id ?? null}
        dataSaver={viewer?.profile?.data_saver ?? false}
        error={feed.error}
        emptyTitle={tab === "takip" ? (viewer ? "Takip ettiğin kişilerden paylaşım yok" : "Takip akışı için giriş yap") : "Henüz paylaşım yok"}
        nextHref={feed.nextCursor ? `/akis?sekme=${tab}&once=${encodeURIComponent(feed.nextCursor)}` : null}
      />
    </div>
  );
}
