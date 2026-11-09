import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FinanceAdRevenue, FinancePayment, FinancePayout, FinanceSettings } from "./revenue";

/** Finans verilerini sahip+aal2 oturumuyla (RLS) okur. */
export async function loadFinance(db: SupabaseClient) {
  const [payments, ads, payouts, settings, subs, events] = await Promise.all([
    db.from("payments").select("id, user_id, kind, status, amount_gross, fee_amount, currency, paid_at, created_at, is_test, provider, provider_payment_ref, failure_reason").order("created_at", { ascending: false }).limit(5000),
    db.from("ad_revenue_entries").select("*").order("period_start", { ascending: false }),
    db.from("payouts").select("*").order("created_at", { ascending: false }),
    db.from("app_settings").select("key, value").in("key", ["finance", "premium"]),
    db.from("subscriptions").select("status, cancel_at_period_end, canceled_at, created_at, current_period_end, provider"),
    db.from("payment_events").select("provider, event_id, event_type, signature_valid, result, created_at").order("created_at", { ascending: false }).limit(30),
  ]);
  const fin = (settings.data ?? []).find((s) => s.key === "finance")?.value as Record<string, number> | undefined;
  const premium = (settings.data ?? []).find((s) => s.key === "premium")?.value as Record<string, number> | undefined;
  const fs: FinanceSettings = {
    estimatedFeePercent: Number(fin?.estimated_fee_percent ?? 3.5),
    estimatedFeeFixed: Number(fin?.estimated_fee_fixed_try ?? 0.25),
    vatPercent: Number(fin?.vat_percent ?? 20),
  };
  const fp: FinancePayment[] = (payments.data ?? []).map((p) => ({
    status: p.status,
    amountGross: Number(p.amount_gross),
    feeAmount: p.fee_amount == null ? null : Number(p.fee_amount),
    paidAt: p.paid_at ? new Date(p.paid_at) : null,
    isTest: p.is_test,
  }));
  const fa: FinanceAdRevenue[] = (ads.data ?? []).map((a) => ({ provider: a.provider, periodStart: new Date(a.period_start), amount: Number(a.amount), revenueStatus: a.revenue_status }));
  const fo: FinancePayout[] = (payouts.data ?? []).map((o) => ({ amount: Number(o.amount), status: o.status }));
  return { raw: { payments: payments.data ?? [], ads: ads.data ?? [], payouts: payouts.data ?? [], subs: subs.data ?? [], events: events.data ?? [] }, fs, fp, fa, fo, price: Number(premium?.price_try ?? 10), error: payments.error?.message ?? null };
}
