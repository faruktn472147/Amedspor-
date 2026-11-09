import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { savePlayerAction, savePlayerStatAction } from "@/app/actions/admin";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Alert, Card, EmptyState, Input, Label, SectionHeader, Select, Textarea } from "@/components/ui";
import type { Player } from "@/lib/types";

export const metadata = { title: "Oyuncu yönetimi" };

export default async function AdminPlayersPage({ searchParams }: { searchParams: Promise<{ duzenle?: string }> }) {
  await requireRole("editor", "/admin/oyuncular");
  const { duzenle } = await searchParams;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return <EmptyState title="Veritabanı yapılandırılmadı" />;
  const [players, teams] = await Promise.all([
    supabase.from("players").select("*").order("shirt_number", { nullsFirst: false }),
    supabase.from("teams").select("id, name, is_amedspor").order("is_amedspor", { ascending: false }),
  ]);
  const list = (players.data ?? []) as (Player & { team_id: string | null })[];
  const p = list.find((x) => x.id === duzenle);
  return (
    <div className="space-y-6">
      <Alert tone="info">Oyuncu fotoğraflarını yalnızca kullanım izni olan kaynaklardan ekleyin ve telif bilgisini yazın. İstatistikleri kaynak belirtmeden kaydetmek mümkün değildir.</Alert>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <SectionHeader title={p ? `Düzenle: ${p.full_name}` : "Yeni oyuncu"} />
          <ActionForm action={savePlayerAction}>
            {p && <input type="hidden" name="id" value={p.id} />}
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>Ad soyad</Label><Input name="full_name" defaultValue={p?.full_name} required /></div>
              <div><Label>URL adı</Label><Input name="slug" defaultValue={p?.slug} pattern="[a-z0-9-]{2,80}" placeholder="ad-soyad" required /></div>
              <div><Label>Takım</Label><Select name="team_id" defaultValue={p?.team_id ?? ""}><option value="">—</option>{(teams.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></div>
              <div><Label>Forma no</Label><Input name="shirt_number" type="number" min={1} max={99} defaultValue={p?.shirt_number ?? ""} /></div>
              <div><Label>Mevki</Label><Select name="position" defaultValue={p?.position ?? ""}><option value="">—</option>{["Kaleci", "Defans", "Orta Saha", "Forvet"].map((x) => <option key={x}>{x}</option>)}</Select></div>
              <div><Label>Uyruk</Label><Input name="nationality" defaultValue={p?.nationality ?? ""} /></div>
              <div><Label>Doğum tarihi</Label><Input name="birth_date" type="date" defaultValue={p?.birth_date ?? ""} /></div>
              <div><Label>Fotoğraf URL (izinli)</Label><Input name="photo_url" type="url" defaultValue={p?.photo_url ?? ""} /></div>
              <div><Label>Fotoğraf telif/izin</Label><Input name="photo_credit" defaultValue={p?.photo_credit ?? ""} /></div>
              <div><Label>Bilgi kaynağı</Label><Input name="source_name" defaultValue={p?.source_name ?? ""} /></div>
              <div className="sm:col-span-2"><Label>Kaynak bağlantısı</Label><Input name="source_url" type="url" defaultValue={p?.source_url ?? ""} /></div>
            </div>
            <div><Label>Biyografi</Label><Textarea name="bio" rows={3} defaultValue={p?.bio} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_active" defaultChecked={p?.is_active ?? true} /> Kadroda</label>
            <SubmitButton>{p ? "Güncelle" : "Ekle"}</SubmitButton>
          </ActionForm>
        </Card>
        <Card className="p-5">
          <SectionHeader title="Sezon istatistiği gir / güncelle" />
          <ActionForm action={savePlayerStatAction}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2"><Label>Oyuncu</Label><Select name="player_id" defaultValue={p?.id} required><option value="">Seç</option>{list.map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}</Select></div>
              <div><Label>Sezon</Label><Input name="season" defaultValue="2026-27" required /></div>
              <div><Label>Turnuva</Label><Input name="competition" required /></div>
              {[["appearances", "Maç"], ["minutes", "Dakika"], ["goals", "Gol"], ["assists", "Asist"], ["yellow_cards", "Sarı"], ["red_cards", "Kırmızı"]].map(([k, l]) => <div key={k}><Label>{l}</Label><Input name={k} type="number" min={0} defaultValue={0} /></div>)}
              <div><Label>Kaynak (zorunlu)</Label><Input name="source_name" required /></div>
              <div><Label>Kaynak bağlantısı</Label><Input name="source_url" type="url" /></div>
            </div>
            <SubmitButton>Kaydet</SubmitButton>
          </ActionForm>
        </Card>
      </div>
      <Card className="divide-y divide-border">
        {list.map((x) => <a key={x.id} href={`/admin/oyuncular?duzenle=${x.id}`} className="flex justify-between px-4 py-2.5 text-sm hover:bg-muted"><span><b className="mr-2 tabular-nums">{x.shirt_number ?? "—"}</b>{x.full_name}</span><span className="text-fg-muted">{x.position}</span></a>)}
        {!list.length && <p className="p-4 text-sm text-fg-muted">Henüz oyuncu yok.</p>}
      </Card>
    </div>
  );
}
