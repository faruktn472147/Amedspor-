import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { runIngestNowAction, saveNewsAction, setNewsStatusAction } from "@/app/actions/admin";
import { ActionButton } from "@/components/admin/action-button";
import { ActionForm, SubmitButton } from "@/components/forms";
import { NEWS_CATEGORY_LABEL, VerificationBadge } from "@/components/news/news-card";
import { Badge, Card, EmptyState, Input, Label, SectionHeader, Select, Textarea } from "@/components/ui";
import type { NewsItem } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Haber yönetimi" };

export default async function AdminNewsPage() {
  const v = await requireRole("editor", "/admin/haberler");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return <EmptyState title="Veritabanı yapılandırılmadı" />;
  const [pending, published, sources] = await Promise.all([
    supabase.from("news").select("*, source:news_sources(id, name, homepage_url, kind)").eq("status", "pending").order("created_at", { ascending: false }).limit(50),
    supabase.from("news").select("*, source:news_sources(id, name, homepage_url, kind)").eq("status", "published").order("published_at", { ascending: false }).limit(30),
    supabase.from("news_sources").select("id, name").order("name"),
  ]);
  const Row = ({ n, actions }: { n: NewsItem; actions: React.ReactNode }) => (
    <div className="flex flex-wrap items-start gap-3 p-4">
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap gap-1.5"><Badge>{NEWS_CATEGORY_LABEL[n.category]}</Badge><VerificationBadge v={n.verification} />{n.is_sensitive && <Badge tone="red">Hassas</Badge>}</div>
        <p className="font-semibold">{n.title}</p>
        <p className="text-xs text-fg-muted">{n.source?.name ?? "Editör"} · kaynakta: {formatDateTime(n.source_published_at)} {n.original_url && <a href={n.original_url} target="_blank" rel="noopener noreferrer" className="underline">kaynağı aç</a>}</p>
        {n.summary && <p className="mt-1 line-clamp-2 text-sm text-fg-muted">{n.summary}</p>}
      </div>
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  );
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-fg-muted">Otomatik tarama günde bir kez çalışır. Hassas/söylenti içerikler buraya onaya düşer.</p>
        {v.roles.some((r) => r === "admin" || r === "owner") && <ActionButton variant="outline" action={runIngestNowAction}>Kaynakları şimdi tara</ActionButton>}
      </div>
      <section>
        <SectionHeader title={`Onay bekleyenler (${pending.data?.length ?? 0})`} />
        {pending.data?.length ? (
          <Card className="divide-y divide-border">
            {(pending.data as unknown as NewsItem[]).map((n) => (
              <Row key={n.id} n={n} actions={<>
                <ActionButton variant="primary" action={setNewsStatusAction.bind(null, n.id, "published")}>Yayınla</ActionButton>
                <ActionButton variant="danger" action={setNewsStatusAction.bind(null, n.id, "rejected")}>Reddet</ActionButton>
              </>} />
            ))}
          </Card>
        ) : <EmptyState title="Onay bekleyen haber yok" />}
      </section>
      <section>
        <SectionHeader title="Yeni haber / editör yazısı" />
        <Card className="p-5">
          <ActionForm action={saveNewsAction} resetOnSuccess>
            <div><Label htmlFor="title">Başlık</Label><Input id="title" name="title" minLength={5} maxLength={300} required /></div>
            <div><Label htmlFor="summary">Özet (kaynaktan kopyalamadan, kendi cümlelerinle)</Label><Textarea id="summary" name="summary" rows={2} maxLength={1200} /></div>
            <div><Label htmlFor="body">Metin (editör yazısı ise)</Label><Textarea id="body" name="body" rows={5} /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label htmlFor="source_id">Kaynak</Label><Select id="source_id" name="source_id"><option value="">Editör yazısı / kaynak yok</option>{(sources.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></div>
              <div><Label htmlFor="original_url">Kaynak bağlantısı</Label><Input id="original_url" name="original_url" type="url" placeholder="https://" /></div>
              <div><Label htmlFor="category">Kategori</Label><Select id="category" name="category">{Object.entries(NEWS_CATEGORY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></div>
              <div><Label htmlFor="verification">Doğrulama</Label><Select id="verification" name="verification"><option value="unverified">Doğrulanmadı</option><option value="verified">Güvenilir kaynak</option><option value="official">Resmî kaynak</option><option value="rumor">Söylenti</option></Select></div>
              <div><Label htmlFor="image_url">Görsel (izinli)</Label><Input id="image_url" name="image_url" type="url" placeholder="https://" /></div>
              <div><Label htmlFor="image_credit">Görsel telif/izin bilgisi</Label><Input id="image_credit" name="image_credit" /></div>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="publish" className="h-4 w-4" /> Hemen yayınla</label>
            <SubmitButton>Kaydet</SubmitButton>
          </ActionForm>
        </Card>
      </section>
      <section>
        <SectionHeader title="Yayındakiler" />
        {published.data?.length ? (
          <Card className="divide-y divide-border">
            {(published.data as unknown as NewsItem[]).map((n) => <Row key={n.id} n={n} actions={<ActionButton variant="danger" action={setNewsStatusAction.bind(null, n.id, "removed")} confirmText="Haber yayından kaldırılsın mı?">Kaldır</ActionButton>} />)}
          </Card>
        ) : <EmptyState title="Yayında haber yok" />}
      </section>
    </div>
  );
}
