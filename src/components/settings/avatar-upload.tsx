"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { setAvatarAction } from "@/app/actions/profile";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { validateUpload } from "@/lib/uploads/validate";
import { Avatar, Button } from "@/components/ui";

export function AvatarUpload({ userId, current, name }: { userId: string; current: string | null; name: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const onFile = (file: File | undefined) => {
    if (!file) return;
    const err = validateUpload({ kind: "image", mime: file.type, size: file.size });
    if (err) return setMsg(err);
    start(async () => {
      const supabase = getSupabaseBrowser();
      if (!supabase) return setMsg("Yükleme servisi yapılandırılmadı.");
      const bmp = await createImageBitmap(file);
      const size = 512;
      const s = Math.min(bmp.width, bmp.height);
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      canvas.getContext("2d")!.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.85));
      if (!blob) return setMsg("Görsel işlenemedi.");
      const path = `${userId}/avatar-${crypto.randomUUID()}.webp`;
      const { error } = await supabase.storage.from("avatars").upload(path, blob, { contentType: "image/webp" });
      if (error) return setMsg("Yükleme başarısız.");
      const r = await setAvatarAction(path);
      setMsg(r.ok ? (r.message ?? null) : r.error);
      router.refresh();
    });
  };
  return (
    <div className="flex items-center gap-4">
      <Avatar src={current} name={name} size={72} />
      <div className="space-y-1">
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} aria-label="Profil fotoğrafı seç" />
        <div className="flex gap-2">
          <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => input.current?.click()}>
            <Camera className="h-4 w-4" /> {pending ? "Yükleniyor…" : "Fotoğraf değiştir"}
          </Button>
          {current && (
            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => start(async () => { await setAvatarAction(null); router.refresh(); })}>
              Kaldır
            </Button>
          )}
        </div>
        {msg && <p className="text-xs text-fg-muted">{msg}</p>}
      </div>
    </div>
  );
}
