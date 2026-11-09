import Link from "next/link";
import { Newspaper } from "lucide-react";
import { getNews } from "@/lib/data/content";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { NEWS_CATEGORY_LABEL, NewsCard } from "@/components/news/news-card";
import { Card, EmptyState, PageHeader, SetupNotice } from "@/components/ui";
import { cn } from "@/lib/utils";

export const metadata = { title: "Haberler" };
const CATS = ["son_dakika", "resmi", "mac", "transfer", "roportaj", "haber"] as const;

export default async function NewsPage({ searchParams }: { searchParams: Promise<{ kategori?: string; once?: string }> }) {
  const sp = await searchParams;
  const cat = CATS.find((c) => c === sp.kategori);
  const cursor = sp.once && !Number.isNaN(Date.parse(sp.once)) ? sp.once : null;
  const items = await getNews({ category: cat, limit: 20, cursor });
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Haber Merkezi" description="Her haberde kaynak, yayın tarihi ve doğrulama durumu gösterilir. Söylentiler açıkça etiketlenir." />
      {!isSupabaseConfigured() && <SetupNotice feature="Haberler" />}
      <nav className="no-scrollbar mb-4 flex gap-2 overflow-x-auto" aria-label="Kategoriler">
        <Link href="/haberler" className={cn("shrink-0 rounded-full px-4 py-2 text-sm font-semibold", !cat ? "bg-fg text-bg" : "bg-muted")}>Tümü</Link>
        {CATS.map((c) => (
          <Link key={c} href={`/haberler?kategori=${c}`} className={cn("shrink-0 rounded-full px-4 py-2 text-sm font-semibold", cat === c ? "bg-fg text-bg" : "bg-muted")}>{NEWS_CATEGORY_LABEL[c]}</Link>
        ))}
      </nav>
      {items.length ? (
        <>
          {!cursor && <div className="mb-4"><NewsCard item={items[0]} variant="hero" /></div>}
          <Card className="p-2">{(cursor ? items : items.slice(1)).map((n) => <NewsCard key={n.id} item={n} />)}</Card>
          {items.length === 20 && items[19].published_at && (
            <div className="mt-4 flex justify-center">
              <Link href={`/haberler?${cat ? `kategori=${cat}&` : ""}once=${encodeURIComponent(items[19].published_at)}`} className="rounded-full border border-border px-5 py-2 text-sm font-semibold hover:bg-muted">Daha eski haberler</Link>
            </div>
          )}
        </>
      ) : (
        <EmptyState icon={<Newspaper className="h-10 w-10" />} title="Bu kategoride yayınlanmış haber yok" description="Haberler güvenilir kaynaklardan geldikçe ve onaylandıkça burada görünür." />
      )}
    </div>
  );
}
