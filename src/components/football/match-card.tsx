import Link from "next/link";
import { CalendarClock, MapPin, ShieldCheck } from "lucide-react";
import type { Match, Team } from "@/lib/types";
import { formatDateTime, cn } from "@/lib/utils";
import { Badge, Card, LiveBadge } from "@/components/ui";

export const MATCH_STATUS_LABEL: Record<Match["status"], string> = {
  scheduled: "Planlandı",
  live: "Canlı",
  halftime: "Devre arası",
  finished: "Maç sonu",
  postponed: "Ertelendi",
  cancelled: "İptal",
};

function TeamBadge({ team, align }: { team: Team | null; align: "left" | "right" }) {
  const initials = (team?.short_name || team?.name || "?").slice(0, 3).toLocaleUpperCase("tr-TR");
  return (
    <div className={cn("flex min-w-0 flex-1 flex-col items-center gap-2 text-center")}>
      <span
        className={cn(
          "flex h-14 w-14 items-center justify-center rounded-2xl text-sm font-black",
          team?.is_amedspor ? "brand-gradient text-white" : "bg-muted text-fg",
        )}
        aria-hidden
      >
        {initials}
      </span>
      <span className={cn("line-clamp-2 text-sm font-bold leading-tight", align === "left" ? "" : "")}>{team?.name ?? "—"}</span>
    </div>
  );
}

export function MatchCard({ match, compact = false, label }: { match: Match; compact?: boolean; label?: string }) {
  const live = match.status === "live" || match.status === "halftime";
  const hasScore = match.home_score != null && match.away_score != null;
  return (
    <Link href={`/maclar/${match.id}`} className="block">
      <Card className={cn("relative overflow-hidden transition hover:-translate-y-0.5", live && "ring-2 ring-live/60")}>
        <div className="flex items-center justify-between px-4 pt-3 text-xs text-fg-muted">
          <span className="font-semibold">{label ?? match.competition}</span>
          {live ? (
            <LiveBadge label={match.status === "halftime" ? "Devre arası" : `Canlı ${match.minute ?? ""}'`} />
          ) : (
            <Badge tone={match.status === "finished" ? "neutral" : match.status === "scheduled" ? "green" : "amber"}>{MATCH_STATUS_LABEL[match.status]}</Badge>
          )}
        </div>
        <div className={cn("flex items-center gap-2 px-4", compact ? "py-3" : "py-5")}>
          <TeamBadge team={match.home} align="left" />
          <div className="flex w-24 shrink-0 flex-col items-center">
            {hasScore && match.status !== "scheduled" ? (
              <span className="text-3xl font-black tabular-nums tracking-tight">
                {match.home_score}<span className="mx-1 text-fg-muted">-</span>{match.away_score}
              </span>
            ) : (
              <span className="text-lg font-bold text-fg-muted">vs</span>
            )}
          </div>
          <TeamBadge team={match.away} align="right" />
        </div>
        {!compact && (
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-border px-4 py-2.5 text-xs text-fg-muted">
            <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />{formatDateTime(match.kickoff_at)}</span>
            {match.venue && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{match.venue}</span>}
            {match.verified ? (
              <span className="inline-flex items-center gap-1 text-green"><ShieldCheck className="h-3.5 w-3.5" />Kaynak: {match.source_name}</span>
            ) : (
              <span>Veri doğrulanmadı</span>
            )}
          </div>
        )}
      </Card>
    </Link>
  );
}
