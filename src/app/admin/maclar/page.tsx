import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { addMatchEventAction, saveMatchAction, saveTeamAction, settleMatchAction } from "@/app/actions/admin";
import { ActionButton } from "@/components/admin/action-button";
import { ActionForm, SubmitButton } from "@/components/forms";
import { MATCH_STATUS_LABEL } from "@/components/football/match-card";
import { Alert, Card, EmptyState, Input, Label, SectionHeader, Select, Textarea } from "@/components/ui";
import type { Match } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Maç yönetimi" };

const toLocal = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 3 * 3600 * 1000);
  return d.toISOString().slice(0, 16);
};

export default async function AdminMatchesPage({ searchParams }: { searchParams: Promise<{ duzenle?: string }> }) {
  await requireRole("editor", "/admin/maclar");
  const { duzenle } = await searchParams;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return <EmptyState title="Veritabanı yapılandırılmadı" />;
  const [teams, matches, players] = await Promise.all([
    supabase.from("teams").select("id, name, is_amedspor").order("name"),
    supabase.from("matches").select("*, home:teams!matches_home_team_id_fkey(id, name, short_name, is_amedspor, logo_url), away:teams!matches_away_team_id_fkey(id, name, short_name, is_amedspor, logo_url)").order("kickoff_at", { ascending: false }).limit(40),
    supabase.from("players").select("id, full_name").eq("is_active", true).order("full_name"),
  ]);
  const list = (matches.data ?? []) as unknown as Match[];
  const edit = list.find((m) => m.id === duzenle);
  const teamSelect = (name: string, value?: string) => (
    <Select name={name} defaultValue={value} required><option value="">Seç</option>{(teams.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
  );
  return (
    <div className="space-y-8">
      <Alert tone="info">Skor ve maç verilerini yalnızca doğrulanabilir kaynaklardan (TFF, kulüp resmî açıklaması, güvenilir canlı skor) girin ve kaynağı belirtin. Ücretsiz ve izinli bir canlı veri API&apos;si bağlanana kadar veriler editör tarafından girilir.</Alert>
      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <SectionHeader title="Takım ekle" />
          <ActionForm action={saveTeamAction} resetOnSuccess>
            <div><Label>Takım adı</Label><Input name="name" required /></div>
            <div><Label>Kısa ad</Label><Input name="short_name" maxLength={10} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_amedspor" /> Bu takım Amedspor</label>
            <SubmitButton>Ekle</SubmitButton>
          </ActionForm>
        </Card>
        <Card className="p-5 lg:col-span-2">
          <SectionHeader title={edit ? "Maçı düzenle" : "Yeni maç"} />
          <ActionForm action={saveMatchAction}>
            {edit && <input type="hidden" name="id" value={edit.id} />}
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>Turnuva</Label><Input name="competition" defaultValue={edit?.competition} placeholder="Trendyol Süper Lig" required /></div>
              <div><Label>Sezon</Label><Input name="season" defaultValue={edit?.season ?? "2026-27"} pattern="\d{4}-\d{2,4}" required /></div>
              <div><Label>Ev sahibi</Label>{teamSelect("home_team_id", edit?.home?.id)}</div>
              <div><Label>Deplasman</Label>{teamSelect("away_team_id", edit?.away?.id)}</div>
              <div><Label>Başlama (TSİ)</Label><Input name="kickoff_at" type="datetime-local" defaultValue={edit ? toLocal(edit.kickoff_at) : undefined} required /></div>
              <div><Label>Stadyum</Label><Input name="venue" defaultValue={edit?.venue ?? ""} /></div>
              <div><Label>Durum</Label><Select name="status" defaultValue={edit?.status ?? "scheduled"}>{Object.entries(MATCH_STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></div>
              <div><Label>Dakika</Label><Input name="minute" type="number" min={0} max={130} defaultValue={edit?.minute ?? ""} /></div>
              <div><Label>Ev skoru</Label><Input name="home_score" type="number" min={0} defaultValue={edit?.home_score ?? ""} /></div>
              <div><Label>Deplasman skoru</Label><Input name="away_score" type="number" min={0} defaultValue={edit?.away_score ?? ""} /></div>
              <div><Label>Veri kaynağı</Label><Input name="source_name" defaultValue={edit?.source_name ?? ""} placeholder="TFF" /></div>
              <div><Label>Kaynak bağlantısı</Label><Input name="source_url" type="url" defaultValue={edit?.source_url ?? ""} /></div>
            </div>
            <div><Label>İstatistikler (JSON)</Label><Textarea name="stats" rows={2} defaultValue={edit && Object.keys(edit.stats ?? {}).length ? JSON.stringify(edit.stats) : ""} placeholder='{"Topla oynama (%)": [55, 45], "Şut": [12, 7]}' /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="verified" defaultChecked={edit?.verified} /> Veriler kaynaktan doğrulandı</label>
            <SubmitButton>{edit ? "Güncelle" : "Maçı ekle"}</SubmitButton>
          </ActionForm>
        </Card>
      </section>

      {edit && (
        <Card className="p-5">
          <SectionHeader title="Maç olayı ekle" />
          <ActionForm action={addMatchEventAction} resetOnSuccess>
            <input type="hidden" name="match_id" value={edit.id} />
            <div className="grid gap-3 sm:grid-cols-3">
              <div><Label>Olay</Label><Select name="type">{[["goal", "Gol"], ["penalty_goal", "Penaltı golü"], ["own_goal", "Kendi kalesine"], ["penalty_miss", "Kaçan penaltı"], ["yellow", "Sarı kart"], ["second_yellow", "İkinci sarı"], ["red", "Kırmızı kart"], ["substitution", "Değişiklik"], ["var", "VAR"], ["note", "Not"]].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></div>
              <div><Label>Takım</Label><Select name="team_id"><option value={edit.home?.id}>{edit.home?.name}</option><option value={edit.away?.id}>{edit.away?.name}</option></Select></div>
              <div><Label>Dakika (+uzatma)</Label><div className="flex gap-2"><Input name="minute" type="number" min={0} max={130} required /><Input name="extra_minute" type="number" min={0} max={30} placeholder="+" /></div></div>
              <div><Label>Oyuncu (Amedspor)</Label><Select name="player_id"><option value="">—</option>{(players.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</Select></div>
              <div><Label>Oyuncu adı (gösterim)</Label><Input name="player_name" /></div>
              <div><Label>Detay</Label><Input name="detail" placeholder="Asist: ..." /></div>
            </div>
            <SubmitButton>Olay ekle</SubmitButton>
          </ActionForm>
        </Card>
      )}

      <section>
        <SectionHeader title="Maçlar" />
        {list.length ? (
          <Card className="divide-y divide-border">
            {list.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                <span className="min-w-0 flex-1"><b>{m.home?.name} {m.home_score ?? ""} – {m.away_score ?? ""} {m.away?.name}</b><span className="block text-xs text-fg-muted">{formatDateTime(m.kickoff_at)} · {MATCH_STATUS_LABEL[m.status]} {m.predictions_settled_at && "· tahminler puanlandı"}</span></span>
                <a href={`/admin/maclar?duzenle=${m.id}`} className="rounded-lg bg-muted px-3 py-1.5 font-semibold">Düzenle / olay ekle</a>
                {m.status === "finished" && !m.predictions_settled_at && (
                  <ActionButton variant="primary" action={settleMatchAction.bind(null, m.id, null)} confirmText="Skor kesin mi? Tahminler bir kez puanlanır.">Tahminleri puanla</ActionButton>
                )}
              </div>
            ))}
          </Card>
        ) : <EmptyState title="Henüz maç yok" />}
      </section>
    </div>
  );
}
