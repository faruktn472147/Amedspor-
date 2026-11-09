import { notFound } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { requireViewer } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { paymentConfigFromEnv, resolveProvider } from "@/lib/payments/providers";
import { TestPayButtons } from "@/components/premium/premium-buttons";
import { Alert, Card, PageHeader } from "@/components/ui";
import { formatTry } from "@/lib/finance/revenue";

export const metadata = { title: "Test ödeme", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Gerçek ödeme kuruluşunun güvenli ödeme sayfasının TEST MODU karşılığı. Canlıda kapalıdır. */
export default async function TestCheckoutPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const viewer = await requireViewer("/premium");
  const a = resolveProvider(paymentConfigFromEnv());
  if (!a.available || a.provider.id !== "test" || !/^[0-9a-f]{48}$/.test(token)) notFound();
  const admin = getSupabaseAdmin();
  const { data: payment } = admin ? await admin.from("payments").select("user_id, amount_gross, status").eq("checkout_token", token).maybeSingle() : { data: null };
  if (!payment || payment.user_id !== viewer.user.id) notFound();
  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Test ödeme sayfası" />
      <Alert tone="warning" className="mb-4"><FlaskConical className="mr-1 inline h-4 w-4" /><b>TEST MODU.</b> Bu sayfa gerçek ödeme almaz ve kart bilgisi istemez. Gerçek sistemde bu adımda ödeme kuruluşunun güvenli sayfası açılır.</Alert>
      <Card className="space-y-4 p-5">
        <p className="text-sm text-fg-muted">AMEDSPOR Premium — 1 ay</p>
        <p className="text-3xl font-black">{formatTry(Number(payment.amount_gross))}</p>
        {payment.status === "pending" ? <TestPayButtons token={token} /> : <Alert>Bu ödeme oturumu tamamlandı ({payment.status}).</Alert>}
        <p className="text-xs text-fg-muted">Butonlar, ödeme kuruluşunun göndereceği webhook&apos;u HMAC-SHA256 imzasıyla üretir ve canlı sistemdeki aynı doğrulama kodundan geçirir.</p>
      </Card>
    </div>
  );
}
