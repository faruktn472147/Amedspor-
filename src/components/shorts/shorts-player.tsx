"use client";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bookmark, Heart, MessageCircle, Play, Share2, Volume2, VolumeX, Wifi } from "lucide-react";
import { followAction, unfollowAction } from "@/app/actions/profile";
import { toggleBookmarkAction, toggleLikeAction } from "@/app/actions/social";
import type { Post } from "@/lib/types";
import { compactNumber, cn } from "@/lib/utils";
import { Avatar } from "@/components/ui";
import { ReportButton } from "@/components/social/report-button";

export type ShortEntry = { type: "item"; post: Post; following: boolean } | { type: "ad"; key: string; node: ReactNode };

function ShortItem({ post, active, dataSaver, muted, setMuted, viewerId, following }: { post: Post; active: boolean; dataSaver: boolean; muted: boolean; setMuted: (m: boolean) => void; viewerId: string | null; following: boolean }) {
  const video = post.media.find((m) => m.media_type === "video");
  const ref = useRef<HTMLVideoElement>(null);
  const [tapped, setTapped] = useState(false);
  const [liked, setLiked] = useState(!!post.liked_by_me);
  const [likes, setLikes] = useState(post.like_count);
  const [saved, setSaved] = useState(!!post.bookmarked_by_me);
  const [follows, setFollows] = useState(following);
  const [, start] = useTransition();
  const router = useRouter();
  const shouldLoad = active && (!dataSaver || tapped);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (shouldLoad) v.play().catch(() => {});
    else v.pause();
  }, [shouldLoad]);

  const need = () => {
    if (viewerId) return true;
    router.push("/giris?next=/shorts");
    return false;
  };
  const name = post.author?.display_name || post.author?.username || "";

  return (
    <div className="relative h-full w-full overflow-hidden bg-black text-white">
      {video?.url && shouldLoad ? (
        <video
          ref={ref}
          src={video.url}
          poster={video.poster_url ?? undefined}
          className="h-full w-full object-contain"
          loop
          playsInline
          muted={muted}
          preload="metadata"
          onClick={(e) => (e.currentTarget.paused ? e.currentTarget.play() : e.currentTarget.pause())}
        />
      ) : (
        <button type="button" className="relative h-full w-full" onClick={() => setTapped(true)} aria-label="Videoyu oynat">
          {video?.poster_url && !dataSaver ? (
            // eslint-disable-next-line @next/next/no-img-element -- video kapağı
            <img src={video.poster_url} alt="" className="h-full w-full object-contain" />
          ) : (
            <span className="brand-gradient absolute inset-0 opacity-40" />
          )}
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <Play className="h-14 w-14 fill-white/90" />
            {dataSaver && <span className="rounded-full bg-black/60 px-3 py-1 text-xs">Veri tasarrufu açık · oynatmak için dokun</span>}
          </span>
        </button>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent" />
      <div className="absolute bottom-4 left-4 right-20">
        <div className="flex items-center gap-2">
          <Link href={`/u/${post.author?.username}`} className="flex items-center gap-2">
            <Avatar src={post.author?.avatar_url} name={name} size={36} />
            <span className="font-semibold">@{post.author?.username}</span>
          </Link>
          {viewerId && viewerId !== post.author_id && (
            <button
              type="button"
              className={cn("rounded-full border px-3 py-0.5 text-xs font-bold", follows ? "border-white/40 text-white/80" : "border-white bg-white text-black")}
              onClick={() =>
                start(async () => {
                  const r = follows ? await unfollowAction(post.author_id) : await followAction(post.author_id);
                  if (r.ok) setFollows(!follows);
                })
              }
            >
              {follows ? "Takipte" : "Takip et"}
            </button>
          )}
        </div>
        {post.body && <p className="mt-2 line-clamp-3 text-sm">{post.body}</p>}
      </div>

      <div className="absolute bottom-4 right-3 flex flex-col items-center gap-4">
        <button
          type="button"
          aria-pressed={liked}
          aria-label="Beğen"
          className="flex flex-col items-center"
          onClick={() => {
            if (!need()) return;
            const next = !liked;
            setLiked(next);
            setLikes((n) => n + (next ? 1 : -1));
            start(async () => { await toggleLikeAction(post.id, next); });
          }}
        >
          <Heart className={cn("h-8 w-8", liked && "heart-pop fill-red text-red")} />
          <span className="text-xs font-semibold">{compactNumber(likes)}</span>
        </button>
        <Link href={`/gonderi/${post.id}#yorumlar`} className="flex flex-col items-center" aria-label="Yorumlar">
          <MessageCircle className="h-8 w-8" />
          <span className="text-xs font-semibold">{compactNumber(post.comment_count)}</span>
        </Link>
        <button
          type="button"
          aria-pressed={saved}
          aria-label="Kaydet"
          onClick={() => {
            if (!need()) return;
            const next = !saved;
            setSaved(next);
            start(async () => { await toggleBookmarkAction(post.id, next); });
          }}
        >
          <Bookmark className={cn("h-7 w-7", saved && "fill-white")} />
        </button>
        <button
          type="button"
          aria-label="Paylaş"
          onClick={async () => {
            const url = `${location.origin}/gonderi/${post.id}`;
            try {
              if (navigator.share) await navigator.share({ url });
              else await navigator.clipboard.writeText(url);
            } catch {
              /* iptal */
            }
          }}
        >
          <Share2 className="h-7 w-7" />
        </button>
        <button type="button" aria-label={muted ? "Sesi aç" : "Sesi kapat"} onClick={() => setMuted(!muted)}>
          {muted ? <VolumeX className="h-7 w-7" /> : <Volume2 className="h-7 w-7" />}
        </button>
        {viewerId && viewerId !== post.author_id && <ReportButton targetType="post" targetId={post.id} label="" className="text-white/80" />}
      </div>
    </div>
  );
}

export function ShortsPlayer({ entries, viewerId, defaultDataSaver }: { entries: ShortEntry[]; viewerId: string | null; defaultDataSaver: boolean }) {
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(true);
  const [dataSaver, setDataSaver] = useState(defaultDataSaver);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem("amed-data-saver");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- tarayıcıya kayıtlı tercih yalnızca istemcide okunabilir
      if (v !== null) setDataSaver(v === "1");
    } catch {
      /* depolama kapalı */
    }
  }, []);

  useEffect(() => {
    const root = container.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (items) => {
        for (const it of items) if (it.isIntersecting) setActive(Number((it.target as HTMLElement).dataset.index));
      },
      { root, threshold: 0.7 },
    );
    root.querySelectorAll("[data-index]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [entries.length]);

  return (
    <div className="relative mx-auto max-w-md">
      <button
        type="button"
        onClick={() => {
          const next = !dataSaver;
          setDataSaver(next);
          try {
            localStorage.setItem("amed-data-saver", next ? "1" : "0");
          } catch {
            /* depolama kapalı */
          }
        }}
        className={cn("absolute left-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold", dataSaver ? "bg-green text-white" : "bg-black/60 text-white")}
        aria-pressed={dataSaver}
      >
        <Wifi className="h-3.5 w-3.5" /> Veri tasarrufu {dataSaver ? "açık" : "kapalı"}
      </button>
      <div ref={container} className="shorts-container no-scrollbar rounded-2xl bg-black">
        {entries.map((e, i) => (
          <section key={e.type === "item" ? e.post.id : e.key} data-index={i} className="shorts-item" aria-label={e.type === "ad" ? "Sponsorlu içerik" : `Shorts ${i + 1}`}>
            {e.type === "item" ? (
              <ShortItem post={e.post} active={i === active} dataSaver={dataSaver} muted={muted} setMuted={setMuted} viewerId={viewerId} following={e.following} />
            ) : (
              <div className="h-full p-4">{e.node}</div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
