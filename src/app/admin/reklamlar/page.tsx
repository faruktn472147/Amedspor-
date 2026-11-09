import { requireOwnerAal2 } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { saveCampaignAction, toggleCampaignAction, updateAdSettingsAction } from "@/app/actions/admin";
import { sanitizeAdSettings } from "@/lib/ads/frequency";
import { ActionButton } from "@/components/admin/action-button";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Alert, Badge, Card, EmptyState, Input, Label, SectionHeader, Select } from "@/components/ui";
import type { AdCampaign, AdPlacement } from "@/lib/types";
import { daysAgoIso, formatDate } from "@/lib/utils";

export const metadata = { title: "Reklam yönetimi" };

export default async function AdsAdminPage() {
  await requireOwnerAal2();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return <EmptyState title="Veritabanı yapılandırılmadı" />;
  const since = daysAgoIso(30).slice(0, 10);
  const [settings, placements, campaigns, stats] = await Promise.all([
    supabase.from("app_settings").select("value").eq("key", "ads").single(),
    supabase.from("ad_placements").select("*").order("code"),
    supabase.from("ad_campaigns").select("*").order("created_at", { ascending: false }),
    supabase.from("ad_daily_stats").select("campaign_id, impressions, clicks").gte("day", since),
  ]);
  const s = sanitizeAdSettings(settings.data?.value);
  const totals = new Map<string, { i: number; c: number }>();
  for (const r of stats.data ?? []) {
    const t = totals.get(r.campaign_id) ?? { i: 0, c: 0 };
    t.i += r.impressions;
    t.c += r.clicks;
    totals.set(r.campaign_id, t);
  }
  const adsenseClient = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
  return (
    <div className="space-y-6">
      <Alert tone={adsenseClient ? "success" : "warning"}>
        Google AdSense: {adsenseClient ? <>bağlı (<code>{adsenseClient}</code>). Gelir verileri AdSense panelinden alınır.</> : "bağlı değil. AdSense onayı alındığında NEXT_PUBLIC_ADSENSE_CLIENT değişkenini ekleyin. O zamana kadar yalnızca doğrudan sponsor kampanyaları gösterilir."}
      </Alert>
      <Card className="p-5">
        <SectionHeader title="Reklam sıklığı ve yerleşimler" />
        <ActionForm action={updateAdSettingsAction}>
          <label className="flex items-center gap-2 font-semibold"><input type="checkbox" name="enabled" defaultChecked={s.enabled} /> Reklamlar açık (ücretsiz üyeler için)</label>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><Label>İlk reklamdan önceki içerik sayısı (min 3)</Label><Input name="feed_first_after" type="number" min={3} max={50} defaultValue={s.feed_first_after} /></div>
            <div><Label>Akışta kaç içerikte bir (min 5)</Label><Input name="feed_every" type="number" min={5} max={100} defaultValue={s.feed_every} /></div>
            <div><Label>Shorts&apos;ta kaç videoda bir (min 8)</Label><Input name="shorts_every" type="number" min={8} max={200} defaultValue={s.shorts_every} /></div>
            <div><Label>Sayfa başına en fazla reklam (0-5)</Label><Input name="max_per_page" type="number" min={0} max={5} defaultValue={s.max_per_page} /></div>
            <div><Label>Aynı reklam kişi başı günlük üst sınır</Label><Input name="per_campaign_daily_cap" type="number" min={1} max={20} defaultValue={s.per_campaign_daily_cap} /></div>
          </div>
          <div className="divide-y divide-border rounded-xl border border-border">
            {((placements.data ?? []) as AdPlacement[]).map((p) => (
              <div key={p.code} className="grid items-center gap-2 p-3 sm:grid-cols-4">
                <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2"><input type="checkbox" name={`enabled_${p.code}`} defaultChecked={p.enabled} /> {p.name}</label>
                <Select name={`provider_${p.code}`} defaultValue={p.provider} aria-label="Sağlayıcı"><option value="direct">Yalnızca sponsor</option><option value="direct_then_adsense">Sponsor, yoksa AdSense</option><option value="adsense">Yalnızca AdSense</option></Select>
                <Input name={`slot_${p.code}`} defaultValue={p.adsense_slot_id ?? ""} placeholder="AdSense slot no" aria-label="AdSense slot" />
              </div>
            ))}
          </div>
          <SubmitButton>Kaydet</SubmitButton>
        </ActionForm>
      </Card>

      <Card className="p-5">
        <SectionHeader title="Yeni sponsor kampanyası" />
        <ActionForm action={saveCampaignAction} resetOnSuccess>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Kampanya adı</Label><Input name="name" required /></div>
            <div><Label>Reklam veren (görünür)</Label><Input name="advertiser_name" required /></div>
            <div><Label>Başlık</Label><Input name="title" maxLength={90} required /></div>
            <div><Label>Kısa metin</Label><Input name="body" maxLength={200} /></div>
            <div><Label>Hedef bağlantı</Label><Input name="target_url" type="url" placeholder="https://" required /></div>
            <div><Label>Görsel (https)</Label><Input name="image_url" type="url" /></div>
            <div><Label>Buton metni</Label><Input name="cta_label" maxLength={24} defaultValue="İncele" /></div>
            <div><Label>Öncelik</Label><Input name="priority" type="number" defaultValue={0} /></div>
            <div><Label>Başlangıç</Label><Input name="starts_at" type="date" required /></div>
            <div><Label>Bitiş</Label><Input name="ends_at" type="date" required /></div>
            <div><Label>Sözleşme tutarı (TL, isteğe bağlı)</Label><Input name="contract_amount" inputMode="decimal" /></div>
          </div>
          <fieldset className="flex flex-wrap gap-3 text-sm"><legend className="mb-1 font-semibold">Yerleşimler</legend>
            {((placements.data ?? []) as AdPlacement[]).map((p) => <label key={p.code} className="flex items-center gap-1.5"><input type="checkbox" name="placement_codes" value={p.code} /> {p.name}</label>)}
          </fieldset>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_active" defaultChecked /> Aktif</label>
          <SubmitButton>Kampanyayı kaydet</SubmitButton>
        </ActionForm>
      </Card>

      <section>
        <SectionHeader title="Kampanyalar (son 30 gün gerçek sayımlar)" />
        {(campaigns.data ?? []).length ? (
          <Card className="divide-y divide-border">
            {((campaigns.data ?? []) as AdCampaign[]).map((c) => {
              const t = totals.get(c.id) ?? { i: 0, c: 0 };
              return (
                <div key={c.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                  <span className="min-w-0 flex-1"><b>{c.name}</b> · {c.advertiser_name} {c.is_active ? <Badge tone="green">aktif</Badge> : <Badge>pasif</Badge>}<span className="block text-xs text-fg-muted">{formatDate(c.starts_at)} – {formatDate(c.ends_at)} · {c.placement_codes.join(", ")}</span></span>
                  <span className="tabular-nums">{t.i} gösterim · {t.c} tıklama · TO %{t.i ? ((t.c / t.i) * 100).toFixed(1) : "0"}</span>
                  <ActionButton action={toggleCampaignAction.bind(null, c.id, !c.is_active)}>{c.is_active ? "Durdur" : "Başlat"}</ActionButton>
                </div>
              );
            })}
          </Card>
        ) : <EmptyState title="Henüz sponsor kampanyası yok" />}
      </section>
    </div>
  );
}
