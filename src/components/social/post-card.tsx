import Link from "next/link";
import { Clock3 } from "lucide-react";
import type { Post } from "@/lib/types";
import { timeAgo } from "@/lib/utils";
import { Avatar, Badge, Card } from "@/components/ui";
import { MediaCarousel } from "./media-carousel";
import { Poll } from "./poll";
import { PostActions, PostMenu } from "./post-actions";

export function PostCard({ post, viewerId, dataSaver = false }: { post: Post; viewerId: string | null; dataSaver?: boolean }) {
  const author = post.author;
  const name = author?.display_name || author?.username || "Silinmiş kullanıcı";
  return (
    <Card className="animate-in overflow-hidden">
      <div className="flex items-center gap-3 px-4 pt-3 pb-2">
        <Link href={author ? `/u/${author.username}` : "#"} className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar src={author?.avatar_url} name={name} size={40} />
          <span className="min-w-0">
            <span className="block truncate font-semibold">{name}</span>
            <span className="block truncate text-xs text-fg-muted">
              @{author?.username} · <time dateTime={post.created_at}>{timeAgo(post.created_at)}</time>
              {post.edited_at && " · düzenlendi"}
            </span>
          </span>
        </Link>
        {post.kind === "short" && <Badge tone="red">Shorts</Badge>}
        <PostMenu postId={post.id} isOwner={viewerId === post.author_id} body={post.body} signedIn={!!viewerId} />
      </div>
      {post.moderation_status !== "approved" && viewerId === post.author_id && (
        <p className="mx-4 mb-2 flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          <Clock3 className="h-4 w-4" />
          {post.moderation_status === "pending" ? "İncelemede — yalnızca sen görüyorsun." : "Bu gönderi yayından kaldırıldı."}
          {post.moderation_reason && ` (${post.moderation_reason})`}
        </p>
      )}
      {post.body && (
        <Link href={`/gonderi/${post.id}`} className="block whitespace-pre-wrap break-words px-4 pb-3 text-[15px] leading-relaxed">
          {post.body}
        </Link>
      )}
      {post.kind === "poll" && <Poll postId={post.id} options={post.poll_options} myVote={post.my_vote ?? null} signedIn={!!viewerId} />}
      <MediaCarousel media={post.media} dataSaver={dataSaver} />
      <PostActions
        postId={post.id}
        likeCount={post.like_count}
        commentCount={post.comment_count}
        liked={!!post.liked_by_me}
        bookmarked={!!post.bookmarked_by_me}
        signedIn={!!viewerId}
      />
    </Card>
  );
}
