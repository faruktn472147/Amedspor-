// Supabase Yönetim API'si ile veritabanı kurulumu (ücretsiz plan).
//
// Kullanım:
//   node scripts/supabase-deploy.mjs projects            → kuruluş ve projeleri listeler
//   node scripts/supabase-deploy.mjs apply <ref>         → bekleyen migration'ları sırayla yükler
//   node scripts/supabase-deploy.mjs verify <ref>        → güvenlik/kurulum kontrolleri
//   node scripts/supabase-deploy.mjs keys <ref>          → herkese açık (anon/publishable) anahtar
//   node scripts/supabase-deploy.mjs auth-show <ref>     → Auth ayar anahtarlarını listeler
//
// Erişim anahtarı SUPABASE_ACCESS_TOKEN ortam değişkeninden okunur. Claude Code bulut
// oturumunda anahtar ağ vekili tarafından eklenir; bu durumda değişken boş bırakılabilir.
// Gizli (service_role / secret) anahtar bu betik tarafından ASLA yazdırılmaz.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const API = "https://api.supabase.com/v1";
const token = process.env.SUPABASE_ACCESS_TOKEN || "proxy-injected";
const root = path.resolve(import.meta.dirname, "..");
const migrationsDir = path.join(root, "supabase", "migrations");

function call(method, url, body) {
  const args = ["-sS", "--max-time", "180", "-X", method, "-H", `Authorization: Bearer ${token}`, "-H", "Content-Type: application/json", "-w", "\n%{http_code}", `${API}${url}`];
  if (body !== undefined) args.push("--data-binary", "@-");
  const out = execFileSync("curl", args, { input: body === undefined ? undefined : JSON.stringify(body), maxBuffer: 64 * 1024 * 1024 }).toString();
  const i = out.lastIndexOf("\n");
  const status = Number(out.slice(i + 1));
  const text = out.slice(0, i);
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (status < 200 || status >= 300) {
    const msg = typeof json === "object" && json ? json.message ?? JSON.stringify(json) : String(json);
    const err = new Error(`HTTP ${status}: ${msg}`);
    err.status = status;
    throw err;
  }
  return json;
}

const sql = (ref, query) => call("POST", `/projects/${ref}/database/query`, { query });
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

const [cmd, ref] = process.argv.slice(2);
const needRef = () => {
  if (!ref || !/^[a-z0-9]{20}$/.test(ref)) throw new Error("Geçerli bir proje kimliği (ref) verin");
};

switch (cmd) {
  case "projects": {
    const orgs = call("GET", "/organizations");
    for (const o of orgs) console.log(`kuruluş: ${o.name} (${o.slug ?? o.id})`);
    const projects = call("GET", "/projects");
    if (!projects.length) console.log("proje yok");
    for (const p of projects) console.log(`proje: ${p.name} | ref=${p.ref ?? p.id} | bölge=${p.region} | durum=${p.status} | kuruluş=${p.organization_slug ?? p.organization_id}`);
    break;
  }
  case "apply": {
    needRef();
    sql(ref, "create schema if not exists amed_meta; create table if not exists amed_meta.applied (name text primary key, applied_at timestamptz not null default now()); revoke all on schema amed_meta from public;");
    const done = new Set(sql(ref, "select name from amed_meta.applied").map((r) => r.name));
    const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
    let applied = 0;
    for (const f of files) {
      if (done.has(f)) {
        console.log(`= ${f} (zaten yüklü)`);
        continue;
      }
      const body = readFileSync(path.join(migrationsDir, f), "utf8");
      // Dosya ve kaydı tek sorguda gönderilir: hata olursa ikisi de geri alınır.
      try {
        sql(ref, `${body}\n;\ninsert into amed_meta.applied (name) values (${lit(f)});`);
      } catch (e) {
        console.error(`✗ ${f}\n  ${e.message}`);
        process.exit(1);
      }
      console.log(`✓ ${f}`);
      applied += 1;
    }
    console.log(`${applied} migration yüklendi, ${files.length - applied} zaten vardı.`);
    break;
  }
  case "verify": {
    needRef();
    const q = (label, query) => {
      const rows = sql(ref, query);
      console.log(`${label}: ${JSON.stringify(rows)}`);
      return rows;
    };
    q("uygulanan migration'lar", "select count(*)::int as adet from amed_meta.applied");
    q("public tablo sayısı", "select count(*)::int as adet from pg_tables where schemaname = 'public'");
    const noRls = q("RLS KAPALI tablolar (boş olmalı)", "select tablename from pg_tables where schemaname = 'public' and not rowsecurity");
    q("RLS politika sayısı", "select count(*)::int as adet from pg_policies where schemaname in ('public', 'storage')");
    q("depolama kovaları", "select id, public, file_size_limit from storage.buckets order by id");
    q("ayarlar", "select key, is_public from public.app_settings order by key");
    q("rozetler", "select count(*)::int as adet from public.badges");
    q("auth tetikleyicisi", "select tgname from pg_trigger where tgname = 'on_auth_user_created'");
    q("anon rolünün yazabildiği tablolar (boş olmalı)", "select distinct table_name from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public' and privilege_type in ('INSERT','UPDATE','DELETE')");
    if (noRls.length) process.exit(2);
    break;
  }
  case "keys": {
    needRef();
    const keys = call("GET", `/projects/${ref}/api-keys`);
    console.log(`Project URL: https://${ref}.supabase.co`);
    for (const k of keys) {
      const name = String(k.name ?? k.type ?? "");
      const isPublic = /anon|publishable/i.test(name) && !/service|secret/i.test(name);
      if (isPublic) console.log(`${name}: ${k.api_key}`);
      else console.log(`${name}: (gizli — yazdırılmadı)`);
    }
    break;
  }
  case "auth-show": {
    needRef();
    const cfg = call("GET", `/projects/${ref}/config/auth`);
    const keys = Object.keys(cfg).filter((k) => /site_url|uri_allow|mailer_(subjects|templates)_(confirmation|recovery)|mailer_otp|external_email_enabled|mailer_autoconfirm|smtp_host/.test(k));
    for (const k of keys) console.log(`${k}: ${typeof cfg[k] === "string" ? cfg[k].slice(0, 80).replace(/\n/g, " ") : cfg[k]}`);
    break;
  }
  default:
    console.log("Komutlar: projects | apply <ref> | verify <ref> | keys <ref> | auth-show <ref>");
}
