"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { votePollAction } from "@/app/actions/social";
import type { PollOption } from "@/lib/types";
import { cn } from "@/lib/utils";

export function Poll({ postId, options, myVote, signedIn }: { postId: string; options: PollOption[]; myVote: string | null; signedIn: boolean }) {
  const [vote, setVote] = useState(myVote);
  const [opts, setOpts] = useState(options);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const total = opts.reduce((a, o) => a + o.vote_count, 0);
  return (
    <div className="space-y-2 px-4 pb-3" role="group" aria-label="Anket">
      {opts.map((o) => {
        const pct = total ? Math.round((o.vote_count / total) * 100) : 0;
        return (
          <button
            key={o.id}
            type="button"
            disabled={!!vote || pending}
            onClick={() => {
              if (!signedIn) return router.push(`/giris?next=/gonderi/${postId}`);
              start(async () => {
                const r = await votePollAction(postId, o.id);
                if (r.ok) {
                  setVote(o.id);
                  setOpts((p) => p.map((x) => (x.id === o.id ? { ...x, vote_count: x.vote_count + 1 } : x)));
                } else setErr(r.error);
              });
            }}
            className={cn("relative w-full overflow-hidden rounded-xl border px-3 py-2.5 text-left text-sm font-semibold", vote === o.id ? "border-green" : "border-border hover:bg-muted")}
          >
            {vote && <span className="absolute inset-y-0 left-0 bg-green/15" style={{ width: `${pct}%` }} aria-hidden />}
            <span className="relative flex justify-between">
              <span>{o.label}</span>
              {vote && <span className="tabular-nums">%{pct}</span>}
            </span>
          </button>
        );
      })}
      <p className="text-xs text-fg-muted">{total} oy{err && <span className="ml-2 text-red">{err}</span>}</p>
    </div>
  );
}
