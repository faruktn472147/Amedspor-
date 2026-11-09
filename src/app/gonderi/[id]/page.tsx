import { notFound } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { getComments, getPost } from "@/lib/data/social";
import { PostCard } from "@/components/social/post-card";
import { CommentSection } from "@/components/social/comments";
import { Card } from "@/components/ui";

export const metadata = { title: "Gönderi" };

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [post, viewer] = await Promise.all([getPost(id), getViewer()]);
  if (!post) notFound();
  const comments = await getComments(post.id);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PostCard post={post} viewerId={viewer?.user.id ?? null} dataSaver={viewer?.profile?.data_saver ?? false} />
      <Card className="pt-4">
        <CommentSection postId={post.id} comments={comments} viewerId={viewer?.user.id ?? null} postAuthorId={post.author_id} />
      </Card>
    </div>
  );
}
