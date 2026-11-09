import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftRight, CircleDot, ExternalLink, Square } from "lucide-react";
import { getMatch } from "@/lib/data/content";
import { getViewer } from "@/lib/auth";
import { Ad } from "@/components/ads/ad";
import { LiveRefresh } from "@/components/football/live-refresh";
import { MatchCard } from "@/components/football/match-card";
import { RatePlayers } from "@/components/football/rate-players";
import { Card, EmptyState, LinkButton, SectionHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Maç detayı" };

const EVENT: Record<string, { label: string; icon: React.ReactNode }> = {
  goal: { label: "Gol", icon: <CircleDot className="h-4 w-4 text-green" /> },
  penalty_goal: { label: "Penaltı golü", icon: <CircleDot className="h-4 w-4 text-green" /> },
  own_goal: { label: "Kendi kalesine", icon: <CircleDot className="h-4 w-4 text-red" /> },
  penalty_miss: { label: "Kaçan penaltı", icon: <CircleDot className="h-4 w-4 text-fg-muted" /> },
  yellow: { label: "Sarı kart", icon: <Square className="h-4 w-4 fill-amber-400 text-amber-400" /> },
  second_yellow: { label: "İkinci sarı", icon: <Square className="h-4 w-4 fill-red text-red" /> },
  red: { label: "Kırmızı kart", icon: <Square className="h-4 w-4 fill-red text-red" /> },
  substitution: { label: "Oyuncu değişikliği", icon: <ArrowLeftRight className="h-4 w-4 text-fg-muted" /> },
  var: { label: "VAR", icon: <CircleDot className="h-4 w-4 text-fg-muted" /> },
  note: { label: "Not", icon: <CircleDot className="h-4 w-4 text-fg-muted" /> },
};

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, viewer] = await Promise.all([getMatch(id), getViewer()]);
  if (!data) notFound();
  const { match: m, events, lineups } = data;
  const live = m.status === "live" || m.status === "halftime";
  const side = (teamId: string | null | undefined) => lineups.filter((l) => l.team_id === teamId);
  const stats = Object.entries(m.stats ?? {});
  const amedId = m.home?.is_amedspor ? m.home.id : m.away?.is_amedspor ? m.away.id : null;
  const ratable = lineups.filter((l) => l.team_id === amedId && l.player).map((l) => ({ id: l.player_id, name: l.player!.full_name }));
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {live && <LiveRefresh />}
      <MatchCard match={m} />
      <p className="text-center text-xs text-fg-muted">
        Son güncelleme: {formatDateTime(m.updated_at)} ·{" "}
        {m.source_url ? <a href={m.source_url} target="_blank" rel="noopener noreferrer" className="underline">Kaynak: {m.source_name} <ExternalLink className="inline h-3 w-3" /></a> : m.source_name ? `Kaynak: ${m.source_name}` : "Kaynak belirtilmedi"}
      </p>
      {m.status === "scheduled" && new Date(m.kickoff_at) > new Date() && (
        <div className="flex justify-center"><LinkButton href={`/tahminler?mac=${m.id}`}>Skor tahmini yap</LinkButton></div>
      )}

      <section>
        <SectionHeader title="Maç olayları" />
        {events.length ? (
          <Card className="divide-y divide-border">
            {events.map((e) => {
              const isHome = e.team_id === m.home?.id;
              const ev = EVENT[e.type] ?? EVENT.note;
              return (
                <div key={e.id} className={`flex items-center gap-3 px-4 py-2.5 ${isHome ? "" : "flex-row-reverse text-right"}`}>
                  <span className="w-10 shrink-0 text-center text-sm font-bold tabular-nums">{e.minute}{e.extra_minute ? `+${e.extra_minute}` : ""}&apos;</span>
                  {ev.icon}
                  <span className="text-sm"><b>{e.player_name ?? ev.label}</b>{e.detail && <span className="text-fg-muted"> · {e.detail}</span>}</span>
                </div>
              );
            })}
          </Card>
        ) : (
          <EmptyState title={m.status === "scheduled" ? "Maç henüz başlamadı" : "Olay verisi girilmedi"} />
        )}
      </section>

      <Ad placement="match_center" variant="compact" />

      <section>
        <SectionHeader title="Kadrolar" />
        {lineups.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {[m.home, m.away].map((t) => (
              <Card key={t?.id} className="p-4">
                <p className="mb-2 font-bold">{t?.name}</p>
                <p className="text-xs font-semibold uppercase text-fg-muted">İlk 11</p>
                <ul className="mb-3 mt-1 space-y-1 text-sm">
                  {side(t?.id).filter((l) => l.is_starter).map((l) => (
                    <li key={l.player_id}><span className="inline-block w-6 tabular-nums text-fg-muted">{l.shirt_number}</span>{l.player ? <Link href={`/oyuncular/${l.player.slug}`} className="hover:underline">{l.player.full_name}</Link> : "—"}</li>
                  ))}
                </ul>
                <p className="text-xs font-semibold uppercase text-fg-muted">Yedekler</p>
                <ul className="mt-1 space-y-1 text-sm text-fg-muted">
                  {side(t?.id).filter((l) => !l.is_starter).map((l) => <li key={l.player_id}><span className="inline-block w-6 tabular-nums">{l.shirt_number}</span>{l.player?.full_name}</li>)}
                </ul>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState title="Kadro bilgisi henüz açıklanmadı" />
        )}
      </section>

      <section>
        <SectionHeader title="Maç istatistikleri" />
        {stats.length ? (
          <Card className="space-y-3 p-4">
            {stats.map(([k, [h, a]]) => {
              const total = h + a || 1;
              return (
                <div key={k}>
                  <div className="mb-1 flex justify-between text-sm"><b className="tabular-nums">{h}</b><span className="text-fg-muted">{k}</span><b className="tabular-nums">{a}</b></div>
                  <div className="flex h-2 overflow-hidden rounded-full bg-muted"><span className="bg-red" style={{ width: `${(h / total) * 100}%` }} /><span className="ml-auto bg-green" style={{ width: `${(a / total) * 100}%` }} /></div>
                </div>
              );
            })}
          </Card>
        ) : (
          <EmptyState title="İstatistik verisi yok" />
        )}
      </section>

      {ratable.length > 0 && m.status !== "scheduled" && (
        <section>
          <SectionHeader title="Oyunculara puan ver" />
          <Card className="p-4">{viewer ? <RatePlayers matchId={m.id} players={ratable} /> : <p className="text-sm">Puan vermek için <Link href="/giris" className="font-semibold text-green">giriş yap</Link>.</p>}</Card>
        </section>
      )}
    </div>
  );
}
