// Tek HTML dosyası üretir: CSS + JS + yapılandırma tek bir index.html içinde.
// Kullanım: node build.mjs   (isteğe bağlı ortam değişkenleri:
//   AMED_SUPABASE_URL, AMED_SUPABASE_ANON_KEY, AMED_SITE_URL, AMED_OUT)
import { build } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const here = import.meta.dirname;
const root = path.resolve(here, "..");
const pkg = JSON.parse(await readFile(path.join(here, "package.json"), "utf8"));
const out = process.env.AMED_OUT ? path.resolve(process.env.AMED_OUT) : path.join(here, "www", "index.html");

const result = await build({
  entryPoints: [path.join(here, "src", "main.ts")],
  bundle: true,
  write: false,
  format: "iife",
  target: ["chrome89", "safari15"],
  minify: true,
  legalComments: "none",
  alias: { "@": path.join(root, "src") },
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const css = (await readFile(path.join(here, "src", "styles.css"), "utf8")).replace(/\s*\n\s*/g, "\n");
const iconSvg = await readFile(path.join(root, "public", "icons", "icon.svg"), "utf8");
const icon = `data:image/svg+xml;base64,${Buffer.from(iconSvg).toString("base64")}`;

// İçerik Güvenlik Politikası: dışarıdan betik/çerçeve/eklenti yüklenemez; yalnızca HTTPS bağlantı.
// (Capacitor köprü kodunu satır içi enjekte edebildiği için satır içi betiğe izin verilir;
//  kullanıcı verisi hiçbir zaman HTML olarak işlenmez.)
const csp = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src https: data: blob:",
  "media-src https: blob:",
  "connect-src https:",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "object-src 'none'",
].join("; ");

const jsonStr = (v) => JSON.stringify(v).slice(1, -1);
const env = (name, placeholder) => process.env[name]?.trim() || placeholder;
let html = await readFile(path.join(here, "src", "template.html"), "utf8");
html = html
  .replace("__CSP__", csp)
  .replace("__ICON__", icon)
  .replace("__SUPABASE_URL__", jsonStr(env("AMED_SUPABASE_URL", "__SUPABASE_URL__")))
  .replace("__SUPABASE_ANON_KEY__", jsonStr(env("AMED_SUPABASE_ANON_KEY", "__SUPABASE_ANON_KEY__")))
  .replace("__SITE_URL__", jsonStr(env("AMED_SITE_URL", "__SITE_URL__")))
  .replace("__APP_VERSION__", jsonStr(pkg.version))
  .replace("__CSS__", () => css)
  .replace("__JS__", () => js);

if (/__CSP__|__CSS__|__JS__/.test(html)) throw new Error("Şablon yer tutucuları doldurulamadı");
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, html);
console.log(`✓ ${path.relative(process.cwd(), out)} (${(html.length / 1024).toFixed(1)} KB, tek dosya)`);
