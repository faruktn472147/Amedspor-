import { Download, Landmark, ShieldCheck } from "lucide-react";
import { requireOwnerAal2 } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { addPayoutAction, addRevenueEntryAction, updatePremiumPriceAction } from "@/app/actions/admin";
import { computeFinanceSummary, formatTry, periodStarts, projectionTable, type PeriodTotals } from "@/lib/finance/revenue";
import { loadFinance } from "@/lib/finance/load";
import { paymentConfigFromEnv, resolveProvider } from "@/lib/payments/providers";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Alert, Badge, Card, EmptyState, Input, Label, SectionHeader, Select } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Gelir yönetimi" };
export const dynamic = "force-dynamic";

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return <Card className="p-4"><p className="text-xl font-black tabular-nums">{value}</p><p className="text-xs font-semibold">{label}</p>{note && <p className="mt-0.5 text-[11px] text-fg-muted">{note}</p>}</Card>;
}

function PeriodTable({ rows }: { rows: [string, PeriodTotals][] }) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="text-left text-xs text-fg-muted"><tr>{["Dönem", "Abonelik brüt", "İade", "Komisyon (bildirilen)", "Komisyon (tahmini)", "KDV payı", "Abonelik net (tahmini)", "Reklam (kesin)", "Reklam (tahmini)"].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-border tabular-nums">
          {rows.map(([l, t]) => (
            <tr key={l}><td className="px-3 py-2 font-semibold">{l}</td><td className="px-3 py-2">{formatTry(t.subscriptionGross)}</td><td className="px-3 py-2">{formatTry(t.refunds)}</td><td className="px-3 py-2">{formatTry(t.feesReported)}</td><td className="px-3 py-2 text-fg-muted">{formatTry(t.feesEstimated)}</td><td className="px-3 py-2">{formatTry(t.vat)}</td><td className="px-3 py-2 font-bold">{formatTry(t.subscriptionNetEstimated)}</td><td className="px-3 py-2">{formatTry(t.adRevenue)}</td><td className="px-3 py-2 text-fg-muted">{formatTry(t.adRevenueEstimated)}</td></tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export default async function RevenuePage() {
  await requireOwnerAal2();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return <EmptyState title="Veritabanı yapılandırılmadı" />;
  const f = await loadFinance(supabase);
  const now = new Date();
  const sum = computeFinanceSummary(f.fp, f.fa, f.fo, f.fs, now);
  const month = periodStarts(now).month;
  const subs = f.raw.subs.filter((s) => s.provider !== "test");
  const activeSubs = subs.filter((s) => ["active", "canceled", "renewal_pending"].includes(s.status) && s.current_period_end && new Date(s.current_period_end) > now).length;
  const newSubs = subs.filter((s) => new Date(s.created_at) >= month).length;
  const canceledSubs = subs.filter((s) => s.canceled_at && new Date(s.canceled_at) >= month).length;
  const provider = resolveProvider(paymentConfigFromEnv());
  const live = provider.available && provider.provider.isLive;

  return (
    <div className="space-y-6">
      <Alert tone={live ? "success" : "warning"}>
        <ShieldCheck className="mr-1 inline h-4 w-4" />
        {live ? "Canlı ödeme altyapısı bağlı." : "Gerçek ödeme kuruluşu henüz bağlı değil. Aşağıdaki tutarlar yalnızca gerçek (test olmayan) ödemelerden hesaplanır; test ödemeleri hariç tutulur."}
        {sum.testPaymentsExcluded > 0 && ` (${sum.testPaymentsExcluded} test ödemesi hariç tutuldu.)`}
      </Alert>
      {f.error && <Alert tone="error">Finans verisi okunamadı: {f.error}</Alert>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Aktif Premium abone" value={String(activeSubs)} />
        <Tile label="Bu ay yeni abone" value={String(newSubs)} />
        <Tile label="Bu ay iptal" value={String(canceledSubs)} />
        <Tile label="Aylık abonelik geliri (brüt)" value={formatTry(sum.month.subscriptionGross)} />
        <Tile label="Bugün reklam geliri" value={formatTry(sum.today.adRevenue)} note={`tahmini: ${formatTry(sum.today.adRevenueEstimated)}`} />
        <Tile label="Bu hafta reklam geliri" value={formatTry(sum.week.adRevenue)} note={`tahmini: ${formatTry(sum.week.adRevenueEstimated)}`} />
        <Tile label="Bu ay reklam geliri" value={formatTry(sum.month.adRevenue)} note={`tahmini: ${formatTry(sum.month.adRevenueEstimated)}`} />
        <Tile label="Toplam reklam geliri" value={formatTry(sum.allTime.adRevenue)} />
        <Tile label="Toplam brüt gelir" value={formatTry(sum.allTime.totalGross)} note="abonelik + kesinleşmiş reklam" />
        <Tile label="Tahmini net abonelik geliri" value={formatTry(sum.allTime.subscriptionNetEstimated)} note="komisyon, iade, KDV düşülmüş" />
        <Tile label="Ödeme kuruluşunda bekleyen (tahmini)" value={formatTry(sum.providerBalanceEstimated)} note="kesin bakiye için sağlayıcı paneli" />
        <Tile label="Bankaya aktarılan (gerçek)" value={formatTry(sum.payoutsPaid)} note={`planlanan: ${formatTry(sum.payoutsScheduled)}`} />
      </div>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <SectionHeader title="Dönem raporu" />
          <a href="/api/admin/finance-export" className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-semibold hover:bg-muted"><Download className="h-4 w-4" /> Ödemeleri CSV indir</a>
        </div>
        <PeriodTable rows={[["Bugün", sum.today], ["Bu hafta", sum.week], ["Bu ay", sum.month], ["Toplam", sum.allTime]]} />
        <p className="mt-2 text-xs text-fg-muted">Tahmini komisyon, ödeme kuruluşu komisyonu bildirmediğinde %{f.fs.estimatedFeePercent} + {formatTry(f.fs.estimatedFeeFixed)} varsayımıyla hesaplanır. KDV payı, KDV dahil fiyattan %{f.fs.vatPercent} oranıyla ayrıştırılır. Gelir vergisi/kurumlar vergisi dahil değildir. Kesin vergi hesabı için mali müşavirinize danışın.</p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <SectionHeader title="Premium fiyatı" />
          <ActionForm action={updatePremiumPriceAction}>
            <div><Label htmlFor="price_try">Aylık fiyat (TL, KDV dahil)</Label><Input id="price_try" name="price_try" inputMode="decimal" defaultValue={f.price} required /></div>
            <SubmitButton>Fiyatı güncelle</SubmitButton>
          </ActionForm>
        </Card>
        <Card className="p-5">
          <SectionHeader title="Örnek brüt gelir hesabı" />
          <table className="w-full text-sm tabular-nums">
            <thead className="text-left text-xs text-fg-muted"><tr><th className="py-1">Premium abone</th><th>Aylık brüt</th><th>Tahmini net*</th></tr></thead>
            <tbody>{projectionTable(f.price, undefined, f.fs).map((r) => <tr key={r.subscribers} className="border-t border-border"><td className="py-1.5">{r.subscribers.toLocaleString("tr-TR")}</td><td>{formatTry(r.gross)}</td><td className="text-fg-muted">{formatTry(r.estimatedNet ?? 0)}</td></tr>)}</tbody>
          </table>
          <p className="mt-2 text-xs text-fg-muted">Brüt rakamlar vergi, komisyon ve iadeler ÖNCESİDİR. *Tahmini net yalnızca varsayılan komisyon ve KDV düşülerek bulunur; gelir vergisi ve iadeler hariçtir.</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <SectionHeader title="Reklam geliri kaydı (sağlayıcı raporundan)" />
          <ActionForm action={addRevenueEntryAction} resetOnSuccess>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>Sağlayıcı</Label><Select name="provider"><option value="adsense">Google AdSense</option><option value="admob">Google AdMob</option><option value="direct">Doğrudan sponsor</option></Select></div>
              <div><Label>Durum</Label><Select name="revenue_status"><option value="estimated">Tahmini (sağlayıcı tahmini)</option><option value="finalized">Kesinleşti</option><option value="received">Tahsil edildi</option></Select></div>
              <div><Label>Dönem başı</Label><Input name="period_start" type="date" required /></div>
              <div><Label>Dönem sonu</Label><Input name="period_end" type="date" required /></div>
              <div><Label>Tutar (TL)</Label><Input name="amount" inputMode="decimal" required /></div>
              <div><Label>Kaynak</Label><Select name="source"><option value="provider_report">Sağlayıcı raporu</option><option value="provider_api">Sağlayıcı API</option><option value="contract">Sponsor sözleşmesi</option></Select></div>
              <div><Label>Gösterim</Label><Input name="impressions" type="number" min={0} /></div>
              <div><Label>Tıklama</Label><Input name="clicks" type="number" min={0} /></div>
            </div>
            <div><Label>Not</Label><Input name="notes" /></div>
            <SubmitButton>Kaydet</SubmitButton>
          </ActionForm>
        </Card>
        <Card className="p-5">
          <SectionHeader title="Bankaya aktarım kaydı" icon={<Landmark className="h-5 w-5 text-green" />} />
          <ActionForm action={addPayoutAction} resetOnSuccess>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>Ödeme kuruluşu</Label><Input name="provider" defaultValue="iyzico" required /></div>
              <div><Label>Durum</Label><Select name="status"><option value="scheduled">Planlandı</option><option value="paid">Bankaya aktarıldı</option><option value="failed">Başarısız</option></Select></div>
              <div><Label>Tutar (TL)</Label><Input name="amount" inputMode="decimal" required /></div>
              <div><Label>Referans no (aktarıldıysa zorunlu)</Label><Input name="provider_ref" /></div>
              <div><Label>Beklenen tarih</Label><Input name="expected_date" type="date" /></div>
              <div><Label>Aktarım tarihi</Label><Input name="paid_at" type="date" /></div>
            </div>
            <div><Label>Not</Label><Input name="notes" /></div>
            <p className="text-xs text-fg-muted">Yalnızca ödeme kuruluşu panelinde/raporunda görünen gerçek aktarımları girin. IBAN bilgisi burada tutulmaz.</p>
            <SubmitButton>Kaydet</SubmitButton>
          </ActionForm>
        </Card>
      </div>

      <section>
        <SectionHeader title="Son ödeme bildirimleri (webhook)" />
        {f.raw.events.length ? (
          <Card className="divide-y divide-border text-sm">
            {f.raw.events.map((e) => (
              <div key={`${e.provider}-${e.event_id}`} className="flex flex-wrap items-center gap-2 px-4 py-2">
                <span className="text-xs text-fg-muted">{formatDateTime(e.created_at)}</span>
                <Badge tone={e.signature_valid ? "green" : "red"}>{e.signature_valid ? "imza geçerli" : "imza GEÇERSİZ"}</Badge>
                <span className="font-semibold">{e.event_type}</span><span className="text-fg-muted">{e.provider}</span><span className="ml-auto text-xs">{e.result}</span>
              </div>
            ))}
          </Card>
        ) : <EmptyState title="Henüz ödeme bildirimi yok" />}
      </section>
    </div>
  );
}
