import { describe, expect, it } from "vitest";
import { isBackendConfigured, isSiteConfigured, readConfig } from "../../mobile/src/config";
import { inList, qs } from "../../mobile/src/api";
import { resolve, route, safeNextHash } from "../../mobile/src/router";

describe("mobil yapılandırma", () => {
  it("yer tutucular yapılandırılmamış sayılır (sahte bağlantı yok)", () => {
    const c = readConfig({ supabaseUrl: "__SUPABASE_URL__", supabaseAnonKey: "__SUPABASE_ANON_KEY__", siteUrl: "__SITE_URL__" });
    expect(isBackendConfigured(c)).toBe(false);
    expect(isSiteConfigured(c)).toBe(false);
  });
  it("HTTPS olmayan adres kabul edilmez", () => {
    expect(isBackendConfigured(readConfig({ supabaseUrl: "http://x.supabase.co", supabaseAnonKey: "a".repeat(40) }))).toBe(false);
  });
  it("geçerli yapılandırma; sondaki eğik çizgi temizlenir", () => {
    const c = readConfig({ supabaseUrl: "https://abc.supabase.co/", supabaseAnonKey: "a".repeat(40), siteUrl: "https://site.example/" });
    expect(c.supabaseUrl).toBe("https://abc.supabase.co");
    expect(isBackendConfigured(c)).toBe(true);
    expect(isSiteConfigured(c)).toBe(true);
  });
});

describe("mobil sorgu oluşturucu", () => {
  it("PostgREST parametrelerini kodlar, boş değerleri atar", () => {
    expect(qs({ select: "id,name", status: "eq.published", category: undefined, limit: 20 })).toBe("select=id%2Cname&status=eq.published&limit=20");
  });
  it("in() listesine yalnızca UUID girer (enjeksiyon engellenir)", () => {
    expect(inList(["11111111-1111-4111-8111-111111111111", "x),or=(id.gt.0"])).toBe("in.(11111111-1111-4111-8111-111111111111)");
  });
});

describe("mobil yönlendirici", () => {
  route("/haber/:id", "Haber", () => "x" as unknown as Node);
  it("parametreli rotayı çözer", () => {
    const m = resolve("#/haber/abc?kaynak=1");
    expect(m?.params.id).toBe("abc");
    expect(m?.query.get("kaynak")).toBe("1");
  });
  it("bilinmeyen rota null döner", () => {
    expect(resolve("#/yok/yok")).toBeNull();
  });
  it("giriş sonrası yönlendirme yalnızca uygulama içi olabilir", () => {
    expect(safeNextHash("#/akis")).toBe("#/akis");
    expect(safeNextHash("https://kotu.example")).toBe("#/");
    expect(safeNextHash("#//kotu.example")).toBe("#/");
    expect(safeNextHash(null)).toBe("#/");
  });
});
