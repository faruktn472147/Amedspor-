import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

describe("tek dosya veritabanı kurulumu", () => {
  it("tüm migration'ları sırasıyla içerir ve tek işlem (begin/commit) olarak çalışır", () => {
    const dir = path.resolve("supabase/migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    const all = readFileSync(path.resolve("supabase/KURULUM_TEK_DOSYA.sql"), "utf8");
    let last = -1;
    for (const f of files) {
      const body = readFileSync(path.join(dir, f), "utf8").trimEnd();
      const at = all.indexOf(body);
      expect(at, `${f} güncel değil — node scripts/build-setup-sql.mjs çalıştırın`).toBeGreaterThan(last);
      last = at;
    }
    expect(all.trimStart().includes("begin;")).toBe(true);
    expect(all.trimEnd().endsWith("commit;")).toBe(true);
  });
});
