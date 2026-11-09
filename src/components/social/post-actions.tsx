"use client";
import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bookmark, Heart, MessageCircle, MoreHorizontal, Pencil, Share2, Trash2 } from "lucide-react";
import { deletePostAction, editPostAction, toggleBookmarkAction, toggleLikeAction } from "@/app/actions/social";
import { compactNumber, cn } from "@/lib/utils";
import { Button, Textarea } from "@/components/ui";
import { ReportButton } from "./report-button";

export function PostActions({
  postId,
  likeCount,
  commentCount,
  liked,
  bookmarked,
  signedIn,
}: {
  postId: string;
  likeCount: number;
  commentCount: number;
  liked: boolean;
  bookmarked: boolean;
  signedIn: boolean;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [state, setOptimistic] = useOptimistic({ liked, likeCount, bookmarked }, (s, a: "like" | "save") =>
    a === "like" ? { ...s, liked: !s.liked, likeCount: s.likeCount + (s.liked ? -1 : 1) } : { ...s, bookmarked: !s.bookmarked },
  );
  const [shared, setShared] = useState(false);

  const guard = () => {
    if (!signedIn) {
      router.push(`/giris?next=/gonderi/${postId}`);
      return false;
    }
    return true;
  };

  const share = async () => {
    const url = `${window.location.origin}/gonderi/${postId}`;
    try {
      if (navigator.share) await navigator.share({ url, title: "AMEDSPOR" });
      else {
        await navigator.clipboard.writeText(url);
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      }
    } catch {
      /* kullanıcı paylaşımı iptal etti */
    }
  };

  return (
    <div className="flex items-center gap-1 px-2 py-1">
      <button
        type="button"
        aria-pressed={state.liked}
        aria-label={state.liked ? "Beğeniyi geri al" : "Beğen"}
        onClick={() => {
          if (!guard()) return;
          start(async () => {
            setOptimistic("like");
            const r = await toggleLikeAction(postId, !state.liked);
            if (!r.ok) router.refresh();
          });
        }}
        className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 hover:bg-muted"
      >
        <Heart className={cn("h-[22px] w-[22px]", state.liked && "heart-pop fill-red text-red")} />
        <span className="text-sm font-semibold tabular-nums">{compactNumber(state.likeCount)}</span>
      </button>
      <Link href={`/gonderi/${postId}#yorumlar`} className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 hover:bg-muted" aria-label="Yorumlar">
        <MessageCircle className="h-[22px] w-[22px]" />
        <span className="text-sm font-semibold tabular-nums">{compactNumber(commentCount)}</span>
      </Link>
      <button type="button" onClick={share} className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 hover:bg-muted" aria-label="Paylaş">
        <Share2 className="h-[20px] w-[20px]" />
        {shared && <span className="text-xs text-green">Bağlantı kopyalandı</span>}
      </button>
      <button
        type="button"
        aria-pressed={state.bookmarked}
        aria-label={state.bookmarked ? "Kaydedilenlerden çıkar" : "Kaydet"}
        onClick={() => {
          if (!guard()) return;
          start(async () => {
            setOptimistic("save");
            const r = await toggleBookmarkAction(postId, !state.bookmarked);
            if (!r.ok) router.refresh();
          });
        }}
        className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted"
      >
        <Bookmark className={cn("h-[22px] w-[22px]", state.bookmarked && "fill-fg")} />
      </button>
    </div>
  );
}

export function PostMenu({ postId, isOwner, body, signedIn }: { postId: string; isOwner: boolean; body: string; signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(body);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Gönderi seçenekleri" aria-expanded={open} className="rounded-full p-2 hover:bg-muted">
        <MoreHorizontal className="h-5 w-5" />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-52 rounded-xl border border-border bg-elevated p-1 shadow-xl">
          {isOwner ? (
            <>
              <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted" onClick={() => { setEditing(true); setOpen(false); }}>
                <Pencil className="h-4 w-4" /> Düzenle
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red hover:bg-muted"
                onClick={() => {
                  if (!confirm("Bu gönderiyi kalıcı olarak silmek istiyor musun?")) return;
                  start(async () => {
                    const r = await deletePostAction(postId);
                    if (r.ok) router.push("/akis");
                    else setMsg(r.error);
                  });
                }}
              >
                <Trash2 className="h-4 w-4" /> Sil
              </button>
            </>
          ) : signedIn ? (
            <div className="px-3 py-2">
              <ReportButton targetType="post" targetId={postId} />
            </div>
          ) : (
            <p className="px-3 py-2 text-sm text-fg-muted">Şikâyet için giriş yap.</p>
          )}
        </div>
      )}
      {editing && (
        <div role="dialog" aria-modal="true" aria-label="Gönderiyi düzenle" className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center">
          <div className="w-full max-w-lg space-y-3 rounded-2xl bg-elevated p-4">
            <p className="font-bold">Gönderiyi düzenle</p>
            <Textarea rows={5} maxLength={2200} value={text} onChange={(e) => setText(e.target.value)} />
            {msg && <p className="text-sm text-red">{msg}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(false)}>Vazgeç</Button>
              <Button
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await editPostAction(postId, text);
                    if (r.ok) {
                      setEditing(false);
                      router.refresh();
                    } else setMsg(r.error);
                  })
                }
              >
                Kaydet
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
