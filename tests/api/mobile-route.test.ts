import { describe, expect, it } from "vitest";
import { corsHeaders } from "@/lib/mobile";
import { OPTIONS, POST } from "@/app/api/mobile/[op]/route";

const ctx = (op: string) => ({ params: Promise.resolve({ op }) });

describe("mobil API", () => {
  it("CORS yalnızca uygulama kaynaklarına izin verir", () => {
    expect(corsHeaders("https://localhost")["access-control-allow-origin"]).toBe("https://localhost");
    expect(corsHeaders("capacitor://localhost")["access-control-allow-origin"]).toBe("capacitor://localhost");
    expect(corsHeaders("https://kotu-site.example")["access-control-allow-origin"]).toBeUndefined();
    expect(corsHeaders(null)["access-control-allow-origin"]).toBeUndefined();
  });

  it("ön kontrol (OPTIONS) isteğine yanıt verir", async () => {
    const res = OPTIONS(new Request("https://site.test/api/mobile/post", { method: "OPTIONS", headers: { origin: "https://localhost" } }));
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-headers")).toContain("authorization");
  });

  it("bilinmeyen işlem 404", async () => {
    const res = await POST(new Request("https://site.test/api/mobile/x", { method: "POST", body: "{}" }), ctx("hack"));
    expect(res.status).toBe(404);
  });

  it("geçersiz JSON 400", async () => {
    const res = await POST(new Request("https://site.test/api/mobile/post", { method: "POST", body: "{bozuk" }), ctx("post"));
    expect(res.status).toBe(400);
  });

  it("oturum belirteci olmadan hiçbir yazma işlemi yapılamaz (401)", async () => {
    for (const op of ["post", "comment", "profile", "delete-account"]) {
      const res = await POST(new Request(`https://site.test/api/mobile/${op}`, { method: "POST", body: JSON.stringify({ body: "merhaba" }) }), ctx(op));
      expect(res.status, op).toBe(401);
    }
    const sahte = await POST(
      new Request("https://site.test/api/mobile/post", { method: "POST", headers: { authorization: "Bearer sahte" }, body: "{}" }),
      ctx("post"),
    );
    expect(sahte.status).toBe(401);
  });

  it("çok büyük istek reddedilir", async () => {
    const res = await POST(new Request("https://site.test/api/mobile/post", { method: "POST", body: "x".repeat(70 * 1024) }), ctx("post"));
    expect(res.status).toBe(413);
  });
});
