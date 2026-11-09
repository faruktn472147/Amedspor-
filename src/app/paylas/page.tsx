import { requireViewer } from "@/lib/auth";
import { Composer } from "@/components/social/composer";
import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Paylaş" };

export default async function CreatePage({ searchParams }: { searchParams: Promise<{ tur?: string }> }) {
  const viewer = await requireViewer("/paylas");
  const { tur } = await searchParams;
  const mode = tur === "short" ? "short" : tur === "poll" ? "poll" : tur === "foto" ? "photo" : "post";
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Yeni paylaşım" description="Yazı, fotoğraf, Shorts videosu veya anket paylaş." />
      <Card className="p-4">
        <Composer userId={viewer.user.id} initialMode={mode} />
      </Card>
    </div>
  );
}
