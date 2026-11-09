import { describe, expect, it } from "vitest";
import {
  adPositions,
  interleaveAds,
  pickCampaign,
  sanitizeAdSettings,
  shouldShowAds,
  DEFAULT_AD_SETTINGS,
} from "@/lib/ads/frequency";

describe("reklam gösterim kararı", () => {
  it("Premium üyeye asla reklam gösterilmez", () => {
    expect(shouldShowAds({ isPremium: true, settings: DEFAULT_AD_SETTINGS, placementEnabled: true })).toBe(false);
  });
  it("ücretsiz üyeye, yerleşim açıksa gösterilir", () => {
    expect(shouldShowAds({ isPremium: false, settings: DEFAULT_AD_SETTINGS, placementEnabled: true })).toBe(true);
  });
  it("yerleşim veya genel ayar kapalıysa gösterilmez", () => {
    expect(shouldShowAds({ isPremium: false, settings: DEFAULT_AD_SETTINGS, placementEnabled: false })).toBe(false);
    expect(shouldShowAds({ isPremium: false, settings: { ...DEFAULT_AD_SETTINGS, enabled: false }, placementEnabled: true })).toBe(false);
  });
});

describe("reklam sıklığı", () => {
  it("akışın başında reklam yok, aralıklı ve sayfa sınırı ile", () => {
    expect(adPositions(30, 5, 10, 2)).toEqual([4, 14]);
    expect(adPositions(3, 5, 10, 2)).toEqual([]);
    expect(adPositions(30, 5, 10, 0)).toEqual([]);
  });
  it("son öğeden sonra reklam koyulmaz (boş alan yok)", () => {
    expect(adPositions(5, 5, 10, 2)).toEqual([]);
  });
  it("yönetici çok sık değer girse de güvenli aralığa sıkıştırılır", () => {
    const s = sanitizeAdSettings({ feed_first_after: 0, feed_every: 1, shorts_every: 1, max_per_page: 99 });
    expect(s.feed_first_after).toBeGreaterThanOrEqual(3);
    expect(s.feed_every).toBeGreaterThanOrEqual(5);
    expect(s.shorts_every).toBeGreaterThanOrEqual(8);
    expect(s.max_per_page).toBeLessThanOrEqual(5);
  });
  it("içerik ve reklamı doğru sırayla birleştirir", () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ id: String(i) }));
    const feed = interleaveAds(items, (x) => x.id, adPositions(12, 5, 10, 2));
    expect(feed.filter((e) => e.type === "ad")).toHaveLength(1);
    expect(feed[5].type).toBe("ad");
  });
});

describe("kampanya seçimi", () => {
  const camps = [
    { id: "a", priority: 1, placement_codes: ["home_feed"] },
    { id: "b", priority: 1, placement_codes: ["home_feed", "news_detail"] },
    { id: "c", priority: 0, placement_codes: ["shorts_feed"] },
  ];
  it("günlük sınırı dolan kampanyayı göstermez", () => {
    expect(pickCampaign(camps, "home_feed", { a: 3, b: 3 }, 3, null)).toBeNull();
  });
  it("aynı reklamı arka arkaya göstermez", () => {
    expect(pickCampaign(camps, "home_feed", {}, 3, "a")?.id).toBe("b");
  });
  it("uygun kampanya yoksa null döner", () => {
    expect(pickCampaign(camps, "player_profile", {}, 3, null)).toBeNull();
  });
});
