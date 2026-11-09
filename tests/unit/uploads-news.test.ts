import { describe, expect, it } from "vitest";
import { buildStoragePath, isOwnedPath, sniffMime, validateUpload } from "@/lib/uploads/validate";
import { dedupeKey, excerpt, parseFeed } from "@/lib/news/feed";
import { classifyItem, isRelevant } from "@/lib/news/classify";

describe("yükleme doğrulama", () => {
  it("izin verilmeyen türleri reddeder", () => {
    expect(validateUpload({ kind: "image", mime: "image/gif", size: 1000 })).toMatch(/JPEG/);
    expect(validateUpload({ kind: "video", mime: "video/quicktime", size: 1000, durationSeconds: 10 })).toMatch(/MP4/);
  });
  it("boyut ve süre sınırlarını uygular", () => {
    expect(validateUpload({ kind: "image", mime: "image/jpeg", size: 6 * 1024 * 1024 })).toMatch(/büyük/);
    expect(validateUpload({ kind: "video", mime: "video/mp4", size: 51 * 1024 * 1024, durationSeconds: 10 })).toMatch(/büyük/);
    expect(validateUpload({ kind: "video", mime: "video/mp4", size: 1e6, durationSeconds: 61 })).toMatch(/60 saniye/);
    expect(validateUpload({ kind: "video", mime: "video/mp4", size: 1e6, durationSeconds: 30, width: 2160, height: 3840 })).toMatch(/çözünürlüğü/);
    expect(validateUpload({ kind: "video", mime: "video/mp4", size: 1e6, durationSeconds: 30, width: 1080, height: 1920 })).toBeNull();
  });
  it("dosya imzasından gerçek türü tespit eder", () => {
    expect(sniffMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toBe("image/png");
    expect(sniffMime(new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0]))).toBe("video/mp4");
    expect(sniffMime(new TextEncoder().encode("<?php echo 1; ?>"))).toBeNull();
  });
  it("depolama yolu kullanıcıya aittir ve dizin atlatma engellenir", () => {
    const uid = "11111111-1111-1111-1111-111111111111";
    const p = buildStoragePath(uid, "image/webp", "22222222-2222-2222-2222-222222222222", new Date("2026-11-01"));
    expect(p).toBe(`${uid}/2026-11/22222222-2222-2222-2222-222222222222.webp`);
    expect(isOwnedPath(uid, p)).toBe(true);
    expect(isOwnedPath(uid, `${uid}/../other/x.jpg`)).toBe(false);
    expect(isOwnedPath("33333333-3333-3333-3333-333333333333", p)).toBe(false);
  });
});

const RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Örnek</title>
<item><title>Amedspor deplasmanda 2-1 kazandı</title><link>https://ornek.test/haber/1?utm_source=x</link>
<pubDate>Mon, 09 Nov 2026 10:00:00 +0300</pubDate><description><![CDATA[<p>Amedspor zorlu maçta <b>galip</b> geldi.</p>]]></description></item>
<item><title>Amedspor'un yıldızına transfer iddiası</title><link>https://ornek.test/haber/2</link>
<pubDate>Mon, 09 Nov 2026 09:00:00 +0300</pubDate><description>Kulis bilgilerine göre...</description></item>
<item><title>Başka takım haberi burada</title><link>https://ornek.test/haber/3</link><pubDate>Mon, 09 Nov 2026 09:00:00 +0300</pubDate></item>
<item><title>Zararlı bağlantı denemesi</title><link>javascript:alert(1)</link></item>
</channel></rss>`;

describe("haber beslemesi", () => {
  const now = new Date("2026-11-09T12:00:00Z");
  it("RSS ayrıştırır, HTML temizler, zararlı bağlantıları atar", () => {
    const items = parseFeed(RSS);
    expect(items).toHaveLength(3);
    expect(items[0].summary).toBe("Amedspor zorlu maçta galip geldi.");
    expect(items.every((i) => i.link.startsWith("https://"))).toBe(true);
  });
  it("DTD varlığı içeren beslemeyi reddeder (XXE koruması)", () => {
    expect(() => parseFeed('<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><rss/>')).toThrow();
  });
  it("utm parametrelerinden bağımsız tekilleştirir", () => {
    expect(dedupeKey("https://ornek.test/haber/1?utm_source=x")).toBe(dedupeKey("https://ornek.test/haber/1"));
  });
  it("yalnızca Amedspor ile ilgili haberleri seçer", () => {
    const items = parseFeed(RSS);
    expect(items.filter((i) => isRelevant(i, ["amedspor"]))).toHaveLength(2);
  });
  it("güvenilir kaynaktan normal haber otomatik yayınlanır; söylenti onaya gider", () => {
    const [win, rumor] = parseFeed(RSS);
    const src = { kind: "media" as const, trust_level: "trusted" as const, auto_publish: true, keywords: ["amedspor"] };
    expect(classifyItem(win, src, now).status).toBe("published");
    const r = classifyItem(rumor, src, now);
    expect(r.status).toBe("pending");
    expect(r.verification).toBe("rumor");
    expect(r.category).toBe("transfer");
  });
  it("eski haber yeni gibi otomatik yayınlanmaz", () => {
    const [win] = parseFeed(RSS);
    const src = { kind: "media" as const, trust_level: "trusted" as const, auto_publish: true, keywords: ["amedspor"] };
    expect(classifyItem(win, src, new Date("2026-12-30")).status).toBe("pending");
  });
  it("özet uzun metni keser (tam metin kopyalanmaz)", () => {
    expect(excerpt("kelime ".repeat(200)).length).toBeLessThanOrEqual(281);
  });
});
