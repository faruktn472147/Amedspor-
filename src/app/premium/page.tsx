import Link from "next/link";
import { Ban, Check, Crown, ShieldCheck } from "lucide-react";
import { getViewer } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicSettings } from "@/lib/data/content";
import { paymentConfigFromEnv, resolveProvider } from "@/lib/payments/providers";
import { SUBSCRIPTION_STATUS_LABEL, type SubscriptionStatus } from "@/lib/payments/types";
import { BuyButton, CancelButton } from "@/components/premium/premium-buttons";
import { Alert, Badge, Card, LinkButton } from "@/components/ui";
import { formatTry } from "@/lib/finance/revenue";
import { formatDate, formatDateTime } from "@/lib/utils";

export const metadata = { title: "Premium" };
export const dynamic = "force-dynamic";

const PAYMENT_STATUS: Record<string, string> = { pending: "Bekliyor", succeeded: "Başarılı", failed: "Başarısız", refunded: "İade edildi", canceled: "İptal" };

export default async function PremiumPage({ searchParams }: { searchParams: Promise<{ durum?: string }> }) {
  const sp = await searchParams;
  const [viewer, { premium }] = await Promise.all([getViewer(), getPublicSettings()]);
  const availability = resolveProvider(paymentConfigFromEnv());
  const supabase = await createSupabaseServerClient();
  type Sub = { status: SubscriptionStatus; current_period_end: string | null; cancel_at_period_end: boolean; price_amount: number; provider: string };
  type Pay = { id: string; kind: string; status: string; amount_gross: number; paid_at: string | null; created_at: string; is_test: boolean };
  let sub: Sub | null = null;
  let payments: Pay[] = [];
  if (viewer && supabase) {
    const [s, p] = await Promise.all([
      supabase.from("subscriptions").select("status, current_period_end, cancel_at_period_end, price_amount, provider").eq("user_id", viewer.user.id).maybeSingle(),
      supabase.from("payments").select("id, kind, status, amount_gross, paid_at, created_at, is_test").eq("user_id", viewer.user.id).order("created_at", { ascending: false }).limit(24),
    ]);
    sub = (s.data as Sub | null) ?? null;
    payments = (p.data ?? []) as Pay[];
  }
  const active = viewer?.isPremium ?? false;
  const price = Number(premium.price_try);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {sp.durum === "basarili" && <Alert tone="success">Ödemen doğrulandı. Premium aktif — artık reklam görmeyeceksin.</Alert>}
      {sp.durum === "basarisiz" && <Alert tone="error">Ödeme başarısız oldu; Premium etkinleştirilmedi. Kartından ücret çekilmediyse tekrar deneyebilirsin.</Alert>}

      <Card className="relative overflow-hidden p-6">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-amber-400/20 blur-2xl" aria-hidden />
        <Badge tone="amber"><Crown className="h-3 w-3" /> AMEDSPOR Premium</Badge>
        <h1 className="mt-3 text-3xl font-black tracking-tight">Reklamsız taraftar deneyimi</h1>
        <p className="mt-2 text-fg-muted">{premium.tagline}</p>
        <p className="mt-5"><span className="text-4xl font-black">{formatTry(price)}</span><span className="text-fg-muted"> / ay · KDV dahil</span></p>
        <ul className="mt-5 space-y-2 text-sm">
          {["Ana sayfada, haberlerde, Shorts'ta, maç merkezinde ve profillerde reklam yok", "Video izlerken ve sayfa geçişlerinde reklam yok", "Reklam amaçlı açılır pencere yok, reklam çerezi yüklenmez", "Profilinde Premium taraftar rozeti", "İstediğin an tek tıkla iptal"].map((f) => (
            <li key={f} className="flex gap-2"><Check className="h-5 w-5 shrink-0 text-green" />{f}</li>
          ))}
        </ul>
        <p className="mt-4 rounded-xl bg-muted px-3 py-2 text-xs text-fg-muted">Ücretsiz üyeler hiçbir temel özellikten mahrum kalmaz. Premium yalnızca reklamları kaldırır.</p>

        <div className="mt-6">
          {!viewer ? (
            <LinkButton href="/giris?next=/premium" size="lg" className="w-full">Premium için giriş yap</LinkButton>
          ) : active && !sub?.cancel_at_period_end ? (
            <Alert tone="success"><ShieldCheck className="mr-1 inline h-4 w-4" />Premium aktif.</Alert>
          ) : availability.available ? (
            <BuyButton label={active ? "Aboneliği yeniden başlat" : `Aylık ${formatTry(price)} ile Premium ol`} />
          ) : (
            <Alert tone="warning"><Ban className="mr-1 inline h-4 w-4" />Ödeme sistemi henüz aktif değil: {availability.reason} Ödeme alınmadan Premium verilmez.</Alert>
          )}
          {availability.available && !availability.provider.isLive && (
            <p className="mt-2 text-center text-xs font-semibold text-amber-600 dark:text-amber-400">TEST MODU: Gerçek para çekilmez; test ödemeleri gelir raporlarına dahil edilmez.</p>
          )}
        </div>
      </Card>

      {viewer && sub && (
        <Card className="p-5">
          <h2 className="font-bold">Abonelik durumun</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-fg-muted">Durum</dt><dd className="font-semibold">{SUBSCRIPTION_STATUS_LABEL[sub.status]}{sub.cancel_at_period_end && sub.status !== "expired" ? " (dönem sonunda bitecek)" : ""}</dd></div>
            <div><dt className="text-fg-muted">{sub.cancel_at_period_end ? "Premium bitiş" : "Sonraki yenileme"}</dt><dd className="font-semibold">{formatDate(sub.current_period_end)}</dd></div>
            <div><dt className="text-fg-muted">Aylık ücret</dt><dd className="font-semibold">{formatTry(Number(sub.price_amount))}</dd></div>
            <div><dt className="text-fg-muted">Ödeme altyapısı</dt><dd className="font-semibold">{sub.provider === "test" ? "Test modu" : sub.provider}</dd></div>
          </dl>
          {["active", "renewal_pending"].includes(sub.status) && !sub.cancel_at_period_end && <div className="mt-4"><CancelButton /></div>}
        </Card>
      )}

      {viewer && payments.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 font-bold">Ödeme geçmişi</h2>
          <div className="divide-y divide-border text-sm">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2">
                <span>{formatDateTime(p.paid_at ?? p.created_at)} · {p.kind === "renewal" ? "Yenileme" : p.kind === "refund" ? "İade" : "Abonelik"}{p.is_test && <Badge tone="amber" className="ml-2">Test</Badge>}</span>
                <span className="tabular-nums">{formatTry(Number(p.amount_gross))} · {PAYMENT_STATUS[p.status] ?? p.status}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
      <p className="text-center text-xs text-fg-muted">
        Abonelik, iptal edilene kadar her ay otomatik yenilenir. <Link href="/yasal/abonelik" className="underline">Abonelik ve İptal Koşulları</Link> · Kart bilgilerin bizde saklanmaz.
      </p>
    </div>
  );
}
