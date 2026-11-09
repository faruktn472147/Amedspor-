import Link from "next/link";
import { notFound } from "next/navigation";
import { Award, Crown, Lock, Settings } from "lucide-react";
import { getViewer } from "@/lib/auth";
import { getFeed, getProfileByUsername } from "@/lib/data/social";
import { Feed } from "@/components/social/feed";
import { ProfileActions } from "@/components/social/profile-actions";
import { Avatar, Badge, EmptyState, LinkButton } from "@/components/ui";
import { compactNumber, formatDate } from "@/lib/utils";

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return { title: `@${username}` };
}

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const [data, viewer] = await Promise.all([getProfileByUsername(username), getViewer()]);
  if (!data) notFound();
  const { profile: p } = data;
  const feed = data.canView ? await getFeed({ authorId: p.id, limit: 30 }) : { posts: [], nextCursor: null, error: null };
  const isPremiumMe = data.isMe && viewer?.isPremium;
  return (
    <div className="mx-auto max-w-2xl">
      <section className="mb-6">
        <div className="flex items-center gap-5">
          <Avatar src={p.avatar_url} name={p.display_name || p.username} size={88} className={isPremiumMe ? "ring-4 ring-amber-400" : undefined} />
          <div className="grid flex-1 grid-cols-3 text-center">
            <div><p className="text-lg font-extrabold tabular-nums">{compactNumber(p.posts_count)}</p><p className="text-xs text-fg-muted">gönderi</p></div>
            <Link href={`/u/${p.username}/takipciler`}><p className="text-lg font-extrabold tabular-nums">{compactNumber(p.followers_count)}</p><p className="text-xs text-fg-muted">takipçi</p></Link>
            <Link href={`/u/${p.username}/takip-edilenler`}><p className="text-lg font-extrabold tabular-nums">{compactNumber(p.following_count)}</p><p className="text-xs text-fg-muted">takip</p></Link>
          </div>
        </div>
        <div className="mt-4">
          <h1 className="flex items-center gap-2 text-xl font-extrabold">
            {p.display_name || p.username}
            {p.is_private && <Lock className="h-4 w-4 text-fg-muted" aria-label="Özel hesap" />}
            {isPremiumMe && <Crown className="h-4 w-4 text-amber-500" aria-label="Premium" />}
          </h1>
          <p className="text-sm text-fg-muted">@{p.username} · {formatDate(p.created_at)} tarihinden beri · {p.points} puan</p>
          {p.bio && <p className="mt-2 whitespace-pre-wrap text-[15px]">{p.bio}</p>}
          {data.badges.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {data.badges.map((b) => (
                <Badge key={b.badge_code} tone="green" className="normal-case tracking-normal" title={b.badges?.description}>
                  <Award className="h-3 w-3" /> {b.badges?.name}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <div className="mt-4 flex gap-2">
          {data.isMe ? (
            <>
              <LinkButton href="/ayarlar" variant="secondary" className="flex-1"><Settings className="h-4 w-4" /> Profili düzenle</LinkButton>
              <LinkButton href="/kaydedilenler" variant="secondary">Kaydedilenler</LinkButton>
            </>
          ) : (
            <ProfileActions targetId={p.id} isFollowing={data.isFollowing} requested={data.requested} blocked={data.blockedByMe} muted={data.mutedByMe} signedIn={!!viewer} />
          )}
        </div>
      </section>
      {data.canView ? (
        <Feed posts={feed.posts} viewerId={viewer?.user.id ?? null} dataSaver={viewer?.profile?.data_saver ?? false} error={feed.error} emptyTitle="Henüz paylaşım yok" />
      ) : (
        <EmptyState icon={<Lock className="h-10 w-10" />} title="Bu hesap gizli" description="Paylaşımları görmek için takip isteği gönder. Kabul edilirse içerikleri görebilirsin." />
      )}
    </div>
  );
}
