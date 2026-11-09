import Link from "next/link";
import { Brain, Medal, Target } from "lucide-react";
import { getViewer } from "@/lib/auth";
import { getLeaderboard, getMatches, getMyPrediction, getMyPredictions, getPlayers, getTodayQuiz } from "@/lib/data/content";
import { PredictionForm } from "@/components/games/prediction-form";
import { QuizCard } from "@/components/games/quiz-card";
import { Alert, Avatar, Card, EmptyState, LinkButton, PageHeader, SectionHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Tahmin & Oyunlar" };

export default async function GamesPage({ searchParams }: { searchParams: Promise<{ mac?: string }> }) {
  const { mac } = await searchParams;
  const [viewer, upcoming, players, quiz, leaders, mine] = await Promise.all([getViewer(), getMatches("upcoming", 5), getPlayers(), getTodayQuiz(), getLeaderboard(20), getMyPredictions()]);
  const target = upcoming.find((m) => m.id === mac) ?? upcoming[0];
  const myPred = target && viewer ? await getMyPrediction(target.id) : null;
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader title="Tahmin & Oyunlar" description="Skor tahmini, günlük bilgi yarışması, rozetler ve liderlik tablosu." />
      <Alert tone="info">Bu oyunlar yalnızca eğlence içindir. <b>Gerçek para, bahis, para yatırma/çekme veya nakit ödül yoktur.</b></Alert>

      <section>
        <SectionHeader title="Maç tahmini" icon={<Target className="h-5 w-5 text-red" />} />
        {target ? (
          <Card className="p-5">
            <p className="mb-1 text-center text-xs text-fg-muted">{target.competition} · {formatDateTime(target.kickoff_at)}</p>
            <p className="mb-4 text-center text-xs text-fg-muted">Tahminler maç başlayınca kilitlenir.</p>
            {viewer ? (
              <PredictionForm matchId={target.id} homeName={target.home?.name ?? "Ev sahibi"} awayName={target.away?.name ?? "Deplasman"} players={players.map((p) => ({ id: p.id, full_name: p.full_name }))} initial={myPred} />
            ) : (
              <div className="text-center"><LinkButton href={`/giris?next=/tahminler`}>Tahmin yapmak için giriş yap</LinkButton></div>
            )}
            {upcoming.length > 1 && (
              <div className="mt-4 flex flex-wrap justify-center gap-2 border-t border-border pt-4">
                {upcoming.map((m) => <Link key={m.id} href={`/tahminler?mac=${m.id}`} className={`rounded-full px-3 py-1 text-xs font-semibold ${m.id === target.id ? "bg-fg text-bg" : "bg-muted"}`}>{m.home?.short_name ?? m.home?.name} – {m.away?.short_name ?? m.away?.name}</Link>)}
              </div>
            )}
          </Card>
        ) : (
          <EmptyState title="Tahmine açık maç yok" description="Bir sonraki maç fikstüre eklendiğinde tahmin açılır." />
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section id="yarisma">
          <SectionHeader title="Günlük bilgi yarışması" icon={<Brain className="h-5 w-5 text-green" />} />
          <Card className="p-5">{quiz ? <QuizCard quiz={quiz.quiz} answered={quiz.answer} signedIn={!!viewer} /> : <p className="text-sm text-fg-muted">Bugünün sorusu henüz eklenmedi.</p>}</Card>
        </section>
        <section>
          <SectionHeader title="Liderlik tablosu" icon={<Medal className="h-5 w-5 text-amber-500" />} />
          {leaders.length ? (
            <Card className="divide-y divide-border">
              {leaders.map((l) => (
                <Link key={l.user_id} href={`/u/${l.username}`} className={`flex items-center gap-3 px-4 py-2.5 hover:bg-muted ${l.user_id === viewer?.user.id ? "bg-green/10" : ""}`}>
                  <span className="w-6 text-center font-black tabular-nums text-fg-muted">{l.rank}</span>
                  <Avatar src={l.avatar_url} name={l.display_name || l.username} size={32} />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">@{l.username}</span>
                  <span className="text-sm font-bold tabular-nums">{l.points} p</span>
                </Link>
              ))}
            </Card>
          ) : (
            <EmptyState title="Henüz puan kazanan yok" description="İlk tahminini yap, listeye gir." />
          )}
        </section>
      </div>

      {viewer && mine.length > 0 && (
        <section>
          <SectionHeader title="Tahminlerim" />
          <Card className="divide-y divide-border">
            {mine.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span>{p.match?.home?.name} – {p.match?.away?.name}</span>
                <span className="tabular-nums">Tahmin <b>{p.home_score}-{p.away_score}</b>{p.match?.status === "finished" && <> · Sonuç <b>{p.match.home_score}-{p.match.away_score}</b></>} · {p.points == null ? "bekliyor" : `${p.points} puan`}</span>
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
