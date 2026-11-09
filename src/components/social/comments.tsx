"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { addCommentAction, deleteCommentAction } from "@/app/actions/social";
import type { Comment } from "@/lib/types";
import { timeAgo } from "@/lib/utils";
import { Alert, Avatar, Button, Textarea } from "@/components/ui";
import { ReportButton } from "./report-button";

export function CommentSection({ postId, comments, viewerId, postAuthorId }: { postId: string; comments: Comment[]; viewerId: string | null; postAuthorId: string }) {
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const roots = comments.filter((c) => !c.parent_id);
  const replies = (id: string) => comments.filter((c) => c.parent_id === id);

  const send = () =>
    start(async () => {
      const r = await addCommentAction(postId, text, replyTo?.id ?? null);
      if (r.ok) {
        setText("");
        setReplyTo(null);
        setMsg(r.message ? { ok: true, text: r.message } : null);
        router.refresh();
      } else setMsg({ ok: false, text: r.error });
    });

  const Item = ({ c, nested }: { c: Comment; nested?: boolean }) => (
    <li className={nested ? "ml-10 mt-3" : "mt-4"}>
      <div className="flex gap-3">
        <Link href={c.author ? `/u/${c.author.username}` : "#"}>
          <Avatar src={c.author?.avatar_url} name={c.author?.display_name || c.author?.username || "?"} size={nested ? 28 : 34} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <Link href={c.author ? `/u/${c.author.username}` : "#"} className="font-semibold">
              {c.author?.username ?? "silinmiş"}
            </Link>{" "}
            <span className="whitespace-pre-wrap break-words">{c.body}</span>
          </p>
          <div className="mt-1 flex items-center gap-3 text-xs text-fg-muted">
            <span>{timeAgo(c.created_at)}</span>
            {c.moderation_status === "pending" && <span className="text-amber-600">incelemede</span>}
            {viewerId && !nested && (
              <button type="button" className="font-semibold hover:text-fg" onClick={() => setReplyTo(c)}>
                Cevap ver
              </button>
            )}
            {viewerId && (viewerId === c.author_id || viewerId === postAuthorId) && (
              <button
                type="button"
                aria-label="Yorumu sil"
                className="hover:text-red"
                onClick={() => start(async () => { await deleteCommentAction(c.id, postId); router.refresh(); })}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            {viewerId && viewerId !== c.author_id && <ReportButton targetType="comment" targetId={c.id} label="" className="hover:text-red" />}
          </div>
        </div>
      </div>
      {!nested && replies(c.id).length > 0 && (
        <ul>
          {replies(c.id).map((r) => (
            <Item key={r.id} c={r} nested />
          ))}
        </ul>
      )}
    </li>
  );

  return (
    <section id="yorumlar" aria-label="Yorumlar" className="px-4 pb-4">
      <h2 className="font-bold">Yorumlar ({comments.filter((c) => c.moderation_status === "approved").length})</h2>
      {roots.length === 0 && <p className="mt-3 text-sm text-fg-muted">İlk yorumu sen yaz.</p>}
      <ul>{roots.map((c) => <Item key={c.id} c={c} />)}</ul>
      <div className="mt-5 space-y-2">
        {msg && <Alert tone={msg.ok ? "info" : "error"}>{msg.text}</Alert>}
        {viewerId ? (
          <>
            {replyTo && (
              <p className="text-xs text-fg-muted">
                @{replyTo.author?.username} kullanıcısına cevap veriyorsun ·{" "}
                <button type="button" className="font-semibold" onClick={() => setReplyTo(null)}>vazgeç</button>
              </p>
            )}
            <Textarea rows={2} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Saygılı bir yorum yaz…" aria-label="Yorum" />
            <Button onClick={send} disabled={pending || !text.trim()} className="w-full sm:w-auto">Gönder</Button>
          </>
        ) : (
          <p className="text-sm">
            Yorum yapmak için <Link href={`/giris?next=/gonderi/${postId}`} className="font-semibold text-green">giriş yap</Link>.
          </p>
        )}
      </div>
    </section>
  );
}
