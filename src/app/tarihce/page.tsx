import { Landmark } from "lucide-react";
import { getContentPage } from "@/lib/data/content";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Amedspor Tarihi" };

export default async function HistoryPage() {
  const page = await getContentPage("tarihce");
  if (!page)
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Amedspor Tarihi" />
        <EmptyState icon={<Landmark className="h-10 w-10" />} title="Tarihçe hazırlanıyor" description="Kulüp tarihi, doğrulanabilir kaynaklarla birlikte editörlerimiz tarafından derlenip burada yayınlanacak. Kaynaksız bilgi yayınlanmaz." />
      </div>
    );
  return (
    <article className="mx-auto max-w-3xl">
      <PageHeader title={page.title} description={`Son güncelleme: ${formatDate(page.updated_at)}`} />
      <Card className="prose-amed whitespace-pre-wrap p-5">{page.body}</Card>
      {page.sources.length > 0 && (
        <Card className="mt-4 p-5">
          <h2 className="mb-2 font-bold">Kaynaklar</h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm">{page.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer" className="underline">{s.title}</a></li>)}</ol>
        </Card>
      )}
    </article>
  );
}
