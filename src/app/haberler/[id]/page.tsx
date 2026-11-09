import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { getNewsItem } from "@/lib/data/content";
import { getViewer } from "@/lib/auth";
import { Ad } from "@/components/ads/ad";
import { NEWS_CATEGORY_LABEL, VerificationBadge } from "@/components/news/news-card";
import { ReportButton } from "@/components/social/report-button";
import { Alert, Badge, Card } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = await getNewsItem(id);
  return { title: n?.title ?? "Haber", description: n?.summary };
}

export default async function NewsDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [n, viewer] = await Promise.all([getNewsItem(id), getViewer()]);
  if (!n || n.status !== "published") notFound();
  return (
    <article className="mx-auto max-w-3xl">
      <div className="mb-3 flex flex-wrap gap-2">
        <Badge tone={n.category === "son_dakika" ? "live" : "green"}>{NEWS_CATEGORY_LABEL[n.category]}</Badge>
        <VerificationBadge v={n.verification} />
      </div>
      <h1 className="text-2xl font-extrabold leading-tight sm:text-3xl">{n.title}</h1>
      <dl className="mt-3 grid gap-1 text-sm text-fg-muted sm:grid-cols-2">
        <div><dt className="inline font-semibold text-fg">Kaynak: </dt><dd className="inline">{n.source ? n.source.name : "AMEDSPOR editör ekibi"}</dd></div>
        <div><dt className="inline font-semibold text-fg">Kaynakta yayın: </dt><dd className="inline">{formatDateTime(n.source_published_at)}</dd></div>
        <div><dt className="inline font-semibold text-fg">Platformda yayın: </dt><dd className="inline">{formatDateTime(n.published_at)}</dd></div>
      </dl>
      {n.verification === "rumor" && <Alert tone="warning" className="mt-4">Bu bir <b>söylentidir</b> ve kulüp tarafından doğrulanmamıştır. Kesin bilgi olarak değerlendirmeyin.</Alert>}
      {n.image_url && (
        <figure className="mt-5 overflow-hidden rounded-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element -- izinli kaynak görseli */}
          <img src={n.image_url} alt="" className="w-full object-cover" />
          {n.image_credit && <figcaption className="bg-muted px-3 py-1.5 text-xs text-fg-muted">Görsel: {n.image_credit}</figcaption>}
        </figure>
      )}
      {n.summary && <p className="mt-5 text-lg font-medium leading-relaxed">{n.summary}</p>}
      {n.body && <div className="prose-amed mt-4 whitespace-pre-wrap">{n.body}</div>}
      {n.original_url && (
        <Card className="mt-6 flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm">Haberin tamamı kaynağında: <b>{n.source?.name ?? new URL(n.original_url).hostname}</b></p>
          <a href={n.original_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-xl bg-green px-4 py-2 text-sm font-semibold text-white">
            Kaynağa git <ExternalLink className="h-4 w-4" />
          </a>
        </Card>
      )}
      <div className="mt-4 flex justify-end">{viewer && <ReportButton targetType="news" targetId={n.id} label="Hatalı haber bildir" />}</div>
      <div className="mt-6"><Ad placement="news_detail" variant="compact" /></div>
    </article>
  );
}
