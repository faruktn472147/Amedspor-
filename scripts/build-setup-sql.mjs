// Tüm migration'ları, Supabase SQL Editor'e tek seferde yapıştırılabilecek
// tek bir dosyada birleştirir: supabase/KURULUM_TEK_DOSYA.sql
// Kullanım: node scripts/build-setup-sql.mjs
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dir = path.join(root, "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const parts = [
  `-- ============================================================================
-- AMEDSPOR — TEK DOSYA VERİTABANI KURULUMU
-- Bu dosya otomatik üretilir (scripts/build-setup-sql.mjs); elle düzenlemeyin.
--
-- NASIL KULLANILIR:
--   1) supabase.com → projeniz → sol menüde "SQL Editor" → "New query"
--   2) Bu dosyanın TAMAMINI kopyalayıp yapıştırın
--   3) Sağ alttaki "Run" düğmesine basın → "Success. No rows returned" görmelisiniz
--
-- Yalnızca YENİ (boş) bir projede BİR KEZ çalıştırın. Tüm adımlar tek işlemde
-- yapılır: bir hata olursa hiçbir şey yarım kalmaz.
-- İçerik: ${files.length} migration (${files[0]} … ${files[files.length - 1]})
-- ============================================================================
`,
  "begin;\n",
  "create schema if not exists amed_meta;\ncreate table if not exists amed_meta.applied (name text primary key, applied_at timestamptz not null default now());\nrevoke all on schema amed_meta from public;\n",
];
for (const f of files) {
  parts.push(`\n-- ---------------------------------------------------------------------------\n-- ${f}\n-- ---------------------------------------------------------------------------\n`);
  parts.push(readFileSync(path.join(dir, f), "utf8").trimEnd() + "\n");
  parts.push(`insert into amed_meta.applied (name) values ('${f}');\n`);
}
parts.push("\ncommit;\n");
writeFileSync(path.join(root, "supabase", "KURULUM_TEK_DOSYA.sql"), parts.join(""));
console.log(`✓ supabase/KURULUM_TEK_DOSYA.sql (${files.length} migration)`);
