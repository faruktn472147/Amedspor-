"use client";
import { useState, useTransition } from "react";
import { answerQuizAction } from "@/app/actions/games";
import { cn } from "@/lib/utils";

export function QuizCard({ quiz, answered, signedIn }: { quiz: { id: string; question: string; options: string[]; points: number; source_url: string | null }; answered: { answer_index: number; is_correct: boolean } | null; signedIn: boolean }) {
  const [result, setResult] = useState(answered);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <p className="text-lg font-bold">{quiz.question}</p>
      <div className="mt-3 grid gap-2">
        {quiz.options.map((o, i) => (
          <button
            key={i}
            type="button"
            disabled={!!result || pending || !signedIn}
            onClick={() => start(async () => {
              const r = await answerQuizAction(quiz.id, i);
              if (r.ok) setResult({ answer_index: i, is_correct: !!r.data?.correct });
              else setErr(r.error);
            })}
            className={cn(
              "rounded-xl border px-4 py-3 text-left text-sm font-semibold",
              result?.answer_index === i ? (result.is_correct ? "border-green bg-green/10 text-green" : "border-red bg-red/10 text-red") : "border-border hover:bg-muted",
            )}
          >
            {o}
          </button>
        ))}
      </div>
      {result && <p className={cn("mt-3 text-sm font-semibold", result.is_correct ? "text-green" : "text-red")}>{result.is_correct ? `Doğru! +${quiz.points} puan` : "Bu sefer olmadı. Yarın yeni soru var."}</p>}
      {!signedIn && <p className="mt-3 text-sm text-fg-muted">Cevaplamak için giriş yap.</p>}
      {err && <p className="mt-2 text-sm text-red">{err}</p>}
      {quiz.source_url && <a href={quiz.source_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs text-fg-muted underline">Kaynak</a>}
    </div>
  );
}
