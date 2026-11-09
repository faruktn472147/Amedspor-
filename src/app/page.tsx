import Link from "next/link";
import { BarChart3, Brain, CalendarDays, Clapperboard, Flame, Landmark, MessageSquareText, Newspaper, Star, Target, Trophy, Users } from "lucide-react";
import { getViewer } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getFeaturedFans, getMatches, getNews, getPlayerOfTheDay, getTodayQuiz, getTopPerformers } from "@/lib/data/content";
import { getFeed, getRecentComments } from "@/lib/data/social";
import { Ad } from "@/components/ads/ad";
import { MatchCard } from "@/components/football/match-card";
import { NewsCard } from "@/components/news/news-card";
import { PostCard } from "@/components/social/post-card";
import { Avatar, Card, EmptyState, LinkButton, SectionHeader, SetupNotice } from "@/components/ui";
import { compactNumber, timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const configured = isSupabaseConfigured();
  const [viewer, live, upcoming, past, news, official, feed, popular, shorts, polls, comments, potd, performers, quiz, fans] = await Promise.all([
    getViewer(),
    getMatches("live", 2),
    getMatches("upcoming", 1),
    getMatches("past", 1),
    getNews({ limit: 6 }),
    getNews({ category: "resmi", limit: 3 }),
    getFeed({ limit: 4 }),
    getFeed({ scope: "popular", limit: 3 }),
    getFeed({ scope: "shorts", limit: 8 }),
    getFeed({ limit: 30 }),
    getRecentComments(5),
    getPlayerOfTheDay(),
    getTopPerformers(5),
    getTodayQuiz(),
    getFeaturedFans(6),
  ]);
  const viewerId = viewer?.user.id ?? null;
  const dataSaver = viewer?.profile?.data_saver ?? false;
  const breaking = news.filter((n) => n.category === "son_dakika");
  const pollPosts = polls.posts.filter((p) => p.kind === "poll").slice(0, 2);
  const nextMatch = upcoming[0];
  const lastMatch = past[0];

  return (
    <div className="space-y-8">
      {!configured && <SetupNotice />}

      {/* Maç merkezi: canlı > sıradaki > son */}
      <section aria-labelledby="mac-baslik">
        <SectionHeader title={live.length ? "Canlı maç" : "Maç merkezi"} href="/maclar" icon={<Trophy className="h-5 w-5 text-green" />} />
        <h2 id="mac-baslik" className="sr-only">Maçlar</h2>
        {live.length || nextMatch || lastMatch ? (
          <div className="grid gap-3 md:grid-cols-2">
            {live.map((m) => <MatchCard key={m.id} match={m} />)}
            {!live.length && nextMatch && <MatchCard match={nextMatch} label="Sıradaki maç" />}
            {lastMatch && <MatchCard match={lastMatch} label="Son maç" />}
          </div>
        ) : (
          <EmptyState icon={<CalendarDays className="h-9 w-9" />} title="Maç verisi henüz girilmedi" description="Fikstür ve skorlar yalnızca doğrulanmış kaynaklardan girildiğinde gösterilir. Uydurma skor gösterilmez." />
        )}
      </section>

      {/* Haberler */}
      <section>
        <SectionHeader title={breaking.length ? "Son dakika" : "Son haberler"} href="/haberler" icon={<Newspaper className="h-5 w-5 text-red" />} />
        {news.length ? (
          <div className="grid gap-4 lg:grid-cols-5">
            <div className="lg:col-span-3"><NewsCard item={breaking[0] ?? news[0]} variant="hero" /></div>
            <div className="space-y-1 lg:col-span-2">
              {news.filter((n) => n.id !== (breaking[0] ?? news[0]).id).slice(0, 4).map((n) => <NewsCard key={n.id} item={n} />)}
            </div>
          </div>
        ) : (
          <EmptyState icon={<Newspaper className="h-9 w-9" />} title="Henüz yayınlanmış haber yok" description="Haberler yalnızca güvenilir kaynaklardan, kaynak ve tarih bilgisiyle yayınlanır." />
        )}
      </section>

      {official.length > 0 && (
        <section>
          <SectionHeader title="Resmî açıklamalar" href="/haberler?kategori=resmi" />
          <div className="grid gap-1 md:grid-cols-3">{official.map((n) => <NewsCard key={n.id} item={n} />)}</div>
        </section>
      )}

      <Ad placement="home_feed" />

      {/* Shorts şeridi */}
      <section>
        <SectionHeader title="Shorts" href="/shorts" icon={<Clapperboard className="h-5 w-5 text-red" />} />
        {shorts.posts.length ? (
          <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
            {shorts.posts.map((s) => {
              const v = s.media[0];
              return (
                <Link key={s.id} href={`/shorts?v=${s.id}`} className="relative aspect-[9/16] w-32 shrink-0 overflow-hidden rounded-2xl bg-black sm:w-36">
                  {v?.poster_url && !dataSaver ? (
                    // eslint-disable-next-line @next/next/no-img-element -- video kapağı
                    <img src={v.poster_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <span className="brand-gradient absolute inset-0 opacity-70" />
                  )}
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 p-2 text-xs font-semibold text-white">
                    @{s.author?.username}
                    <span className="block text-white/70">♥ {compactNumber(s.like_count)}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <EmptyState title="Henüz Shorts yok" description="İlk dikey videoyu sen paylaş." action={<LinkButton href="/paylas?tur=short" size="sm">Shorts yükle</LinkButton>} />
        )}
      </section>

      <div className="grid gap-8 xl:grid-cols-3">
        {/* Taraftar paylaşımları */}
        <section className="xl:col-span-2">
          <SectionHeader title="Taraftar paylaşımları" href="/akis" icon={<Users className="h-5 w-5 text-green" />} />
          {feed.error === "not_configured" ? (
            <SetupNotice feature="Taraftar akışı" />
          ) : feed.posts.length ? (
            <div className="space-y-4">{feed.posts.map((p) => <PostCard key={p.id} post={p} viewerId={viewerId} dataSaver={dataSaver} />)}</div>
          ) : (
            <EmptyState title="Henüz paylaşım yok" action={<LinkButton href="/paylas">İlk paylaşımı yap</LinkButton>} />
          )}
        </section>

        <div className="space-y-8">
          {/* Günün futbolcusu */}
          <section>
            <SectionHeader title="Günün futbolcusu" icon={<Star className="h-5 w-5 text-amber-500" />} />
            {potd ? (
              <Link href={`/oyuncular/${potd.player.slug}`}>
                <Card className="flex items-center gap-4 p-4">
                  <Avatar src={potd.player.photo_url} name={potd.player.full_name} size={64} />
                  <div>
                    <p className="text-lg font-extrabold">{potd.player.full_name}</p>
                    <p className="text-sm text-fg-muted">{potd.player.position} {potd.player.shirt_number ? `· #${potd.player.shirt_number}` : ""}</p>
                    <p className="mt-1 text-sm font-bold text-green">Taraftar puanı {potd.avg.toFixed(1)} <span className="font-normal text-fg-muted">({potd.votes} oy)</span></p>
                  </div>
                </Card>
              </Link>
            ) : (
              <EmptyState title="Henüz yeterli taraftar oyu yok" description="Son maçtan sonra oyunculara puan verildiğinde (en az 5 oy) burada görünür." />
            )}
          </section>

          {/* Günün tahmini + bilgi yarışması */}
          <section>
            <SectionHeader title="Günün tahmini" href="/tahminler" icon={<Target className="h-5 w-5 text-red" />} />
            <Card className="space-y-3 p-4">
              {nextMatch ? (
                <>
                  <p className="text-sm text-fg-muted">Sıradaki maç</p>
                  <p className="font-bold">{nextMatch.home?.name} – {nextMatch.away?.name}</p>
                  <LinkButton href={`/tahminler?mac=${nextMatch.id}`} size="sm">Skor tahminini yap</LinkButton>
                </>
              ) : (
                <p className="text-sm text-fg-muted">Tahmin açılacak bir maç henüz planlanmadı.</p>
              )}
              <div className="border-t border-border pt-3">
                <p className="flex items-center gap-1.5 text-sm font-bold"><Brain className="h-4 w-4 text-green" />Günlük bilgi yarışması</p>
                <p className="mt-1 text-sm text-fg-muted">{quiz ? quiz.quiz.question : "Bugünün sorusu henüz eklenmedi."}</p>
                {quiz && <Link href="/tahminler#yarisma" className="mt-2 inline-block text-sm font-semibold text-green">{quiz.answer ? "Sonucunu gör" : "Cevapla"} →</Link>}
              </div>
              <p className="text-xs text-fg-muted">Yalnızca eğlence amaçlıdır. Para, bahis veya nakit ödül yoktur.</p>
            </Card>
          </section>

          {/* Oyuncu performansları */}
          <section>
            <SectionHeader title="Oyuncu performansları" href="/oyuncular" icon={<BarChart3 className="h-5 w-5 text-green" />} />
            {performers.length ? (
              <Card className="divide-y divide-border">
                {performers.map((p) => (
                  <Link key={`${p.player.slug}-${p.season}-${p.competition}`} href={`/oyuncular/${p.player.slug}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted">
                    <Avatar src={p.player.photo_url} name={p.player.full_name} size={34} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.player.full_name}</span>
                    <span className="text-sm tabular-nums"><b>{p.goals}</b> gol · <b>{p.assists}</b> asist</span>
                  </Link>
                ))}
                <p className="px-4 py-2 text-[11px] text-fg-muted">Kaynak: {performers[0].source_name ?? "belirtilmedi"} · {performers[0].season}</p>
              </Card>
            ) : (
              <EmptyState title="İstatistik verisi yok" description="Oyuncu istatistikleri kaynağıyla birlikte girildiğinde görünür." />
            )}
          </section>
        </div>
      </div>

      {/* Anketler + popüler */}
      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <SectionHeader title="Taraftar anketleri" href="/paylas?tur=poll" action="Anket oluştur" icon={<BarChart3 className="h-5 w-5 text-red" />} />
          {pollPosts.length ? (
            <div className="space-y-4">{pollPosts.map((p) => <PostCard key={p.id} post={p} viewerId={viewerId} dataSaver={dataSaver} />)}</div>
          ) : (
            <EmptyState title="Aktif anket yok" action={<LinkButton href="/paylas?tur=poll" size="sm" variant="outline">Anket başlat</LinkButton>} />
          )}
        </section>
        <section>
          <SectionHeader title="Haftanın popüler gönderileri" href="/akis?sekme=populer" icon={<Flame className="h-5 w-5 text-red" />} />
          {popular.posts.length ? (
            <div className="space-y-4">{popular.posts.map((p) => <PostCard key={p.id} post={p} viewerId={viewerId} dataSaver={dataSaver} />)}</div>
          ) : (
            <EmptyState title="Bu hafta henüz popüler gönderi yok" />
          )}
        </section>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <section>
          <SectionHeader title="Son yorumlar" icon={<MessageSquareText className="h-5 w-5 text-green" />} />
          {comments.length ? (
            <Card className="divide-y divide-border">
              {comments.map((c) => (
                <Link key={c.id} href={`/gonderi/${c.post_id}#yorumlar`} className="flex gap-3 px-4 py-3 hover:bg-muted">
                  <Avatar src={c.author?.avatar_url} name={c.author?.username ?? "?"} size={30} />
                  <p className="min-w-0 text-sm"><b>@{c.author?.username}</b> <span className="line-clamp-2 text-fg-muted">{c.body}</span><span className="text-xs text-fg-muted">{timeAgo(c.created_at)}</span></p>
                </Link>
              ))}
            </Card>
          ) : (
            <EmptyState title="Henüz yorum yok" />
          )}
        </section>
        <section>
          <SectionHeader title="Öne çıkan taraftarlar" icon={<Users className="h-5 w-5 text-green" />} />
          {fans.length ? (
            <Card className="grid grid-cols-3 gap-3 p-4">
              {fans.map((f) => (
                <Link key={f.id} href={`/u/${f.username}`} className="flex flex-col items-center gap-1 text-center">
                  <Avatar src={f.avatar_url} name={f.display_name || f.username} size={52} />
                  <span className="w-full truncate text-xs font-semibold">@{f.username}</span>
                  <span className="text-[11px] text-fg-muted">{compactNumber(f.followers_count)} takipçi</span>
                </Link>
              ))}
            </Card>
          ) : (
            <EmptyState title="Topluluk yeni kuruluyor" description="Tematik taraftar toplulukları (gruplar) bir sonraki aşamada eklenecek." />
          )}
        </section>
        <section>
          <SectionHeader title="Amedspor tarihi" href="/tarihce" icon={<Landmark className="h-5 w-5 text-red" />} />
          <Card className="brand-gradient p-5 text-white">
            <p className="text-lg font-extrabold">Kulübün hikâyesi</p>
            <p className="mt-1 text-sm text-white/85">Kaynaklarıyla birlikte derlenen Amedspor tarihi; kuruluş, başarılar ve unutulmaz maçlar.</p>
            <Link href="/tarihce" className="mt-3 inline-block rounded-xl bg-white px-4 py-2 text-sm font-bold text-red">Tarihçeyi oku</Link>
          </Card>
        </section>
      </div>
    </div>
  );
}
