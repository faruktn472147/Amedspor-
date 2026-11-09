import { notFound } from "next/navigation";
import { LEGAL } from "@/lib/legal-content";
import { Alert, Card, PageHeader } from "@/components/ui";

export function generateStaticParams() {
  return Object.keys(LEGAL).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: LEGAL[slug]?.title ?? "Yasal" };
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = LEGAL[slug];
  if (!doc) notFound();
  return (
    <article className="mx-auto max-w-3xl">
      <PageHeader title={doc.title} description={`Son güncelleme: ${doc.updated}`} />
      <Alert tone="warning" className="mb-4">
        Bu metin bir taslaktır ve kesin hukuki görüş niteliği taşımaz. Yayına geçmeden önce bir hukuk uzmanı tarafından kontrol edilmelidir.
      </Alert>
      <Card className="prose-amed p-5">
        {doc.sections.map((s) => (
          <section key={s.h}>
            <h2>{s.h}</h2>
            {s.p.length > 1 ? <ul>{s.p.map((t) => <li key={t}>{t}</li>)}</ul> : <p>{s.p[0]}</p>}
          </section>
        ))}
      </Card>
    </article>
  );
}
