import { describe, expect, it } from "vitest";
import { computeFinanceSummary, projectionTable, toCsv, vatFromGross, type FinanceSettings } from "@/lib/finance/revenue";

const s: FinanceSettings = { estimatedFeePercent: 3.5, estimatedFeeFixed: 0.25, vatPercent: 20 };

describe("gelir hesabı", () => {
  it("örnek brüt gelir tablosu (vergi/komisyon öncesi)", () => {
    expect(projectionTable(10).map((r) => r.gross)).toEqual([1000, 5000, 10000, 50000, 100000]);
  });

  it("KDV dahil fiyattan KDV payı doğru hesaplanır", () => {
    expect(vatFromGross(120, 20)).toBe(20);
    expect(vatFromGross(10, 20)).toBe(1.67);
  });

  it("brüt ve net ayrı; test ödemeleri ve iadeler doğru işlenir", () => {
    const now = new Date("2026-11-09T12:00:00Z");
    const summary = computeFinanceSummary(
      [
        { status: "succeeded", amountGross: 10, feeAmount: 0.6, paidAt: now, isTest: false },
        { status: "succeeded", amountGross: 10, feeAmount: null, paidAt: now, isTest: false },
        { status: "refunded", amountGross: 10, feeAmount: 0.6, paidAt: now, isTest: false },
        { status: "succeeded", amountGross: 10, feeAmount: null, paidAt: now, isTest: true },
        { status: "failed", amountGross: 10, feeAmount: null, paidAt: null, isTest: false },
      ],
      [{ provider: "adsense", periodStart: now, amount: 50, revenueStatus: "estimated" }],
      [{ amount: 5, status: "paid" }],
      s,
      now,
    );
    const t = summary.allTime;
    expect(t.subscriptionGross).toBe(30);
    expect(t.refunds).toBe(10);
    expect(t.feesReported).toBe(1.2);
    expect(t.feesEstimated).toBe(0.6); // 10 * 3.5% + 0.25
    expect(t.vat).toBe(3.33);
    expect(t.subscriptionNetEstimated).toBe(14.87);
    // Tahmini AdSense geliri, kesinleşmiş gelire eklenmez
    expect(t.adRevenue).toBe(0);
    expect(t.adRevenueEstimated).toBe(50);
    expect(summary.testPaymentsExcluded).toBe(1);
    expect(summary.payoutsPaid).toBe(5);
    expect(summary.today.subscriptionGross).toBe(30);
  });

  it("CSV çıktısı formül enjeksiyonuna karşı korumalıdır", () => {
    const csv = toCsv([{ a: "=HYPERLINK(1)", b: "x,y" }]);
    expect(csv).toContain("'=HYPERLINK(1)");
    expect(csv).toContain('"x,y"');
  });
});
