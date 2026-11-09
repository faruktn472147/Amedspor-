import { notFound } from "next/navigation";
import { ExternalLink, Star } from "lucide-react";
import { getPlayer } from "@/lib/data/content";
import { Ad } from "@/components/ads/ad";
import { Avatar, Card, EmptyState, SectionHeader } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/utils";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const d = await getPlayer(slug);
  return { title: d?.player.full_name ?? "Oyuncu" };
}

export default async function PlayerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const d = await getPlayer(slug);
  if (!d) notFound();
  const { player: p, stats, fanRating } = d;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card className="brand-gradient relative overflow-hidden p-6 text-white">
        <span className="absolute -right-2 -top-6 text-[140px] font-black leading-none text-white/10 tabular-nums">{p.shirt_number ?? ""}</span>
        <div className="relative flex items-center gap-5">
          <Avatar src={p.photo_url} name={p.full_name} size={96} className="ring-4 ring-white/30" />
          <div>
            <h1 className="text-2xl font-extrabold">{p.full_name}</h1>
            <p className="text-white/85">{p.position ?? "Mevki bilgisi yok"}{p.shirt_number ? ` · #${p.shirt_number}` : ""}</p>
            <p className="text-sm text-white/75">{p.nationality ?? ""}{p.birth_date ? ` · ${formatDate(p.birth_date)}` : ""}</p>
          </div>
        </div>
        {p.photo_credit && <p className="relative mt-3 text-[11px] text-white/70">Fotoğraf: {p.photo_credit}</p>}
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(["appearances", "goals", "assists", "minutes"] as const).map((k) => {
          const total = stats.reduce((a, s) => a + (s[k] ?? 0), 0);
          const label = { appearances: "Maç", goals: "Gol", assists: "Asist", minutes: "Dakika" }[k];
          return (
            <Card key={k} className="p-4 text-center">
              <p className="text-2xl font-black tabular-nums">{stats.length ? total : "—"}</p>
              <p className="text-xs text-fg-muted">{label}</p>
            </Card>
          );
        })}
      </div>

      <Card className="flex items-center justify-between p-4">
        <span className="flex items-center gap-2 font-semibold"><Star className="h-5 w-5 text-amber-500" /> Taraftar puanı</span>
        <span className="text-lg font-extrabold">{fanRating ? `${fanRating.avg.toFixed(1)} / 10` : "Henüz oy yok"}{fanRating && <span className="ml-1 text-sm font-normal text-fg-muted">({fanRating.count} oy)</span>}</span>
      </Card>

      <section>
        <SectionHeader title="Sezon istatistikleri" />
        {stats.length ? (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-fg-muted"><tr>{["Sezon", "Turnuva", "Maç", "Dk", "Gol", "Ast", "Sarı", "Kırmızı"].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-border">
                {stats.map((s) => (
                  <tr key={s.season + s.competition}>
                    <td className="px-3 py-2">{s.season}</td><td className="px-3 py-2">{s.competition}</td>
                    <td className="px-3 py-2 tabular-nums">{s.appearances}</td><td className="px-3 py-2 tabular-nums">{s.minutes}</td>
                    <td className="px-3 py-2 font-bold tabular-nums">{s.goals}</td><td className="px-3 py-2 tabular-nums">{s.assists}</td>
                    <td className="px-3 py-2 tabular-nums">{s.yellow_cards}</td><td className="px-3 py-2 tabular-nums">{s.red_cards}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-3 py-2 text-[11px] text-fg-muted">Kaynak: {stats[0].source_url ? <a href={stats[0].source_url} className="underline" target="_blank" rel="noopener noreferrer">{stats[0].source_name}</a> : stats[0].source_name}</p>
          </Card>
        ) : (
          <EmptyState title="İstatistik verisi yok" description="Kaynağı doğrulanmış istatistikler girildiğinde burada görünür." />
        )}
      </section>

      {p.career.length > 0 && (
        <section>
          <SectionHeader title="Kariyer" />
          <Card className="divide-y divide-border">{p.career.map((c, i) => <div key={i} className="flex justify-between px-4 py-2.5 text-sm"><span className="font-semibold">{c.club}</span><span className="text-fg-muted">{c.from ?? "?"} – {c.to ?? "…"}</span></div>)}</Card>
        </section>
      )}
      {p.bio && <Card className="whitespace-pre-wrap p-4 text-[15px] leading-relaxed">{p.bio}</Card>}
      <p className="text-xs text-fg-muted">
        Son güncelleme: {formatDateTime(p.updated_at)}{p.source_name && <> · Kaynak: {p.source_url ? <a href={p.source_url} target="_blank" rel="noopener noreferrer" className="underline">{p.source_name} <ExternalLink className="inline h-3 w-3" /></a> : p.source_name}</>}
      </p>
      <Ad placement="player_profile" variant="compact" />
    </div>
  );
}
