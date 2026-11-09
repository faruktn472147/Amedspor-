"use client";
import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markNotificationsReadAction, respondFollowRequestAction } from "@/app/actions/profile";
import { Button } from "@/components/ui";

export function MarkRead({ unread }: { unread: number }) {
  const router = useRouter();
  useEffect(() => {
    if (unread > 0) markNotificationsReadAction().then(() => router.refresh());
  }, [unread, router]);
  return null;
}

export function FollowRequestButtons({ requesterId }: { requesterId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={pending} onClick={() => start(async () => { await respondFollowRequestAction(requesterId, true); router.refresh(); })}>Kabul et</Button>
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => { await respondFollowRequestAction(requesterId, false); router.refresh(); })}>Reddet</Button>
    </div>
  );
}
