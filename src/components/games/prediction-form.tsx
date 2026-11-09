"use client";
import { useState, useTransition } from "react";
import { Minus, Plus } from "lucide-react";
import { savePredictionAction } from "@/app/actions/games";
import { Alert, Button, Select } from "@/components/ui";

function Stepper({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      <button type="button" aria-label={`${label} azalt`} className="h-9 w-9 rounded-full bg-muted" onClick={() => onChange(Math.max(0, value - 1))}><Minus className="mx-auto h-4 w-4" /></button>
      <span className="w-8 text-center text-2xl font-black tabular-nums" aria-live="polite">{value}</span>
      <button type="button" aria-label={`${label} artır`} className="h-9 w-9 rounded-full bg-muted" onClick={() => onChange(Math.min(20, value + 1))}><Plus className="mx-auto h-4 w-4" /></button>
    </div>
  );
}

export function PredictionForm({
  matchId,
  homeName,
  awayName,
  players,
  initial,
}: {
  matchId: string;
  homeName: string;
  awayName: string;
  players: { id: string; full_name: string }[];
  initial: { home_score: number; away_score: number; first_scorer_id: string | null; motm_player_id: string | null } | null;
}) {
  const [home, setHome] = useState(initial?.home_score ?? 0);
  const [away, setAway] = useState(initial?.away_score ?? 0);
  const [scorer, setScorer] = useState(initial?.first_scorer_id ?? "");
  const [motm, setMotm] = useState(initial?.motm_player_id ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-1 flex-col items-center gap-2"><span className="text-sm font-bold">{homeName}</span><Stepper value={home} onChange={setHome} label={`${homeName} golü`} /></div>
        <span className="text-fg-muted">–</span>
        <div className="flex flex-1 flex-col items-center gap-2"><span className="text-sm font-bold">{awayName}</span><Stepper value={away} onChange={setAway} label={`${awayName} golü`} /></div>
      </div>
      {players.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold">İlk golü atan (Amedspor)
            <Select value={scorer} onChange={(e) => setScorer(e.target.value)} className="mt-1"><option value="">Seçme</option>{players.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</Select>
          </label>
          <label className="text-sm font-semibold">Maçın oyuncusu
            <Select value={motm} onChange={(e) => setMotm(e.target.value)} className="mt-1"><option value="">Seçme</option>{players.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</Select>
          </label>
        </div>
      )}
      {msg && <Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert>}
      <Button className="w-full" disabled={pending} onClick={() => start(async () => {
        const r = await savePredictionAction(matchId, home, away, scorer || null, motm || null);
        setMsg(r.ok ? { ok: true, text: r.message ?? "Kaydedildi" } : { ok: false, text: r.error });
      })}>
        {initial ? "Tahmini güncelle" : "Tahmini kaydet"}
      </Button>
      <p className="text-center text-xs text-fg-muted">Puanlama: tam skor 5 · doğru sonuç 2 · ilk golcü 2 · maçın oyuncusu 1</p>
    </div>
  );
}
