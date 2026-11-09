"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, Clapperboard, ImagePlus, Loader2, Type, X } from "lucide-react";
import { createPostAction, type CreatePostInput } from "@/app/actions/social";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { buildStoragePath, UPLOAD_LIMITS, validateUpload } from "@/lib/uploads/validate";
import { Alert, Button, Input, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";

type Mode = "post" | "photo" | "short" | "poll";
type Pending = { file: File; preview: string; kind: "image" | "video"; width?: number; height?: number; duration?: number; poster?: Blob };

async function compressImage(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const bmp = await createImageBitmap(file);
  const max = UPLOAD_LIMITS.image.targetDimension;
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  // Yeniden kodlama, görseldeki EXIF/konum bilgisini de temizler (gizlilik).
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("sıkıştırma"))), "image/webp", 0.82));
  return { blob, width: w, height: h };
}

function readVideoMeta(file: File): Promise<{ duration: number; width: number; height: number; poster: Blob | undefined }> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.playsInline = true;
    v.src = URL.createObjectURL(file);
    v.onloadedmetadata = () => {
      v.currentTime = Math.min(1, v.duration / 2);
    };
    v.onseeked = () => {
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight));
      canvas.width = Math.round(v.videoWidth * scale);
      canvas.height = Math.round(v.videoHeight * scale);
      canvas.getContext("2d")!.drawImage(v, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (b) => resolve({ duration: v.duration, width: v.videoWidth, height: v.videoHeight, poster: b ?? undefined }),
        "image/webp",
        0.75,
      );
    };
    v.onerror = () => reject(new Error("Video okunamadı. MP4 (H.264) biçimini dene."));
  });
}

export function Composer({ userId, initialMode = "post" }: { userId: string; initialMode?: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<Pending[]>([]);
  const [options, setOptions] = useState(["", ""]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const pick = async (list: FileList | null) => {
    if (!list) return;
    setError(null);
    const next: Pending[] = [];
    for (const file of Array.from(list)) {
      if (mode === "short") {
        try {
          const meta = await readVideoMeta(file);
          const err = validateUpload({ kind: "video", mime: file.type, size: file.size, durationSeconds: meta.duration, width: meta.width, height: meta.height });
          if (err) return setError(err);
          next.push({ file, preview: URL.createObjectURL(file), kind: "video", ...meta });
        } catch (e) {
          return setError((e as Error).message);
        }
      } else {
        const err = validateUpload({ kind: "image", mime: file.type, size: Math.min(file.size, UPLOAD_LIMITS.image.maxBytes) });
        if (err) return setError(err);
        next.push({ file, preview: URL.createObjectURL(file), kind: "image" });
      }
    }
    setFiles((f) => (mode === "short" ? next.slice(0, 1) : [...f, ...next].slice(0, UPLOAD_LIMITS.maxImagesPerPost)));
  };

  const submit = () =>
    start(async () => {
      setError(null);
      setNotice(null);
      const supabase = getSupabaseBrowser();
      const media: CreatePostInput["media"] = [];
      if (files.length) {
        if (!supabase) return setError("Yükleme servisi yapılandırılmadı.");
        for (const [i, p] of files.entries()) {
          setProgress(`Yükleniyor ${i + 1}/${files.length}…`);
          let blob: Blob = p.file;
          let mime = p.file.type;
          let width = p.width;
          let height = p.height;
          if (p.kind === "image") {
            const c = await compressImage(p.file);
            blob = c.blob;
            mime = "image/webp";
            width = c.width;
            height = c.height;
          }
          const path = buildStoragePath(userId, mime, crypto.randomUUID());
          const { error: upErr } = await supabase.storage.from("media").upload(path, blob, { contentType: mime, upsert: false });
          if (upErr) {
            setProgress(null);
            return setError("Dosya yüklenemedi. Boyut sınırını aşmış olabilir.");
          }
          let posterPath: string | undefined;
          if (p.poster) {
            posterPath = buildStoragePath(userId, "image/webp", crypto.randomUUID());
            await supabase.storage.from("media").upload(posterPath, p.poster, { contentType: "image/webp" });
          }
          media.push({ path, mime, size: blob.size, width, height, duration: p.duration, posterPath });
        }
      }
      setProgress(null);
      const kind = mode === "short" ? "short" : mode === "poll" ? "poll" : "post";
      const r = await createPostAction({ kind, body, media, pollOptions: mode === "poll" ? options.filter((o) => o.trim()) : undefined });
      if (!r.ok) return setError(r.error);
      setBody("");
      setFiles([]);
      setOptions(["", ""]);
      if (r.data?.status === "approved") router.push(kind === "short" ? "/shorts" : `/gonderi/${r.data.id}`);
      else setNotice(r.message ?? "Gönderin incelemeye alındı.");
    });

  const tabs: [Mode, string, typeof Type][] = [
    ["post", "Yazı", Type],
    ["photo", "Fotoğraf", ImagePlus],
    ["short", "Shorts", Clapperboard],
    ["poll", "Anket", BarChart3],
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-1 rounded-xl bg-muted p-1" role="tablist">
        {tabs.map(([m, label, Icon]) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            type="button"
            onClick={() => {
              setMode(m);
              setFiles([]);
              setError(null);
            }}
            className={cn("flex h-10 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold", mode === m ? "bg-elevated shadow" : "text-fg-muted")}
          >
            <Icon className="h-4 w-4" /> <span className="hidden sm:inline">{label}</span>
            <span className="sm:hidden">{label}</span>
          </button>
        ))}
      </div>

      <Textarea
        rows={mode === "post" ? 6 : 3}
        maxLength={2200}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={mode === "poll" ? "Anket sorunu yaz…" : mode === "short" ? "Video açıklaması…" : "Taraftarlara ne söylemek istersin?"}
        aria-label="Gönderi metni"
      />
      <p className="-mt-2 text-right text-xs text-fg-muted">{body.length}/2200</p>

      {mode === "poll" && (
        <div className="space-y-2">
          {options.map((o, i) => (
            <Input key={i} value={o} maxLength={80} placeholder={`Seçenek ${i + 1}`} onChange={(e) => setOptions((p) => p.map((x, j) => (j === i ? e.target.value : x)))} />
          ))}
          {options.length < 4 && (
            <button type="button" className="text-sm font-semibold text-green" onClick={() => setOptions((p) => [...p, ""])}>
              + Seçenek ekle
            </button>
          )}
        </div>
      )}

      {(mode === "photo" || mode === "short") && (
        <div>
          <input
            ref={input}
            type="file"
            className="sr-only"
            accept={mode === "short" ? "video/mp4,video/webm" : "image/jpeg,image/png,image/webp"}
            multiple={mode === "photo"}
            onChange={(e) => pick(e.target.files)}
            aria-label={mode === "short" ? "Video seç" : "Fotoğraf seç"}
          />
          <button type="button" onClick={() => input.current?.click()} className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border py-8 text-fg-muted hover:bg-muted">
            {mode === "short" ? <Clapperboard className="h-8 w-8" /> : <ImagePlus className="h-8 w-8" />}
            <span className="text-sm font-semibold">{mode === "short" ? "Dikey video seç (en fazla 60 sn, 50 MB, 1080×1920)" : "Fotoğraf seç (en fazla 10)"}</span>
          </button>
          {files.length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {files.map((f, i) => (
                <div key={f.preview} className={cn("relative overflow-hidden rounded-xl bg-black", f.kind === "video" ? "col-span-3 aspect-[9/16] max-h-96" : "aspect-square")}>
                  {f.kind === "video" ? (
                    <video src={f.preview} className="h-full w-full object-contain" controls playsInline />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- yerel önizleme
                    <img src={f.preview} alt="" className="h-full w-full object-cover" />
                  )}
                  <button type="button" aria-label="Kaldır" onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="info">{notice}</Alert>}
      <p className="text-xs text-fg-muted">
        Paylaşımın topluluk kurallarına göre otomatik denetlenir. Küfür, hakaret, tehdit, ırkçılık ve kişisel bilgi paylaşımı yayınlanmaz.
        Fotoğraflar yüklenmeden önce küçültülür ve konum bilgisi silinir.
      </p>
      <Button className="w-full" size="lg" disabled={pending || (!body.trim() && files.length === 0)} onClick={submit}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        {progress ?? (pending ? "Paylaşılıyor…" : "Paylaş")}
      </Button>
    </div>
  );
}
