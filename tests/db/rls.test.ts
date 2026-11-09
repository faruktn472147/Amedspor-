/**
 * Veritabanı güvenlik testleri (gerçek PostgreSQL üzerinde).
 * Çalıştırmak için: TEST_DATABASE_URL=$(bash scripts/db-test-up.sh) npm run test:db
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DB_URL, as, closePool, createUser, superuser } from "./helpers";

const d = describe.skipIf(!DB_URL);

afterAll(async () => {
  await closePool();
});

d("Profiller ve roller", () => {
  let alice: string;
  let bob: string;
  beforeAll(async () => {
    alice = await createUser();
    bob = await createUser();
  });

  it("kayıtta otomatik profil oluşur", async () => {
    const rows = await as({ kind: "anon" }, "select id, username from profiles where id = $1", [alice]);
    expect(rows).toHaveLength(1);
    const [mine] = await as({ kind: "user", id: alice }, "select accepted_terms_at from get_my_profile()");
    expect(mine.accepted_terms_at).not.toBeNull();
  });

  it("kullanıcı gizlilik ayarını değiştirebilir", async () => {
    await as({ kind: "user", id: alice }, "update profiles set is_private = true where id = $1", [alice]);
    const [p] = await superuser("select is_private from profiles where id = $1", [alice]);
    expect(p.is_private).toBe(true);
    await superuser("update profiles set is_private = false where id = $1", [alice]);
  });

  it("kullanıcı adı/biyografi istemciden doğrudan değiştirilemez (moderasyon atlanamaz)", async () => {
    await expect(
      as({ kind: "user", id: alice }, "update profiles set bio = 'x' where id = $1", [alice]),
    ).rejects.toThrow();
  });

  it("başkasının profilini değiştiremez", async () => {
    await as({ kind: "user", id: alice }, "update profiles set is_private = true where id = $1", [bob]);
    const [p] = await superuser("select is_private from profiles where id = $1", [bob]);
    expect(p.is_private).toBe(false);
  });

  it("kullanıcı kendine yönetici rolü veremez", async () => {
    await expect(
      as({ kind: "user", id: alice }, "insert into admin_roles (user_id, role) values ($1, 'owner')", [alice]),
    ).rejects.toThrow();
  });

  it("yalnızca tek bir sahip (owner) olabilir", async () => {
    await superuser("delete from admin_roles where role = 'owner'");
    await superuser("insert into admin_roles (user_id, role) values ($1, 'owner')", [alice]);
    await expect(superuser("insert into admin_roles (user_id, role) values ($1, 'owner')", [bob])).rejects.toThrow();
    await superuser("delete from admin_roles where role = 'owner'");
  });
});

d("Gönderiler, gizlilik ve moderasyon", () => {
  let author: string;
  let stranger: string;
  let follower: string;
  beforeAll(async () => {
    author = await createUser();
    stranger = await createUser();
    follower = await createUser();
  });

  it("istemciden eklenen gönderi her zaman incelemeye düşer ve başkası göremez", async () => {
    const [post] = await as<{ id: string; moderation_status: string }>(
      { kind: "user", id: author },
      "insert into posts (author_id, body, moderation_status) values ($1, 'merhaba', 'approved') returning id, moderation_status",
      [author],
    );
    expect(post.moderation_status).toBe("pending");
    const seen = await as({ kind: "user", id: stranger }, "select id from posts where id = $1", [post.id]);
    expect(seen).toHaveLength(0);
  });

  it("başkası adına gönderi eklenemez", async () => {
    await expect(
      as({ kind: "user", id: stranger }, "insert into posts (author_id, body) values ($1, 'sahte')", [author]),
    ).rejects.toThrow();
  });

  it("onaylı gönderi herkese açık; özel hesapta yalnızca takipçi görür", async () => {
    const [post] = await as<{ id: string }>(
      { kind: "service" },
      "insert into posts (author_id, body, moderation_status) values ($1, 'onaylı', 'approved') returning id",
      [author],
    );
    expect(await as({ kind: "anon" }, "select id from posts where id = $1", [post.id])).toHaveLength(1);

    await superuser("update profiles set is_private = true where id = $1", [author]);
    expect(await as({ kind: "anon" }, "select id from posts where id = $1", [post.id])).toHaveLength(0);
    expect(await as({ kind: "user", id: stranger }, "select id from posts where id = $1", [post.id])).toHaveLength(0);

    // Özel hesaba doğrudan takip yapılamaz, istek gerekir
    await expect(
      as({ kind: "user", id: follower }, "insert into follows (follower_id, following_id) values ($1, $2)", [follower, author]),
    ).rejects.toThrow();
    await as({ kind: "user", id: follower }, "insert into follow_requests (requester_id, target_id) values ($1, $2)", [follower, author]);
    // Başkası isteği kabul edemez
    await expect(as({ kind: "user", id: stranger }, "select accept_follow_request($1)", [follower])).rejects.toThrow();
    await as({ kind: "user", id: author }, "select accept_follow_request($1)", [follower]);
    expect(await as({ kind: "user", id: follower }, "select id from posts where id = $1", [post.id])).toHaveLength(1);

    const [counts] = await superuser("select followers_count from profiles where id = $1", [author]);
    expect(counts.followers_count).toBe(1);
    await superuser("update profiles set is_private = false where id = $1", [author]);
  });

  it("engellenen kullanıcı içerik göremez ve takip silinir", async () => {
    const [post] = await as<{ id: string }>(
      { kind: "service" },
      "insert into posts (author_id, body, moderation_status) values ($1, 'engel testi', 'approved') returning id",
      [author],
    );
    await as({ kind: "user", id: author }, "insert into blocks (blocker_id, blocked_id) values ($1, $2)", [author, follower]);
    expect(await as({ kind: "user", id: follower }, "select id from posts where id = $1", [post.id])).toHaveLength(0);
    const f = await superuser("select 1 from follows where follower_id = $1 and following_id = $2", [follower, author]);
    expect(f).toHaveLength(0);
    await superuser("delete from blocks where blocker_id = $1", [author]);
  });

  it("kullanıcı başkasının gönderisini silemez veya düzenleyemez", async () => {
    const [post] = await as<{ id: string }>(
      { kind: "service" },
      "insert into posts (author_id, body, moderation_status) values ($1, 'silinmez', 'approved') returning id",
      [author],
    );
    await as({ kind: "user", id: stranger }, "delete from posts where id = $1", [post.id]);
    expect(await superuser("select id from posts where id = $1", [post.id])).toHaveLength(1);
    await expect(
      as({ kind: "user", id: stranger }, "update posts set body = 'hack' where id = $1", [post.id]),
    ).rejects.toThrow();
    await as({ kind: "user", id: author }, "delete from posts where id = $1", [post.id]);
    expect(await superuser("select id from posts where id = $1", [post.id])).toHaveLength(0);
  });

  it("beğeni sayacı ve bildirim çalışır; aynı gönderi iki kez beğenilemez", async () => {
    const [post] = await as<{ id: string }>(
      { kind: "service" },
      "insert into posts (author_id, body, moderation_status) values ($1, 'beğeni', 'approved') returning id",
      [author],
    );
    await as({ kind: "user", id: stranger }, "insert into likes (user_id, post_id) values ($1, $2)", [stranger, post.id]);
    await expect(
      as({ kind: "user", id: stranger }, "insert into likes (user_id, post_id) values ($1, $2)", [stranger, post.id]),
    ).rejects.toThrow();
    const [p] = await superuser("select like_count from posts where id = $1", [post.id]);
    expect(p.like_count).toBe(1);
    const notes = await as({ kind: "user", id: author }, "select type from notifications where post_id = $1", [post.id]);
    expect(notes.map((n) => n.type)).toContain("like");
    // Bildirimleri başkası okuyamaz
    expect(await as({ kind: "user", id: stranger }, "select id from notifications where user_id = $1", [author])).toHaveLength(0);
  });

  it("istemciden eklenen yorum incelemeye düşer, sayaç yalnızca onayda artar", async () => {
    const [post] = await as<{ id: string }>(
      { kind: "service" },
      "insert into posts (author_id, body, moderation_status) values ($1, 'yorum', 'approved') returning id",
      [author],
    );
    const [c] = await as<{ id: string; moderation_status: string }>(
      { kind: "user", id: stranger },
      "insert into comments (post_id, author_id, body) values ($1, $2, 'selam') returning id, moderation_status",
      [post.id, stranger],
    );
    expect(c.moderation_status).toBe("pending");
    let [p] = await superuser("select comment_count from posts where id = $1", [post.id]);
    expect(p.comment_count).toBe(0);
    await as({ kind: "service" }, "update comments set moderation_status = 'approved' where id = $1", [c.id]);
    [p] = await superuser("select comment_count from posts where id = $1", [post.id]);
    expect(p.comment_count).toBe(1);
  });

  it("şikâyetleri yalnızca şikâyet eden ve moderatör görür", async () => {
    const [post] = await as<{ id: string }>(
      { kind: "service" },
      "insert into posts (author_id, body, moderation_status) values ($1, 'şikayet', 'approved') returning id",
      [author],
    );
    await as({ kind: "user", id: stranger }, "insert into reports (reporter_id, target_type, target_id, reason) values ($1, 'post', $2, 'spam')", [stranger, post.id]);
    expect(await as({ kind: "user", id: author }, "select id from reports where target_id = $1", [post.id])).toHaveLength(0);
    expect(await as({ kind: "user", id: stranger }, "select id from reports where target_id = $1", [post.id])).toHaveLength(1);
  });
});

d("Premium abonelik ve finans güvenliği", () => {
  let user: string;
  let other: string;
  let owner: string;
  let admin: string;
  beforeAll(async () => {
    user = await createUser();
    other = await createUser();
    owner = await createUser();
    admin = await createUser();
    await superuser("delete from admin_roles where role = 'owner'");
    await superuser("insert into admin_roles (user_id, role) values ($1, 'owner'), ($2, 'admin')", [owner, admin]);
  });

  it("kullanıcı kendine abonelik veya ödeme kaydı ekleyemez", async () => {
    await expect(
      as({ kind: "user", id: user }, "insert into subscriptions (user_id, status, provider, price_amount, current_period_end) values ($1, 'active', 'test', 10, now() + interval '30 days')", [user]),
    ).rejects.toThrow();
    await expect(
      as({ kind: "user", id: user }, "insert into payments (user_id, provider, kind, status, amount_gross) values ($1, 'test', 'initial', 'succeeded', 10)", [user]),
    ).rejects.toThrow();
    const [r] = await as<{ p: boolean }>({ kind: "user", id: user }, "select is_premium() as p");
    expect(r.p).toBe(false);
  });

  it("aktif abonelik Premium verir; süresi dolunca otomatik ücretsize döner", async () => {
    await superuser(
      "insert into subscriptions (user_id, status, provider, price_amount, current_period_start, current_period_end) values ($1, 'active', 'test', 10, now(), now() + interval '30 days')",
      [user],
    );
    let [r] = await as<{ p: boolean }>({ kind: "user", id: user }, "select is_premium() as p");
    expect(r.p).toBe(true);
    // İptal: ödenmiş dönem sonuna kadar Premium sürer
    await superuser("update subscriptions set status = 'canceled', cancel_at_period_end = true where user_id = $1", [user]);
    [r] = await as<{ p: boolean }>({ kind: "user", id: user }, "select is_premium() as p");
    expect(r.p).toBe(true);
    // Dönem bitti
    await superuser("update subscriptions set current_period_end = now() - interval '1 minute' where user_id = $1", [user]);
    [r] = await as<{ p: boolean }>({ kind: "user", id: user }, "select is_premium() as p");
    expect(r.p).toBe(false);
    await as({ kind: "service" }, "select expire_subscriptions()");
    const [s] = await superuser("select status from subscriptions where user_id = $1", [user]);
    expect(s.status).toBe("expired");
  });

  it("ödeme başarısız aboneliği Premium yapmaz", async () => {
    await superuser(
      "insert into subscriptions (user_id, status, provider, price_amount, current_period_end) values ($1, 'payment_failed', 'test', 10, now() + interval '30 days')",
      [other],
    );
    const [r] = await as<{ p: boolean }>({ kind: "user", id: other }, "select is_premium() as p");
    expect(r.p).toBe(false);
  });

  it("kullanıcı başkasının aboneliğini/ödemesini göremez", async () => {
    await superuser("insert into payments (user_id, provider, kind, status, amount_gross) values ($1, 'test', 'initial', 'succeeded', 10)", [user]);
    expect(await as({ kind: "user", id: other }, "select id from subscriptions where user_id = $1", [user])).toHaveLength(0);
    expect(await as({ kind: "user", id: other }, "select id from payments where user_id = $1", [user])).toHaveLength(0);
    expect(await as({ kind: "user", id: user }, "select id from payments where user_id = $1", [user])).toHaveLength(1);
    // Başkasının Premium durumunu kendi oturumuyla "kullanamaz"
    const [r] = await as<{ p: boolean }>({ kind: "user", id: other }, "select is_premium() as p");
    expect(r.p).toBe(false);
  });

  it("finansal veriler: yönetici göremez, sahip yalnızca 2FA (aal2) ile görür", async () => {
    expect(await as({ kind: "user", id: admin, aal: "aal2" }, "select id from payments")).toHaveLength(0);
    expect(await as({ kind: "user", id: owner, aal: "aal1" }, "select id from payments")).toHaveLength(0);
    const rows = await as({ kind: "user", id: owner, aal: "aal2" }, "select id from payments");
    expect(rows.length).toBeGreaterThan(0);
  });

  it("finans ayarları anonim/yöneticiden gizlidir; fiyatı yalnızca sahip+aal2 değiştirir", async () => {
    const pub = await as<{ key: string }>({ kind: "anon" }, "select key from app_settings order by key");
    expect(pub.map((r) => r.key)).toEqual(["ads", "premium"]);
    await as({ kind: "user", id: admin, aal: "aal2" }, "update app_settings set value = jsonb_set(value, '{price_try}', '1') where key = 'premium'");
    let [s] = await superuser("select value->>'price_try' as p from app_settings where key = 'premium'");
    expect(s.p).toBe("10");
    await as({ kind: "user", id: owner, aal: "aal2" }, "update app_settings set value = jsonb_set(value, '{price_try}', '12') where key = 'premium'");
    [s] = await superuser("select value->>'price_try' as p from app_settings where key = 'premium'");
    expect(s.p).toBe("12");
    await superuser("update app_settings set value = jsonb_set(value, '{price_try}', '10') where key = 'premium'");
  });

  it("reklam istatistiği anonim olarak şişirilemez (fonksiyon yalnızca sunucuya açık)", async () => {
    await expect(
      as({ kind: "anon" }, "select record_ad_event(gen_random_uuid(), 'home_feed', 'impression')"),
    ).rejects.toThrow(/permission denied/);
  });

  it("webhook olayı aynı event_id ile iki kez kaydedilemez", async () => {
    await superuser("insert into payment_events (provider, event_id, event_type, signature_valid, payload) values ('test', 'evt_dup', 'x', true, '{}')");
    await expect(
      superuser("insert into payment_events (provider, event_id, event_type, signature_valid, payload) values ('test', 'evt_dup', 'x', true, '{}')"),
    ).rejects.toThrow();
  });
});

d("Tahmin oyunları", () => {
  let u1: string;
  let u2: string;
  let editor: string;
  let matchId: string;
  let scorer: string;
  beforeAll(async () => {
    u1 = await createUser();
    u2 = await createUser();
    editor = await createUser();
    await superuser("insert into admin_roles (user_id, role) values ($1, 'editor')", [editor]);
    const [home] = await superuser<{ id: string }>("insert into teams (name) values ('Ev Takımı ' || gen_random_uuid()) returning id");
    const [away] = await superuser<{ id: string }>("insert into teams (name) values ('Deplasman ' || gen_random_uuid()) returning id");
    const [pl] = await superuser<{ id: string }>("insert into players (full_name, slug, team_id) values ('Test Oyuncu', 'test-' || substr(gen_random_uuid()::text, 1, 8), $1) returning id", [home.id]);
    scorer = pl.id;
    const [m] = await superuser<{ id: string }>(
      "insert into matches (competition, season, home_team_id, away_team_id, kickoff_at) values ('Test Ligi', '2026-27', $1, $2, now() + interval '1 day') returning id",
      [home.id, away.id],
    );
    matchId = m.id;
  });

  it("maç başlamadan tahmin yapılır; başladıktan sonra kilitlenir", async () => {
    await as({ kind: "user", id: u1 }, "insert into predictions (match_id, user_id, home_score, away_score, first_scorer_id) values ($1, $2, 2, 1, $3)", [matchId, u1, scorer]);
    await as({ kind: "user", id: u2 }, "insert into predictions (match_id, user_id, home_score, away_score) values ($1, $2, 0, 0)", [matchId, u2]);
    // Başlamadan önce başkasının tahmini görünmez
    expect(await as({ kind: "user", id: u2 }, "select id from predictions where user_id = $1", [u1])).toHaveLength(0);
    await superuser("update matches set kickoff_at = now() - interval '1 minute', status = 'live' where id = $1", [matchId]);
    await expect(
      as({ kind: "user", id: u1 }, "update predictions set home_score = 3 where match_id = $1 and user_id = $2", [matchId, u1]),
    ).rejects.toThrow(/süresi doldu/);
  });

  it("puanlama doğru ve idempotent; normal kullanıcı puanlayamaz", async () => {
    await superuser("update matches set status = 'finished', home_score = 2, away_score = 1 where id = $1", [matchId]);
    await superuser("insert into match_events (match_id, player_id, type, minute) values ($1, $2, 'goal', 12)", [matchId, scorer]);
    await expect(as({ kind: "user", id: u1 }, "select settle_match_predictions($1)", [matchId])).rejects.toThrow();
    await as({ kind: "user", id: editor }, "select settle_match_predictions($1)", [matchId]);
    await as({ kind: "user", id: editor }, "select settle_match_predictions($1)", [matchId]);
    const [p1] = await superuser("select points from predictions where user_id = $1", [u1]);
    const [p2] = await superuser("select points from predictions where user_id = $1", [u2]);
    expect(p1.points).toBe(7); // tam skor 5 + ilk golcü 2
    expect(p2.points).toBe(0);
    const [prof] = await superuser("select points from profiles where id = $1", [u1]);
    expect(prof.points).toBe(7);
    const badges = await superuser("select badge_code from user_badges where user_id = $1", [u1]);
    expect(badges.map((b) => b.badge_code)).toEqual(expect.arrayContaining(["ilk_tahmin", "tam_isabet"]));
  });

  it("bilgi yarışması: doğru cevap istemciye gitmez, tek cevap hakkı", async () => {
    const [q] = await superuser<{ id: string }>(
      "insert into quizzes (quiz_date, question, options, correct_index) values ((now() at time zone 'Europe/Istanbul')::date - (floor(random()*1000)+1)::int, 'Test sorusu nedir?', array['A','B','C'], 1) returning id",
    );
    await expect(as({ kind: "user", id: u1 }, "select correct_index from quizzes where id = $1", [q.id])).resolves.toHaveLength(0);
    await expect(as({ kind: "user", id: u1 }, "select correct_index from quizzes_public")).rejects.toThrow();
    const [r] = await as<{ ok: boolean }>({ kind: "user", id: u1 }, "select answer_quiz($1, 1::smallint) as ok", [q.id]);
    expect(r.ok).toBe(true);
    await expect(as({ kind: "user", id: u1 }, "select answer_quiz($1, 1::smallint)", [q.id])).rejects.toThrow();
  });
});

d("Kişisel ayarların gizliliği", () => {
  it("başkasının reklam izni / veri tasarrufu ayarı okunamaz, kendisininki okunur", async () => {
    const a = await createUser();
    const b = await createUser();
    await expect(as({ kind: "user", id: b }, "select personalized_ads from profiles where id = $1", [a])).rejects.toThrow(/permission denied/);
    const rows = await as<{ username: string }>({ kind: "user", id: b }, "select username from profiles where id = $1", [a]);
    expect(rows).toHaveLength(1);
    const mine = await as<{ id: string; personalized_ads: boolean }>({ kind: "user", id: a }, "select * from get_my_profile()");
    expect(mine[0].id).toBe(a);
  });
});

d("Yönetici istatistikleri", () => {
  it("normal kullanıcı çağıramaz, moderatör çağırabilir", async () => {
    const u = await createUser();
    const m = await createUser();
    await superuser("insert into admin_roles (user_id, role) values ($1, 'moderator')", [m]);
    await expect(as({ kind: "user", id: u }, "select admin_stats()")).rejects.toThrow(/Yetkisiz/);
    await expect(as({ kind: "anon" }, "select admin_stats()")).rejects.toThrow();
    const [r] = await as<{ admin_stats: { users: number; db_bytes: number } }>({ kind: "user", id: m }, "select admin_stats()");
    expect(r.admin_stats.users).toBeGreaterThan(0);
    expect(r.admin_stats.db_bytes).toBeGreaterThan(0);
  });
});

d("Mobil uygulama: medya imzalama ve avatar koruması", () => {
  it("görünür gönderinin medyası okunabilir; özel/incelemedeki gönderininki okunamaz", async () => {
    const author = await createUser();
    const viewer = await createUser();
    const [pub] = await as<{ id: string }>({ kind: "service" }, "insert into posts (author_id, body, moderation_status) values ($1, 'medya', 'approved') returning id", [author]);
    const [pend] = await as<{ id: string }>({ kind: "service" }, "insert into posts (author_id, body, moderation_status) values ($1, 'bekleyen', 'pending') returning id", [author]);
    const pubPath = `${author}/2026-11/${crypto.randomUUID()}.webp`;
    const pendPath = `${author}/2026-11/${crypto.randomUUID()}.webp`;
    await superuser("insert into storage.buckets (id, name, public) values ('media', 'media', false) on conflict do nothing");
    await superuser("insert into storage.objects (bucket_id, name) values ('media', $1), ('media', $2)", [pubPath, pendPath]);
    await superuser("insert into post_media (post_id, owner_id, media_type, storage_path, mime_type, size_bytes) values ($1, $2, 'image', $3, 'image/webp', 100), ($4, $2, 'image', $5, 'image/webp', 100)", [pub.id, author, pubPath, pend.id, pendPath]);
    const seen = await as<{ name: string }>({ kind: "user", id: viewer }, "select name from storage.objects where bucket_id = 'media' and name = any($1)", [[pubPath, pendPath]]);
    expect(seen.map((r) => r.name)).toEqual([pubPath]);
    const anon = await as<{ name: string }>({ kind: "anon" }, "select name from storage.objects where bucket_id = 'media' and name = any($1)", [[pubPath, pendPath]]);
    expect(anon.map((r) => r.name)).toEqual([pubPath]);
    // Engellenen kullanıcı göremez
    await superuser("insert into blocks (blocker_id, blocked_id) values ($1, $2)", [author, viewer]);
    expect(await as({ kind: "user", id: viewer }, "select name from storage.objects where name = $1", [pubPath])).toHaveLength(0);
  });

  it("profil fotoğrafı yalnızca kullanıcının kendi avatars klasörünü gösterebilir", async () => {
    const u = await createUser();
    await expect(as({ kind: "user", id: u }, "update profiles set avatar_url = 'https://kotu-site.example/pixel.png' where id = $1", [u])).rejects.toThrow(/Geçersiz profil fotoğrafı/);
    const other = await createUser();
    await expect(
      as({ kind: "user", id: u }, "update profiles set avatar_url = $2 where id = $1", [u, `https://abc.supabase.co/storage/v1/object/public/avatars/${other}/avatar-${crypto.randomUUID()}.webp`]),
    ).rejects.toThrow(/Geçersiz/);
    const ok = `https://abc.supabase.co/storage/v1/object/public/avatars/${u}/avatar-${crypto.randomUUID()}.webp`;
    await as({ kind: "user", id: u }, "update profiles set avatar_url = $2 where id = $1", [u, ok]);
    const [p] = await superuser("select avatar_url from profiles where id = $1", [u]);
    expect(p.avatar_url).toBe(ok);
    await as({ kind: "user", id: u }, "update profiles set avatar_url = null where id = $1", [u]);
  });
});

d("Gizlilik sertleştirmesi: başkası adına sorgu yapılamaz", () => {
  it("gizli hesabı kimin takip ettiği, kimin yönetici/Premium olduğu sızdırılamaz", async () => {
    const meraklı = await createUser();
    const takipci = await createUser();
    const gizli = await createUser();
    await superuser("update profiles set is_private = true where id = $1", [gizli]);
    await superuser("insert into follows (follower_id, following_id) values ($1, $2)", [takipci, gizli]);
    // Takipçinin kendisi için doğru sonuç
    let [r] = await as<{ v: boolean }>({ kind: "user", id: takipci }, "select can_view_profile($1, $2) as v", [gizli, takipci]);
    expect(r.v).toBe(true);
    // Meraklı kullanıcı takipçi adına soramaz (kendi durumu döner: false)
    [r] = await as<{ v: boolean }>({ kind: "user", id: meraklı }, "select can_view_profile($1, $2) as v", [gizli, takipci]);
    expect(r.v).toBe(false);
    // Engelleme bilgisi de sızdırılamaz
    await superuser("insert into blocks (blocker_id, blocked_id) values ($1, $2)", [gizli, takipci]);
    [r] = await as<{ v: boolean }>({ kind: "user", id: meraklı }, "select is_blocked_between($1, $2) as v", [gizli, takipci]);
    expect(r.v).toBe(false);
    [r] = await as<{ v: boolean }>({ kind: "user", id: takipci }, "select is_blocked_between($1, $2) as v", [gizli, takipci]);
    expect(r.v).toBe(true);
    // Yönetici kimliği sızdırılamaz
    await superuser("delete from admin_roles where role = 'owner'");
    await superuser("insert into admin_roles (user_id, role) values ($1, 'owner')", [gizli]);
    [r] = await as<{ v: boolean }>({ kind: "user", id: meraklı }, "select has_role('owner', $1) as v", [gizli]);
    expect(r.v).toBe(false);
    [r] = await as<{ v: boolean }>({ kind: "user", id: gizli }, "select has_role('owner') as v");
    expect(r.v).toBe(true);
    await superuser("delete from admin_roles where role = 'owner'");
    // Premium durumu sızdırılamaz
    await superuser("insert into subscriptions (user_id, status, provider, price_amount, current_period_end) values ($1, 'active', 'test', 10, now() + interval '30 days')", [takipci]);
    [r] = await as<{ v: boolean }>({ kind: "user", id: meraklı }, "select is_premium($1) as v", [takipci]);
    expect(r.v).toBe(false);
    [r] = await as<{ v: boolean }>({ kind: "user", id: takipci }, "select is_premium() as v");
    expect(r.v).toBe(true);
  });
});
