"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { blockAction, followAction, muteAction, unfollowAction } from "@/app/actions/profile";
import { Button } from "@/components/ui";
import { ReportButton } from "./report-button";

export function ProfileActions({
  targetId,
  isFollowing,
  requested,
  blocked,
  muted,
  signedIn,
}: {
  targetId: string;
  isFollowing: boolean;
  requested: boolean;
  blocked: boolean;
  muted: boolean;
  signedIn: boolean;
}) {
  const [state, setState] = useState<"none" | "following" | "requested">(isFollowing ? "following" : requested ? "requested" : "none");
  const [menu, setMenu] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!signedIn)
    return (
      <Button onClick={() => router.push("/giris")} className="flex-1">
        Takip et
      </Button>
    );
  if (blocked)
    return (
      <Button variant="outline" disabled={pending} onClick={() => start(async () => { await blockAction(targetId, false); router.refresh(); })}>
        Engeli kaldır
      </Button>
    );
  return (
    <div className="flex flex-1 items-center gap-2">
      <Button
        className="flex-1"
        variant={state === "none" ? "primary" : "secondary"}
        disabled={pending}
        onClick={() =>
          start(async () => {
            if (state === "none") {
              const r = await followAction(targetId);
              if (r.ok) setState(r.data?.state ?? "following");
              else setMsg(r.error);
            } else {
              const r = await unfollowAction(targetId);
              if (r.ok) setState("none");
            }
            router.refresh();
          })
        }
      >
        {state === "following" ? "Takibi bırak" : state === "requested" ? "İstek gönderildi" : "Takip et"}
      </Button>
      <div className="relative">
        <Button variant="secondary" size="icon" aria-label="Diğer seçenekler" onClick={() => setMenu((m) => !m)}>
          <MoreHorizontal className="h-5 w-5" />
        </Button>
        {menu && (
          <div className="absolute right-0 z-20 mt-1 w-52 rounded-xl border border-border bg-elevated p-1 shadow-xl">
            <button type="button" className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => start(async () => { const r = await muteAction(targetId, !muted); setMsg(r.ok ? r.message ?? null : r.error); setMenu(false); router.refresh(); })}>
              {muted ? "Sessizden çıkar" : "Sessize al"}
            </button>
            <button
              type="button"
              className="w-full rounded-lg px-3 py-2 text-left text-sm text-red hover:bg-muted"
              onClick={() => {
                if (!confirm("Bu kullanıcıyı engellemek istiyor musun? Karşılıklı takip kaldırılır ve birbirinizin içeriğini göremezsiniz.")) return;
                start(async () => { await blockAction(targetId, true); router.refresh(); });
              }}
            >
              Engelle
            </button>
            <div className="px-3 py-2"><ReportButton targetType="profile" targetId={targetId} label="Profili şikâyet et" /></div>
          </div>
        )}
      </div>
      {msg && <p className="text-xs text-fg-muted">{msg}</p>}
    </div>
  );
}
