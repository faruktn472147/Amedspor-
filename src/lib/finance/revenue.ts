/**
 * Gelir raporlama. Brüt ve net AYRI hesaplanır; tahmini değerler "estimated"
 * olarak işaretlenir ve gerçek tahsilat/aktarım gibi gösterilmez.
 */

export interface FinanceSettings {
  estimatedFeePercent: number;
  estimatedFeeFixed: number;
  vatPercent: number;
}

export interface FinancePayment {
  status: "pending" | "succeeded" | "failed" | "refunded" | "canceled";
  amountGross: number;
  feeAmount: number | null;
  paidAt: Date | null;
  isTest: boolean;
}

export interface FinanceAdRevenue {
  provider: "adsense" | "admob" | "direct";
  periodStart: Date;
  amount: number;
  revenueStatus: "estimated" | "finalized" | "received";
}

export interface FinancePayout {
  amount: number;
  status: "scheduled" | "paid" | "failed";
}

export interface PeriodTotals {
  subscriptionGross: number;
  refunds: number;
  feesReported: number;
  feesEstimated: number;
  vat: number;
  subscriptionNetEstimated: number;
  adRevenue: number;
  adRevenueEstimated: number;
  totalGross: number;
  paymentCount: number;
}

export interface FinanceSummary {
  today: PeriodTotals;
  week: PeriodTotals;
  month: PeriodTotals;
  allTime: PeriodTotals;
  payoutsPaid: number;
  payoutsScheduled: number;
  /** Ödeme kuruluşunda bekleyen TAHMİNİ tutar (net - bankaya aktarılan). Gerçek bakiye için sağlayıcı paneli esastır. */
  providerBalanceEstimated: number;
  testPaymentsExcluded: number;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** KDV dahil brüt tutardan KDV payı: brüt × oran / (100 + oran) */
export function vatFromGross(gross: number, vatPercent: number): number {
  if (vatPercent <= 0) return 0;
  return round2((gross * vatPercent) / (100 + vatPercent));
}

export function estimateFee(gross: number, s: FinanceSettings): number {
  if (gross <= 0) return 0;
  return round2((gross * s.estimatedFeePercent) / 100 + s.estimatedFeeFixed);
}

/** Türkiye saatine göre (UTC+3) gün/hafta/ay başlangıçları */
export function periodStarts(now: Date) {
  const TR_OFFSET = 3 * 60 * 60 * 1000;
  const local = new Date(now.getTime() + TR_OFFSET);
  const dayStart = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - TR_OFFSET;
  const weekday = (local.getUTCDay() + 6) % 7; // Pazartesi = 0
  const weekStart = dayStart - weekday * 24 * 60 * 60 * 1000;
  const monthStart = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - TR_OFFSET;
  return { day: new Date(dayStart), week: new Date(weekStart), month: new Date(monthStart) };
}

function totals(
  payments: FinancePayment[],
  ads: FinanceAdRevenue[],
  s: FinanceSettings,
  from: Date | null,
): PeriodTotals {
  const inRange = (d: Date | null) => !!d && (!from || d >= from);
  let gross = 0;
  let refunds = 0;
  let feesReported = 0;
  let feesEstimated = 0;
  let count = 0;
  for (const p of payments) {
    if (p.isTest || !inRange(p.paidAt)) continue;
    if (p.status !== "succeeded" && p.status !== "refunded") continue;
    count += 1;
    gross += p.amountGross;
    if (p.status === "refunded") refunds += p.amountGross;
    if (p.feeAmount != null) feesReported += p.feeAmount;
    else feesEstimated += estimateFee(p.amountGross, s);
  }
  const kept = gross - refunds;
  const vat = vatFromGross(kept, s.vatPercent);
  const adRevenue = ads.filter((a) => inRange(a.periodStart) && a.revenueStatus !== "estimated").reduce((a, b) => a + b.amount, 0);
  const adEstimated = ads.filter((a) => inRange(a.periodStart) && a.revenueStatus === "estimated").reduce((a, b) => a + b.amount, 0);
  return {
    subscriptionGross: round2(gross),
    refunds: round2(refunds),
    feesReported: round2(feesReported),
    feesEstimated: round2(feesEstimated),
    vat,
    subscriptionNetEstimated: round2(kept - feesReported - feesEstimated - vat),
    adRevenue: round2(adRevenue),
    adRevenueEstimated: round2(adEstimated),
    totalGross: round2(gross + adRevenue),
    paymentCount: count,
  };
}

export function computeFinanceSummary(
  payments: FinancePayment[],
  ads: FinanceAdRevenue[],
  payouts: FinancePayout[],
  s: FinanceSettings,
  now = new Date(),
): FinanceSummary {
  const p = periodStarts(now);
  const allTime = totals(payments, ads, s, null);
  const payoutsPaid = round2(payouts.filter((x) => x.status === "paid").reduce((a, b) => a + b.amount, 0));
  const payoutsScheduled = round2(payouts.filter((x) => x.status === "scheduled").reduce((a, b) => a + b.amount, 0));
  const subscriptionNetBeforeVat = allTime.subscriptionGross - allTime.refunds - allTime.feesReported - allTime.feesEstimated;
  return {
    today: totals(payments, ads, s, p.day),
    week: totals(payments, ads, s, p.week),
    month: totals(payments, ads, s, p.month),
    allTime,
    payoutsPaid,
    payoutsScheduled,
    // KDV ödeme kuruluşunca kesilmez; işletme beyan eder. Bu yüzden bakiyeden düşülmez.
    providerBalanceEstimated: round2(Math.max(0, subscriptionNetBeforeVat - payoutsPaid)),
    testPaymentsExcluded: payments.filter((x) => x.isTest).length,
  };
}

/** Örnek brüt gelir tablosu (vergi, komisyon ve iadeler ÖNCESİ). */
export function projectionTable(price: number, counts = [100, 500, 1000, 5000, 10000], s?: FinanceSettings) {
  return counts.map((n) => {
    const gross = round2(n * price);
    const row: { subscribers: number; gross: number; estimatedNet?: number } = { subscribers: n, gross };
    if (s) {
      const fees = round2(n * estimateFee(price, s));
      row.estimatedNet = round2(gross - fees - vatFromGross(gross, s.vatPercent));
    }
    return row;
  });
}

export function toCsv(rows: Record<string, string | number | null | undefined>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    // CSV enjeksiyonuna karşı (=, +, -, @ ile başlayan hücreler)
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}

export function formatTry(n: number): string {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(n);
}
