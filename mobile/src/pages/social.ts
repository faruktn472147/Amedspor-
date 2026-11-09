import { h, toast } from "../dom";
import { icon } from "../icons";
import { api, ApiError } from "../api";
import { config, isBackendConfigured } from "../config";
import { navigate } from "../router";
import { getBookmarks, getComments, getFeed, getFollowRequests, getMyProfile, getNotifications, getPost, getProfile, getSettings, isPremium, searchProfiles } from "../data";
import { moderateText } from "@/lib/moderation";
import { adPositions, interleaveAds } from "@/lib/ads/frequency";
import { buildStoragePath, UPLOAD_LIMITS, validateUpload } from "@/lib/uploads/validate";
import type { Comment, Post } from "@/lib/types";
import { adPlaceholder, adSlot, alertBox, avatar, badge, button, card, compact, emptyState, errorText, openReport, postCard, requireLogin, run, setupNotice, shareLink, timeAgo } from "../ui";

const pageTitle = (t: string, sub?: string) => h("header", { class: "page-title" }, h("h1", null, t), sub ? h("p", { class: "muted small" }, sub) : null);
const dataSaverOn = () => {
  try {
    return localStorage.getItem("amed.datasaver") === "1";
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------- Akış
export async function feedPage(_: Record<string, string>, q: URLSearchParams): Promise<Node> {
  const tab = ["kesfet", "takip", "populer"].includes(q.get("sekme") ?? "") ? (q.get("sekme") as string) : "kesfet";
  const head = h("div", { class: "row between" }, pageTitle("Taraftar Akışı"), h("a", { href: "#/paylas", class: "btn btn-primary btn-sm" }, icon("plus", "ic-xs"), " Paylaş"));
  const tabs = h(
    "nav",
    { class: "chips", "aria-label": "Akış sekmeleri" },
    ...[["kesfet", "Keşfet"], ["takip", "Takip ettiklerim"], ["populer", "Haftanın popülerleri"]].map(([k, l]) => h("a", { href: `#/akis?sekme=${k}`, class: `chip ${tab === k ? "on" : ""}` }, l)),
  );
  if (!isBackendConfigured(config())) return h("div", { class: "stack" }, head, setupNotice());
  if (tab === "takip" && !api.userId) return h("div", { class: "stack" }, head, tabs, emptyState("Takip akışı için giriş yap", undefined, h("a", { href: "#/giris?next=%23%2Fakis%3Fsekme%3Dtakip", class: "btn btn-primary btn-sm" }, "Giriş yap")));
  const list = h("div", { class: "stack" });
  const more = h("div", { class: "center" });
  const settings = await getSettings().catch(() => null);
  const premium = await isPremium();
  const ds = dataSaverOn();
  let slot = 0;
  const load = async (cursor: string | null) => {
    const { posts, nextCursor } = await getFeed({ scope: tab === "takip" ? "following" : tab === "populer" ? "popular" : "all", cursor });
    if (!posts.length && !cursor) {
      list.replaceChildren(emptyState(tab === "takip" ? "Takip ettiğin kişilerden paylaşım yok" : "Henüz paylaşım yok", "Maç yorumunu, tribün fotoğrafını ya da anketini paylaş.", h("a", { href: "#/paylas", class: "btn btn-primary btn-sm" }, "Paylaşım yap"), "users"));
      return;
    }
    const positions = settings && !premium ? adPositions(posts.length, settings.ads.feed_first_after, settings.ads.feed_every, settings.ads.max_per_page) : [];
    for (const e of interleaveAds(posts, (p) => p.id, positions)) {
      list.appendChild(e.type === "item" ? postCard(e.item, { dataSaver: ds, onDeleted: () => navigate(location.hash) }) : adPlaceholder("community_feed", slot++));
    }
    more.replaceChildren(
      nextCursor
        ? button("Daha fazla göster", async (ev) => {
            await run(ev.currentTarget as HTMLButtonElement, () => load(nextCursor));
          }, "outline")
        : "",
    );
  };
  await load(null);
  return h("div", { class: "stack" }, head, tabs, list, more);
}

// ---------------------------------------------------------------- Gönderi + yorumlar
export async function postPage(p: Record<string, string>): Promise<Node> {
  const post = await getPost(p.id);
  if (!post) return emptyState("Gönderi bulunamadı", "Silinmiş, gizli bir hesaba ait ya da incelemede olabilir.");
  const comments = await getComments(post.id);
  const list = h("ul", { class: "comments" });
  let replyTo: Comment | null = null;
  const replyInfo = h("p", { class: "muted tiny" });
  const render = (items: Comment[]) => {
    const roots = items.filter((c) => !c.parent_id);
    const item = (c: Comment, nested: boolean): HTMLElement =>
      h(
        "li",
        { class: nested ? "comment nested" : "comment" },
        h(
          "div",
          { class: "row gap-sm top" },
          avatar(c.author?.avatar_url, c.author?.username ?? "?", nested ? 26 : 32),
          h(
            "div",
            { class: "grow" },
            h("p", { class: "small" }, h("a", { href: `#/u/${c.author?.username ?? ""}`, class: "strong" }, c.author?.username ?? "silinmiş"), " ", h("span", { class: "pre" }, c.body)),
            h(
              "div",
              { class: "row gap-sm muted tiny" },
              timeAgo(c.created_at),
              c.moderation_status === "pending" ? h("span", { class: "amber" }, "incelemede") : null,
              api.userId && !nested ? h("button", { type: "button", class: "link-btn", onclick: () => { replyTo = c; replyInfo.textContent = `@${c.author?.username} kullanıcısına cevap veriyorsun`; input.focus(); } }, "Cevap ver") : null,
              api.userId && (api.userId === c.author_id || api.userId === post.author_id)
                ? h("button", { type: "button", class: "link-btn", "aria-label": "Yorumu sil", onclick: async (e: Event) => { if (!window.confirm("Yorum silinsin mi?")) return; const ok = await run(e.currentTarget as HTMLButtonElement, () => api.remove("comments", `id=eq.${c.id}`)); if (ok !== undefined) navigate(location.hash); } }, "Sil")
                : null,
              api.userId && api.userId !== c.author_id ? h("button", { type: "button", class: "link-btn", onclick: () => openReport("comment", c.id) }, "Şikâyet") : null,
            ),
          ),
        ),
        !nested ? h("ul", null, ...items.filter((r) => r.parent_id === c.id).map((r) => item(r, true))) : null,
      );
    list.replaceChildren(...(roots.length ? roots.map((c) => item(c, false)) : [h("li", { class: "muted small" }, "İlk yorumu sen yaz.")]));
  };
  render(comments);
  const input = h("textarea", { class: "input", rows: 2, maxlength: 1000, placeholder: "Saygılı bir yorum yaz…", "aria-label": "Yorum" }) as HTMLTextAreaElement;
  const form = api.userId
    ? h(
        "div",
        { class: "stack-sm" },
        replyInfo,
        input,
        button("Gönder", async (e) => {
          const text = input.value.trim();
          if (!text) return;
          const pre = moderateText(text, "comment");
          if (pre.decision === "block") return toast(pre.message ?? "Yorum topluluk kurallarına aykırı.", "error");
          const r = await run(e.currentTarget as HTMLButtonElement, () => api.site<{ ok: boolean; message?: string }>("comment", { postId: post.id, body: text, parentId: replyTo?.id ?? null }));
          if (r) {
            input.value = "";
            replyTo = null;
            replyInfo.textContent = "";
            if (r.message) toast(r.message, "info");
            render(await getComments(post.id));
          }
        }),
      )
    : h("p", { class: "small" }, "Yorum yapmak için ", h("a", { href: `#/giris?next=${encodeURIComponent(`#/gonderi/${post.id}`)}`, class: "link" }, "giriş yap"), ".");
  return h("div", { class: "stack" }, postCard(post, { dataSaver: dataSaverOn(), onDeleted: () => navigate("#/akis") }), card("p-md", h("h2", { class: "h2" }, `Yorumlar (${comments.filter((c) => c.moderation_status === "approved").length})`), list, form));
}

// ---------------------------------------------------------------- Profil
export async function profilePage(p: Record<string, string>): Promise<Node> {
  const d = await getProfile(p.username);
  if (!d) return emptyState("Kullanıcı bulunamadı");
  const u = d.profile;
  const feed = d.canView ? await getFeed({ authorId: u.id, limit: 30 }) : { posts: [] as Post[] };
  let state: "none" | "following" | "requested" = d.isFollowing ? "following" : d.requested ? "requested" : "none";
  const followBtn = button("", async (e) => {
    if (!requireLogin()) return;
    const btn = e.currentTarget as HTMLButtonElement;
    if (state === "none") {
      const ok = await run(btn, () => (u.is_private ? api.insert("follow_requests", { requester_id: api.userId, target_id: u.id }) : api.insert("follows", { follower_id: api.userId, following_id: u.id })));
      if (ok !== undefined) state = u.is_private ? "requested" : "following";
    } else {
      const ok = await run(btn, async () => {
        await api.remove("follows", `follower_id=eq.${api.userId}&following_id=eq.${u.id}`);
        await api.remove("follow_requests", `requester_id=eq.${api.userId}&target_id=eq.${u.id}`);
      });
      if (ok !== undefined) state = "none";
    }
    paint();
  }, "primary", { class: "btn btn-primary grow" });
  const paint = () => {
    followBtn.textContent = state === "following" ? "Takibi bırak" : state === "requested" ? "İstek gönderildi" : "Takip et";
    followBtn.className = `btn grow ${state === "none" ? "btn-primary" : "btn-secondary"}`;
  };
  paint();
  const actions = d.isMe
    ? h("div", { class: "row gap-sm" }, h("a", { href: "#/ayarlar", class: "btn btn-secondary grow" }, "Profili düzenle"), h("a", { href: "#/kaydedilenler", class: "btn btn-secondary" }, "Kaydedilenler"))
    : d.blocked
      ? button("Engeli kaldır", async (e) => {
          const ok = await run(e.currentTarget as HTMLButtonElement, () => api.remove("blocks", `blocker_id=eq.${api.userId}&blocked_id=eq.${u.id}`), "Engel kaldırıldı");
          if (ok !== undefined) navigate(location.hash);
        }, "outline")
      : h(
          "div",
          { class: "row gap-sm" },
          followBtn,
          h("button", { type: "button", class: "btn btn-secondary", "aria-label": "Şikâyet et", onclick: () => openReport("profile", u.id) }, icon("flag", "ic-xs")),
          h("button", {
            type: "button",
            class: "btn btn-secondary",
            onclick: async (e: Event) => {
              if (!requireLogin()) return;
              if (!window.confirm("Bu kullanıcıyı engellemek istiyor musun? Karşılıklı takip kaldırılır ve birbirinizin içeriğini göremezsiniz.")) return;
              const ok = await run(e.currentTarget as HTMLButtonElement, () => api.insert("blocks", { blocker_id: api.userId, blocked_id: u.id }), "Kullanıcı engellendi");
              if (ok !== undefined) navigate(location.hash);
            },
          }, "Engelle"),
        );
  return h(
    "div",
    { class: "stack" },
    h(
      "section",
      { class: "profile-head" },
      h("div", { class: "row gap-md" }, avatar(u.avatar_url, u.display_name || u.username, 80), h("div", { class: "stats" }, ...[[u.posts_count, "gönderi"], [u.followers_count, "takipçi"], [u.following_count, "takip"]].map(([n, l]) => h("div", null, h("strong", null, compact(Number(n))), h("span", { class: "muted tiny block" }, String(l)))))),
      h("h1", { class: "h1" }, u.display_name || u.username, u.is_private ? icon("lock", "ic-xs muted") : null),
      h("p", { class: "muted small" }, `@${u.username} · ${u.points} puan`),
      u.bio ? h("p", { class: "pre" }, u.bio) : null,
      d.badges.length ? h("div", { class: "row gap-xs wrap" }, ...d.badges.map((b) => badge(b.badges?.name ?? b.badge_code, "green"))) : null,
      actions,
    ),
    d.canView
      ? feed.posts.length
        ? h("div", { class: "stack" }, ...feed.posts.map((x) => postCard(x, { dataSaver: dataSaverOn(), onDeleted: () => navigate(location.hash) })))
        : emptyState("Henüz paylaşım yok")
      : emptyState("Bu hesap gizli", "Paylaşımları görmek için takip isteği gönder.", null, "lock"),
  );
}

export async function myProfileRedirect(): Promise<Node> {
  if (!requireLogin()) return h("div");
  const me = await getMyProfile();
  if (me) navigate(`#/u/${me.username}`, true);
  return h("div");
}

// ---------------------------------------------------------------- Paylaşım
type Pending = { file: File; preview: string; kind: "image" | "video"; width?: number; height?: number; duration?: number; poster?: Blob };

async function compressImage(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const bmp = await createImageBitmap(file);
  const max = UPLOAD_LIMITS.image.targetDimension;
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  // Yeniden kodlama EXIF/konum bilgisini temizler
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("sıkıştırma"))), "image/webp", 0.82));
  return { blob, width: canvas.width, height: canvas.height };
}

function readVideoMeta(file: File): Promise<{ duration: number; width: number; height: number; poster?: Blob }> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.playsInline = true;
    v.src = URL.createObjectURL(file);
    v.onloadedmetadata = () => (v.currentTime = Math.min(1, v.duration / 2));
    v.onseeked = () => {
      const c = document.createElement("canvas");
      const s = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight));
      c.width = Math.round(v.videoWidth * s);
      c.height = Math.round(v.videoHeight * s);
      c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
      c.toBlob((b) => resolve({ duration: v.duration, width: v.videoWidth, height: v.videoHeight, poster: b ?? undefined }), "image/webp", 0.75);
    };
    v.onerror = () => reject(new Error("Video okunamadı. MP4 (H.264) biçimini dene."));
  });
}

export async function composePage(_: Record<string, string>, q: URLSearchParams): Promise<Node> {
  if (!requireLogin()) return h("div");
  let mode: "post" | "photo" | "short" | "poll" = (["photo", "short", "poll"].find((m) => m === q.get("tur")) as "photo" | "short" | "poll") ?? "post";
  let files: Pending[] = [];
  const body = h("textarea", { class: "input", rows: 5, maxlength: 2200, "aria-label": "Gönderi metni" }) as HTMLTextAreaElement;
  const optionsBox = h("div", { class: "stack-sm" });
  const fileInput = h("input", { type: "file", class: "sr-only", "aria-label": "Dosya seç" }) as HTMLInputElement;
  const previews = h("div", { class: "previews" });
  const pickBtn = h("button", { type: "button", class: "drop", onclick: () => fileInput.click() });
  const msg = h("div");
  const options = ["", ""];

  const paintOptions = () =>
    optionsBox.replaceChildren(
      ...options.map((o, i) => h("input", { class: "input", value: o, maxlength: 80, placeholder: `Seçenek ${i + 1}`, oninput: (e: Event) => (options[i] = (e.target as HTMLInputElement).value) })),
      options.length < 4 ? h("button", { type: "button", class: "link-btn", onclick: () => { options.push(""); paintOptions(); } }, "+ Seçenek ekle") : "",
    );
  const paintPreviews = () =>
    previews.replaceChildren(
      ...files.map((f, i) =>
        h("div", { class: `preview ${f.kind}` }, f.kind === "video" ? h("video", { src: f.preview, controls: true, playsinline: true }) : h("img", { src: f.preview, alt: "" }), h("button", { type: "button", class: "remove", "aria-label": "Kaldır", onclick: () => { files.splice(i, 1); paintPreviews(); } }, "✕")),
      ),
    );
  const tabs = h("div", { class: "seg", role: "tablist" });
  const paint = () => {
    tabs.replaceChildren(
      ...([["post", "Yazı"], ["photo", "Fotoğraf"], ["short", "Shorts"], ["poll", "Anket"]] as const).map(([m, l]) =>
        h("button", { type: "button", role: "tab", "aria-selected": String(mode === m), class: mode === m ? "on" : "", onclick: () => { mode = m; files = []; paint(); } }, l),
      ),
    );
    body.placeholder = mode === "poll" ? "Anket sorunu yaz…" : mode === "short" ? "Video açıklaması…" : "Taraftarlara ne söylemek istersin?";
    optionsBox.hidden = mode !== "poll";
    pickBtn.hidden = mode !== "photo" && mode !== "short";
    fileInput.accept = mode === "short" ? "video/mp4,video/webm" : "image/jpeg,image/png,image/webp";
    fileInput.multiple = mode === "photo";
    pickBtn.replaceChildren(icon(mode === "short" ? "shorts" : "image", "ic-lg"), h("span", null, mode === "short" ? "Dikey video seç (en fazla 60 sn, 50 MB)" : "Fotoğraf seç (en fazla 10)"));
    paintOptions();
    paintPreviews();
  };
  fileInput.onchange = async () => {
    msg.replaceChildren();
    for (const file of Array.from(fileInput.files ?? [])) {
      if (mode === "short") {
        try {
          const meta = await readVideoMeta(file);
          const err = validateUpload({ kind: "video", mime: file.type, size: file.size, durationSeconds: meta.duration, width: meta.width, height: meta.height });
          if (err) return msg.replaceChildren(alertBox(err, "error"));
          files = [{ file, preview: URL.createObjectURL(file), kind: "video", ...meta }];
        } catch (e) {
          return msg.replaceChildren(alertBox((e as Error).message, "error"));
        }
      } else {
        const err = validateUpload({ kind: "image", mime: file.type, size: Math.min(file.size, UPLOAD_LIMITS.image.maxBytes) });
        if (err) return msg.replaceChildren(alertBox(err, "error"));
        files.push({ file, preview: URL.createObjectURL(file), kind: "image" });
      }
    }
    files = files.slice(0, UPLOAD_LIMITS.maxImagesPerPost);
    fileInput.value = "";
    paintPreviews();
  };
  paint();

  const submit = button("Paylaş", async (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    msg.replaceChildren();
    const text = body.value;
    const pollOptions = mode === "poll" ? options.map((o) => o.trim()).filter(Boolean) : undefined;
    if (!text.trim() && !files.length) return msg.replaceChildren(alertBox("Boş gönderi paylaşılamaz.", "error"));
    const pre = moderateText([text, ...(pollOptions ?? [])].join("\n"), "post");
    if (pre.decision === "block") return msg.replaceChildren(alertBox(pre.message ?? "İçerik topluluk kurallarına aykırı.", "error"));
    btn.disabled = true;
    try {
      const media: Record<string, unknown>[] = [];
      for (const [i, f] of files.entries()) {
        btn.textContent = `Yükleniyor ${i + 1}/${files.length}…`;
        let blob: Blob = f.file;
        let mime = f.file.type;
        let width = f.width;
        let height = f.height;
        if (f.kind === "image") {
          const c = await compressImage(f.file);
          blob = c.blob;
          mime = "image/webp";
          width = c.width;
          height = c.height;
        }
        const path = buildStoragePath(api.userId!, mime, crypto.randomUUID());
        await api.upload("media", path, blob, mime);
        let posterPath: string | undefined;
        if (f.poster) {
          posterPath = buildStoragePath(api.userId!, "image/webp", crypto.randomUUID());
          await api.upload("media", posterPath, f.poster, "image/webp");
        }
        media.push({ path, mime, size: blob.size, width, height, duration: f.duration, posterPath });
      }
      btn.textContent = "Paylaşılıyor…";
      const kind = mode === "short" ? "short" : mode === "poll" ? "poll" : "post";
      const r = await api.site<{ ok: boolean; id?: string; status?: string; message?: string }>("post", { kind, body: text, media, pollOptions });
      if (r.status === "approved" && r.id) navigate(kind === "short" ? "#/shorts" : `#/gonderi/${r.id}`);
      else {
        body.value = "";
        files = [];
        paintPreviews();
        msg.replaceChildren(alertBox(r.message ?? "Gönderin incelemeye alındı.", "info"));
      }
    } catch (err) {
      msg.replaceChildren(alertBox(errorText(err), "error"));
    } finally {
      btn.disabled = false;
      btn.textContent = "Paylaş";
    }
  }, "primary", { class: "btn btn-primary btn-lg" });

  return h(
    "div",
    { class: "stack" },
    pageTitle("Yeni paylaşım", "Yazı, fotoğraf, Shorts videosu veya anket paylaş."),
    card("p-md stack", tabs, body, optionsBox, pickBtn, fileInput, previews, msg, h("p", { class: "muted tiny" }, "Paylaşımın topluluk kurallarına göre denetlenir. Küfür, hakaret, tehdit, ırkçılık ve kişisel bilgi paylaşımı yayınlanmaz. Fotoğraflar yüklenmeden önce küçültülür ve konum bilgisi silinir."), submit),
  );
}

// ---------------------------------------------------------------- Shorts
export async function shortsPage(_: Record<string, string>, q: URLSearchParams): Promise<Node> {
  if (!isBackendConfigured(config())) return setupNotice();
  const { posts: list } = await getFeed({ scope: "shorts", limit: 20 });
  let posts = list.filter((x) => x.media.some((m) => m.media_type === "video"));
  const v = q.get("v");
  if (v) {
    const first = posts.find((x) => x.id === v) ?? (await getPost(v));
    if (first?.kind === "short") posts = [first, ...posts.filter((x) => x.id !== first.id)];
  }
  if (!posts.length) return emptyState("Henüz Shorts yok", "Dikey (9:16) en fazla 60 saniyelik videolarını paylaş.", h("a", { href: "#/paylas?tur=short", class: "btn btn-primary btn-sm" }, "Shorts yükle"), "shorts");

  let dataSaver = dataSaverOn();
  let muted = true;
  const settings = await getSettings().catch(() => null);
  const premium = await isPremium();
  const adEvery = settings?.ads.shorts_every ?? 15;
  const container = h("div", { class: "shorts", role: "feed", "aria-label": "Shorts" });
  const sections: { el: HTMLElement; activate: (on: boolean) => void }[] = [];

  posts.forEach((post, i) => {
    const video = post.media.find((m) => m.media_type === "video");
    const stage = h("div", { class: "short-stage" });
    let tapped = false;
    let vid: HTMLVideoElement | null = null;
    const activate = (on: boolean) => {
      if (on && (!dataSaver || tapped) && video?.url) {
        if (!vid) {
          vid = h("video", { src: video.url, poster: video.poster_url ?? undefined, loop: true, playsinline: true, preload: "metadata" }) as HTMLVideoElement;
          vid.muted = muted;
          vid.onclick = () => (vid!.paused ? vid!.play() : vid!.pause());
          stage.replaceChildren(vid);
        }
        vid.muted = muted;
        vid.play().catch(() => {});
      } else {
        if (vid) {
          vid.pause();
          if (!on) {
            vid.removeAttribute("src"); // görünmeyen video veri tüketmez
            vid.load();
            vid = null;
          }
        }
        if (!vid) {
          stage.replaceChildren(
            h(
              "button",
              { type: "button", class: "short-cover", "aria-label": "Videoyu oynat", onclick: () => { tapped = true; activate(true); } },
              video?.poster_url && !dataSaver ? h("img", { src: video.poster_url, alt: "" }) : h("span", { class: "brand-bg hero-fill" }),
              h("span", { class: "play-circle" }, icon("play", "ic-lg")),
              dataSaver ? h("span", { class: "pill" }, "Veri tasarrufu açık · oynatmak için dokun") : null,
            ),
          );
        }
      }
    };
    let liked = !!post.liked_by_me;
    let likes = post.like_count;
    const likeCount = h("span", { class: "tiny" }, compact(likes));
    const likeBtn = h("button", { type: "button", class: `short-act ${liked ? "on" : ""}`, "aria-label": "Beğen" }, icon("heart", "ic-lg"), likeCount) as HTMLButtonElement;
    likeBtn.onclick = async () => {
      if (!requireLogin()) return;
      liked = !liked;
      likes += liked ? 1 : -1;
      likeBtn.classList.toggle("on", liked);
      likeCount.textContent = compact(likes);
      try {
        if (liked) await api.insert("likes", { user_id: api.userId, post_id: post.id });
        else await api.remove("likes", `user_id=eq.${api.userId}&post_id=eq.${post.id}`);
      } catch (e) {
        if (!(e instanceof ApiError && e.code === "23505")) toast(errorText(e), "error");
      }
    };
    const muteBtn = h("button", { type: "button", class: "short-act", "aria-label": "Sesi aç/kapat" }, icon(muted ? "volumeOff" : "volumeOn", "ic-lg")) as HTMLButtonElement;
    muteBtn.onclick = () => {
      muted = !muted;
      container.querySelectorAll("video").forEach((x) => ((x as HTMLVideoElement).muted = muted));
      container.querySelectorAll(".mute-ic").forEach((x) => x.replaceWith(icon(muted ? "volumeOff" : "volumeOn", "ic-lg mute-ic")));
    };
    muteBtn.firstElementChild?.classList.add("mute-ic");
    const el = h(
      "section",
      { class: "short", "data-index": i, "aria-label": `Shorts ${i + 1}` },
      stage,
      h("div", { class: "short-info" }, h("a", { href: `#/u/${post.author?.username ?? ""}`, class: "row gap-sm" }, avatar(post.author?.avatar_url, post.author?.username ?? "", 34), h("strong", null, `@${post.author?.username ?? ""}`)), post.body ? h("p", { class: "small clamp3" }, post.body) : null),
      h(
        "div",
        { class: "short-actions" },
        likeBtn,
        h("a", { href: `#/gonderi/${post.id}`, class: "short-act", "aria-label": "Yorumlar" }, icon("message", "ic-lg"), h("span", { class: "tiny" }, compact(post.comment_count))),
        h("button", { type: "button", class: "short-act", "aria-label": "Paylaş", onclick: () => shareLink(`/gonderi/${post.id}`) }, icon("share", "ic-lg")),
        muteBtn,
        api.userId && api.userId !== post.author_id ? h("button", { type: "button", class: "short-act", "aria-label": "Şikâyet et", onclick: () => openReport("post", post.id) }, icon("flag", "ic")) : null,
      ),
    );
    activate(false);
    sections.push({ el, activate });
    container.appendChild(el);
    // Sponsorlu kart çok seyrek: ayardaki aralıkta ve sayfa başına en fazla 1
    if (!premium && i + 1 === adEvery) {
      const holder = h("section", { class: "short short-ad", "aria-label": "Sponsorlu içerik" });
      adSlot("shorts_feed", 0, "short").then((ad) => (ad ? holder.appendChild(ad) : holder.remove()));
      container.appendChild(holder);
    }
  });

  let active = -1;
  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        const idx = Number((en.target as HTMLElement).dataset.index);
        if (Number.isNaN(idx) || idx === active) continue;
        if (active >= 0) sections[active]?.activate(false);
        active = idx;
        sections[idx]?.activate(true);
      }
    },
    { root: container, threshold: 0.7 },
  );
  sections.forEach((s) => io.observe(s.el));

  const saverBtn = h("button", { type: "button", class: `pill-btn ${dataSaver ? "on" : ""}`, "aria-pressed": String(dataSaver) }, icon("wifi", "ic-xs"), ` Veri tasarrufu ${dataSaver ? "açık" : "kapalı"}`) as HTMLButtonElement;
  saverBtn.onclick = () => {
    dataSaver = !dataSaver;
    try {
      localStorage.setItem("amed.datasaver", dataSaver ? "1" : "0");
    } catch {
      /* depolama kapalı */
    }
    saverBtn.replaceChildren(icon("wifi", "ic-xs"), ` Veri tasarrufu ${dataSaver ? "açık" : "kapalı"}`);
    saverBtn.classList.toggle("on", dataSaver);
  };
  return h("div", { class: "shorts-wrap" }, saverBtn, container);
}

// ---------------------------------------------------------------- Bildirimler, kaydedilenler, arama
export async function notificationsPage(): Promise<Node> {
  if (!requireLogin()) return h("div");
  const [items, requests] = await Promise.all([getNotifications(), getFollowRequests()]);
  if (items.some((n) => !n.read_at)) api.update("notifications", `user_id=eq.${api.userId}&read_at=is.null`, { read_at: new Date().toISOString() }).catch(() => {});
  return h(
    "div",
    { class: "stack" },
    pageTitle("Bildirimler"),
    requests.length
      ? card(
          "p-md stack-sm",
          h("strong", null, `Takip istekleri (${requests.length})`),
          ...requests.map((r) =>
            h(
              "div",
              { class: "row gap-sm" },
              avatar(r.requester.avatar_url, r.requester.username, 34),
              h("a", { href: `#/u/${r.requester.username}`, class: "grow strong" }, `@${r.requester.username}`),
              button("Kabul", async (e) => {
                const ok = await run(e.currentTarget as HTMLButtonElement, () => api.rpc("accept_follow_request", { p_requester: r.requester_id }), "Kabul edildi");
                if (ok !== undefined) navigate(location.hash);
              }, "primary", { class: "btn btn-primary btn-sm" }),
              button("Reddet", async (e) => {
                const ok = await run(e.currentTarget as HTMLButtonElement, () => api.remove("follow_requests", `requester_id=eq.${r.requester_id}&target_id=eq.${api.userId}`));
                if (ok !== undefined) navigate(location.hash);
              }, "secondary", { class: "btn btn-secondary btn-sm" }),
            ),
          ),
        )
      : null,
    items.length
      ? card(
          "divide",
          ...items.map((n) => {
            const inner = h("div", { class: `notif ${n.read_at ? "" : "unread"}` }, n.actor ? avatar(n.actor.avatar_url, n.actor.username, 34) : h("span", { class: "avatar avatar-fallback", style: "width:34px;height:34px" }, icon("bell", "ic-xs")), h("p", { class: "small grow" }, n.actor ? h("strong", null, `@${n.actor.username} `) : null, n.message, h("span", { class: "muted tiny block" }, timeAgo(n.created_at))));
            const target = n.link?.startsWith("/gonderi/") ? `#${n.link}` : n.actor ? `#/u/${n.actor.username}` : null;
            return target ? h("a", { href: target }, inner) : inner;
          }),
        )
      : emptyState("Bildirimin yok", "Beğeni, yorum ve takip bildirimleri burada görünür.", null, "bell"),
  );
}

export async function bookmarksPage(): Promise<Node> {
  if (!requireLogin()) return h("div");
  const posts = await getBookmarks();
  return h("div", { class: "stack" }, pageTitle("Kaydedilenler", "Yalnızca sen görebilirsin."), posts.length ? h("div", { class: "stack" }, ...posts.map((p) => postCard(p, { dataSaver: dataSaverOn() }))) : emptyState("Kaydettiğin gönderi yok", undefined, null, "bookmark"));
}

export async function searchPage(_: Record<string, string>, q: URLSearchParams): Promise<Node> {
  const term = q.get("q") ?? "";
  const input = h("input", { class: "input", value: term, placeholder: "Kullanıcı adı veya isim", "aria-label": "Arama", maxlength: 30, type: "search" }) as HTMLInputElement;
  const form = h("form", { class: "row gap-sm", role: "search", onsubmit: (e: Event) => { e.preventDefault(); navigate(`#/ara?q=${encodeURIComponent(input.value)}`); } }, input, h("button", { class: "btn btn-primary", "aria-label": "Ara" }, icon("search", "ic-xs")));
  const results = term.trim().length >= 2 && isBackendConfigured(config()) ? await searchProfiles(term) : [];
  return h(
    "div",
    { class: "stack" },
    pageTitle("Taraftar ara"),
    form,
    term ? (results.length ? card("divide", ...results.map((u) => h("a", { href: `#/u/${u.username}`, class: "list-row" }, avatar(u.avatar_url, u.display_name || u.username, 38), h("span", null, h("strong", { class: "block" }, u.display_name || u.username), h("span", { class: "muted small" }, `@${u.username}`))))) : emptyState("Sonuç bulunamadı")) : null,
  );
}
