import { CalendarDays } from "lucide-react";
import { getMatches } from "@/lib/data/content";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { Ad } from "@/components/ads/ad";
import { MatchCard } from "@/components/football/match-card";
import { EmptyState, PageHeader, SectionHeader, SetupNotice } from "@/components/ui";

export const metadata = { title: "Maç Merkezi" };

export default async function MatchesPage() {
  const [live, upcoming, past] = await Promise.all([getMatches("live", 5), getMatches("upcoming", 10), getMatches("past", 10)]);
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader title="Maç Merkezi" description="Fikstür, canlı skor, goller, kartlar ve kadrolar. Veriler kaynağıyla gösterilir; eksik veri uydurulmaz." />
      {!isSupabaseConfigured() && <SetupNotice feature="Maç merkezi" />}
      {live.length > 0 && (
        <section><SectionHeader title="Şu an oynanıyor" /><div className="grid gap-3 md:grid-cols-2">{live.map((m) => <MatchCard key={m.id} match={m} />)}</div></section>
      )}
      <section>
        <SectionHeader title="Yaklaşan maçlar" />
        {upcoming.length ? <div className="grid gap-3 md:grid-cols-2">{upcoming.map((m) => <MatchCard key={m.id} match={m} />)}</div> : <EmptyState icon={<CalendarDays className="h-9 w-9" />} title="Planlanmış maç bilgisi yok" />}
      </section>
      <Ad placement="match_center" variant="compact" />
      <section>
        <SectionHeader title="Sonuçlar" />
        {past.length ? <div className="grid gap-3 md:grid-cols-2">{past.map((m) => <MatchCard key={m.id} match={m} compact />)}</div> : <EmptyState title="Henüz sonuç girilmedi" />}
      </section>
    </div>
  );
}
