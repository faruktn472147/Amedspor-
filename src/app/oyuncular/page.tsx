import Link from "next/link";
import { Shirt } from "lucide-react";
import { getPlayers } from "@/lib/data/content";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { Avatar, Card, EmptyState, PageHeader, SetupNotice } from "@/components/ui";

export const metadata = { title: "Oyuncular" };
const ORDER = ["Kaleci", "Defans", "Orta Saha", "Forvet"];

export default async function PlayersPage() {
  const players = await getPlayers();
  const groups = ORDER.map((pos) => ({ pos, list: players.filter((p) => p.position === pos) })).filter((g) => g.list.length);
  const other = players.filter((p) => !p.position || !ORDER.includes(p.position));
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Oyuncular" description="Güncel kadro, forma numaraları ve sezon istatistikleri (kaynaklı)." />
      {!isSupabaseConfigured() && <SetupNotice feature="Oyuncu merkezi" />}
      {players.length === 0 ? (
        <EmptyState icon={<Shirt className="h-10 w-10" />} title="Kadro bilgisi henüz girilmedi" description="Oyuncu bilgileri doğrulanabilir kaynaklardan girildiğinde görünür." />
      ) : (
        [...groups, ...(other.length ? [{ pos: "Diğer", list: other }] : [])].map((g) => (
          <section key={g.pos} className="mb-6">
            <h2 className="mb-3 text-lg font-bold">{g.pos}</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {g.list.map((p) => (
                <Link key={p.id} href={`/oyuncular/${p.slug}`}>
                  <Card className="relative overflow-hidden p-4 transition hover:-translate-y-0.5">
                    <span className="absolute right-3 top-2 text-4xl font-black text-fg/10 tabular-nums">{p.shirt_number ?? ""}</span>
                    <Avatar src={p.photo_url} name={p.full_name} size={64} />
                    <p className="mt-3 font-bold leading-tight">{p.full_name}</p>
                    <p className="text-xs text-fg-muted">{p.position ?? "Mevki bilgisi yok"}{p.nationality ? ` · ${p.nationality}` : ""}</p>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
