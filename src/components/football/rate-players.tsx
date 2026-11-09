"use client";
import { useState, useTransition } from "react";
import { ratePlayerAction } from "@/app/actions/games";

export function RatePlayers({ matchId, players }: { matchId: string; players: { id: string; name: string }[] }) {
  const [done, setDone] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      {players.map((p) => (
        <div key={p.id} className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">{p.name}</span>
          {done[p.id] ? (
            <span className="text-sm text-green">Puanın: {done[p.id]}</span>
          ) : (
            <select
              aria-label={`${p.name} için puan`}
              className="h-9 rounded-lg border border-border bg-elevated px-2 text-sm"
              disabled={pending}
              defaultValue=""
              onChange={(e) => {
                const r = Number(e.target.value);
                start(async () => {
                  const res = await ratePlayerAction(matchId, p.id, r);
                  if (res.ok) setDone((d) => ({ ...d, [p.id]: r }));
                  else setMsg(res.error);
                });
              }}
            >
              <option value="" disabled>Puan ver</option>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          )}
        </div>
      ))}
      {msg && <p className="text-xs text-red">{msg}</p>}
    </div>
  );
}
