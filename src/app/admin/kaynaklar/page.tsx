import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { saveSourceAction } from "@/app/actions/admin";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Alert, Badge, Card, EmptyState, Input, Label, SectionHeader, Select } from "@/components/ui";
import type { NewsSource } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Haber kaynakları" };

const KINDS: [string, string][] = [["official_club", "Kulüp resmî sitesi"], ["official_social", "Kulüp resmî sosyal medya"], ["federation", "TFF / federasyon"], ["media", "Spor medyası"], ["journalist", "Gazeteci"], ["aggregator", "Haber toplayıcı"]];

function SourceForm({ s }: { s?: NewsSource }) {
  return (
    <ActionForm action={saveSourceAction}>
      {s && <input type="hidden" name="id" value={s.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label>Ad</Label><Input name="name" defaultValue={s?.name} required /></div>
        <div><Label>Ana sayfa</Label><Input name="homepage_url" type="url" defaultValue={s?.homepage_url} placeholder="https://" required /></div>
        <div><Label>RSS/Atom adresi</Label><Input name="feed_url" type="url" defaultValue={s?.feed_url ?? ""} placeholder="https://.../rss" /></div>
        <div><Label>Anahtar kelimeler (virgülle)</Label><Input name="keywords" defaultValue={s?.keywords.join(", ") ?? "amedspor, amed sportif"} /></div>
        <div><Label>Tür</Label><Select name="kind" defaultValue={s?.kind ?? "media"}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></div>
        <div><Label>Güven seviyesi</Label><Select name="trust_level" defaultValue={s?.trust_level ?? "review"}><option value="official">Resmî</option><option value="trusted">Güvenilir</option><option value="review">İncelemeli</option></Select></div>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" name="is_active" defaultChecked={s?.is_active ?? true} /> Etkin</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="auto_publish" defaultChecked={s?.auto_publish ?? false} /> Otomatik yayın (hassas olmayanlar)</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="republish_allowed" defaultChecked={s?.republish_allowed ?? false} /> Görsel kullanım izni var</label>
      </div>
      <SubmitButton>{s ? "Güncelle" : "Kaynak ekle"}</SubmitButton>
    </ActionForm>
  );
}

export default async function SourcesPage() {
  await requireRole("admin", "/admin/kaynaklar");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return <EmptyState title="Veritabanı yapılandırılmadı" />;
  const { data } = await supabase.from("news_sources").select("*").order("name");
  return (
    <div className="space-y-6">
      <Alert tone="info">Yalnızca kullanım koşulları RSS ile içerik alınmasına izin veren kaynakları ekleyin. Platform yalnızca başlık, kısa özet ve kaynak bağlantısı saklar; tam metin kopyalanmaz.</Alert>
      <Card className="p-5"><SectionHeader title="Yeni kaynak" /><SourceForm /></Card>
      {(data as NewsSource[] | null)?.map((s) => (
        <Card key={s.id} className="p-5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <b>{s.name}</b><Badge tone={s.trust_level === "review" ? "amber" : "green"}>{s.trust_level}</Badge>{!s.is_active && <Badge>pasif</Badge>}
            <span className="text-xs text-fg-muted">Son tarama: {formatDateTime(s.last_fetched_at)}</span>
            {s.last_error && <span className="text-xs text-red">Hata: {s.last_error}</span>}
          </div>
          <SourceForm s={s} />
        </Card>
      ))}
    </div>
  );
}
