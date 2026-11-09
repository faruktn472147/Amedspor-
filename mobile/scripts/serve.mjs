// Test ve önizleme için küçük statik sunucu. Tek HTML'yi sunar.
//   /            → yapılandırma ortam değişkenleriyle doldurulmuş sürüm
//   /raw.html    → dosyanın kendisi (yer tutucularla, "kurulum bekleniyor" durumu)
// Kullanım: AMED_SUPABASE_URL=... node mobile/scripts/serve.mjs 3300
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const port = Number(process.argv[2] ?? 3300);
const file = path.resolve(import.meta.dirname, "..", "www", "index.html");
const inject = (html) =>
  html
    .replace('"__SUPABASE_URL__"', JSON.stringify(process.env.AMED_SUPABASE_URL ?? "__SUPABASE_URL__"))
    .replace('"__SUPABASE_ANON_KEY__"', JSON.stringify(process.env.AMED_SUPABASE_ANON_KEY ?? "__SUPABASE_ANON_KEY__"))
    .replace('"__SITE_URL__"', JSON.stringify(process.env.AMED_SITE_URL ?? "__SITE_URL__"));

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname !== "/" && url.pathname !== "/index.html" && url.pathname !== "/raw.html") {
    res.writeHead(404).end("not found");
    return;
  }
  const html = await readFile(file, "utf8");
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.end(url.pathname === "/raw.html" ? html : inject(html));
}).listen(port, "127.0.0.1", () => console.log(`AMEDSPOR mobil önizleme: http://127.0.0.1:${port}`));
