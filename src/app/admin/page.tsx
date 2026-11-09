import { requireViewer } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert, Card } from "@/components/ui";

export const metadata = { title: "Yönetim" };

// Supabase Free plan sınırları (Kasım 2026 itibarıyla üçüncü taraf kaynaklarda bildirilen değerler;
// kesin değerler için supabase.com/pricing kontrol edilmelidir).
const FREE_DB_BYTES = 500 * 1024 * 1024;
const FREE_STORAGE_BYTES = 1024 * 1024 * 1024;

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

function Usage({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = Math.min(100, (used / limit) * 100);
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm"><span className="font-semibold">{label}</span><span className="tabular-nums">{mb(used)} / {mb(limit)}</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full ${pct > 80 ? "bg-red" : "bg-green"}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

export default async function AdminHome() {
  await requireViewer("/admin");
  const supabase = await createSupabaseServerClient();
  const { data, error } = supabase ? await supabase.rpc("admin_stats") : { data: null, error: null };
  const s = (data ?? {}) as Record<string, number>;
  const tiles: [string, number | undefined][] = [
    ["Kullanıcı", s.users], ["Son 7 gün yeni üye", s.users_7d], ["Gönderi", s.posts], ["İncelemede gönderi", s.posts_pending],
    ["İncelemede yorum", s.comments_pending], ["Açık şikâyet", s.reports_open], ["Açık itiraz", s.appeals_open], ["Onay bekleyen haber", s.news_pending],
  ];
  return (
    <div className="space-y-5">
      {error && <Alert tone="error">İstatistikler alınamadı.</Alert>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map(([l, v]) => <Card key={l} className="p-4"><p className="text-2xl font-black tabular-nums">{v ?? "—"}</p><p className="text-xs text-fg-muted">{l}</p></Card>)}
      </div>
      <Card className="space-y-4 p-5">
        <h2 className="font-bold">Ücretsiz plan kullanımı (Supabase Free)</h2>
        <Usage label="Veritabanı" used={s.db_bytes ?? 0} limit={FREE_DB_BYTES} />
        <Usage label="Dosya depolama" used={s.storage_bytes ?? 0} limit={FREE_STORAGE_BYTES} />
        <p className="text-xs text-fg-muted">%80&apos;i geçince kırmızıya döner. Sınırlar sağlayıcı tarafından değiştirilebilir; güncel değerleri Supabase panelinden doğrulayın. Trafik (egress) ve aylık aktif kullanıcı sayısı Supabase panelinde izlenir.</p>
      </Card>
    </div>
  );
}
