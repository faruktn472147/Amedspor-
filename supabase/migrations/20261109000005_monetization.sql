-- AMEDSPOR — 0005 Gelir sistemi: ayarlar, Premium abonelik, ödemeler, webhook olayları,
-- banka aktarımları, reklam yerleşimleri, sponsor kampanyaları, reklam istatistikleri.
--
-- GÜVENLİK İLKELERİ
--  * Kart bilgisi hiçbir tabloda tutulmaz (ödeme kuruluşunun güvenli sayfası kullanılır).
--  * Abonelik ve ödeme satırlarını istemci ASLA yazamaz; yalnızca imzası doğrulanmış
--    webhook'ları işleyen sunucu (service_role) yazar.
--  * Finansal veriler yalnızca SAHİP hesabı + iki aşamalı doğrulama (aal2) ile okunur.

create table public.app_settings (
  key text primary key check (key ~ '^[a-z_]{2,40}$'),
  value jsonb not null,
  is_public boolean not null default false,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value, is_public) values
  ('premium', jsonb_build_object(
      'price_try', 10, 'currency', 'TRY', 'interval', 'month',
      'tagline', 'AMEDSPOR Premium ile reklamları kaldır, taraftar deneyimini kesintisiz yaşa. Aylık yalnızca 10 TL.'
    ), true),
  -- İlk kurulumda reklam sıklığı bilinçli olarak DÜŞÜK tutulur.
  ('ads', jsonb_build_object(
      'enabled', true,
      'feed_first_after', 5,
      'feed_every', 10,
      'shorts_every', 15,
      'max_per_page', 2,
      'per_campaign_daily_cap', 3
    ), true),
  ('finance', jsonb_build_object(
      'estimated_fee_percent', 3.5,
      'estimated_fee_fixed_try', 0.25,
      'vat_percent', 20,
      'note', 'Tahmini oranlar yalnızca ödeme kuruluşu komisyonu bildirmediğinde kullanılır.'
    ), false)
on conflict do nothing;

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  status text not null check (status in (
    'active',           -- Aktif
    'pending_payment',  -- Ödeme bekleniyor
    'payment_failed',   -- Ödeme başarısız
    'canceled',         -- İptal edildi (ödenmiş dönem sonuna kadar Premium sürer)
    'expired',          -- Süresi doldu
    'renewal_pending'   -- Yenileme bekleniyor
  )),
  provider text not null check (provider in ('test', 'iyzico', 'paytr')),
  provider_subscription_ref text,
  provider_customer_ref text,
  price_amount numeric(10, 2) not null check (price_amount >= 0),
  currency text not null default 'TRY',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subscription_ref)
);
create index subscriptions_status_idx on public.subscriptions (status, current_period_end);
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  provider text not null,
  provider_payment_ref text,
  checkout_token text unique,
  kind text not null check (kind in ('initial', 'renewal', 'refund')),
  status text not null check (status in ('pending', 'succeeded', 'failed', 'refunded', 'canceled')),
  amount_gross numeric(12, 2) not null,
  -- Ödeme kuruluşunun bildirdiği komisyon. Bildirilmemişse null kalır ve raporda
  -- "tahmini" olarak ayrıca hesaplanır; gerçek gibi gösterilmez.
  fee_amount numeric(12, 2),
  currency text not null default 'TRY',
  period_start timestamptz,
  period_end timestamptz,
  failure_reason text,
  is_test boolean not null default false,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_payment_ref)
);
create index payments_user_idx on public.payments (user_id, created_at desc);
create index payments_paid_idx on public.payments (paid_at) where status in ('succeeded', 'refunded');
create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

-- Webhook olay günlüğü: aynı olay iki kez işlenmez (unique provider+event_id).
create table public.payment_events (
  id bigint generated always as identity primary key,
  provider text not null,
  event_id text not null,
  event_type text not null,
  signature_valid boolean not null,
  payload jsonb not null,
  result text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, event_id)
);

-- Ödeme kuruluşundan bankaya yapılan GERÇEK aktarımlar. Yalnızca ödeme kuruluşu
-- raporu/API'si ile doğrulanan kayıtlar girilir.
create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_ref text,
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null default 'TRY',
  status text not null check (status in ('scheduled', 'paid', 'failed')),
  expected_date date,
  paid_at timestamptz,
  source text not null check (source in ('provider_api', 'provider_report')),
  notes text not null default '',
  entered_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (provider, provider_ref)
);

create or replace function public.is_premium(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select uid is not null and exists (
    select 1 from public.subscriptions s
    where s.user_id = uid
      and s.status in ('active', 'canceled', 'renewal_pending')
      and s.current_period_end is not null
      and s.current_period_end > now()
  );
$$;

-- Süresi dolan abonelikleri işaretle (günlük cron tarafından çağrılır).
create or replace function public.expire_subscriptions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.subscriptions
  set status = 'expired'
  where status in ('active', 'canceled', 'renewal_pending')
    and current_period_end is not null
    and current_period_end <= now()
    and (
      status = 'canceled'
      or cancel_at_period_end
      -- Yenileme 3 gün içinde başarıyla tahsil edilemediyse abonelik sona erer.
      -- (Bu sürede Premium hakkı YOKTUR; is_premium dönem bitişine bakar.)
      or (status = 'renewal_pending' and current_period_end <= now() - interval '3 days')
    );
  get diagnostics n = row_count;

  -- Otomatik yenilenen ama dönemi biten abonelikler 'renewal_pending' olur.
  update public.subscriptions
  set status = 'renewal_pending'
  where status = 'active' and not cancel_at_period_end
    and current_period_end is not null and current_period_end <= now();
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reklamlar
-- ---------------------------------------------------------------------------
create table public.ad_placements (
  code text primary key check (code in ('home_feed', 'news_detail', 'shorts_feed', 'match_center', 'player_profile', 'community_feed')),
  name text not null,
  enabled boolean not null default true,
  provider text not null default 'direct' check (provider in ('direct', 'adsense', 'direct_then_adsense')),
  adsense_slot_id text check (adsense_slot_id is null or adsense_slot_id ~ '^[0-9]{6,20}$'),
  updated_at timestamptz not null default now()
);

insert into public.ad_placements (code, name) values
  ('home_feed', 'Ana sayfa akışı (doğal kart)'),
  ('news_detail', 'Haber detayı sonu'),
  ('shorts_feed', 'Shorts akışı (seyrek sponsorlu kart)'),
  ('match_center', 'Maç merkezi (skoru engellemeyen alan)'),
  ('player_profile', 'Oyuncu profili alt kısmı'),
  ('community_feed', 'Taraftar akışı (sponsorlu gönderi)')
on conflict do nothing;

create table public.ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  advertiser_name text not null,
  placement_codes text[] not null,
  title text not null check (char_length(title) between 2 and 90),
  body text not null default '' check (char_length(body) <= 200),
  image_url text,
  target_url text not null check (target_url ~ '^https://'),
  cta_label text not null default 'İncele' check (char_length(cta_label) <= 24),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_active boolean not null default true,
  priority smallint not null default 0,
  contract_amount numeric(12, 2),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index ad_campaigns_active_idx on public.ad_campaigns (starts_at, ends_at) where is_active;

-- Gerçek sayılan gösterim/tıklama (kendi sponsor kampanyalarımız için).
create table public.ad_daily_stats (
  campaign_id uuid not null references public.ad_campaigns (id) on delete cascade,
  placement_code text not null references public.ad_placements (code),
  day date not null,
  impressions integer not null default 0,
  clicks integer not null default 0,
  primary key (campaign_id, placement_code, day)
);

-- Reklam ağı gelirleri (AdSense/AdMob). Bu rakamlar ağın kendi raporundan gelir;
-- uygulama kendi başına reklam ağı geliri HESAPLAMAZ / UYDURMAZ.
create table public.ad_revenue_entries (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('adsense', 'admob', 'direct')),
  period_start date not null,
  period_end date not null,
  amount numeric(12, 2) not null,
  currency text not null default 'TRY',
  impressions integer,
  clicks integer,
  revenue_status text not null check (revenue_status in ('estimated', 'finalized', 'received')),
  source text not null check (source in ('provider_api', 'provider_report', 'contract')),
  notes text not null default '',
  entered_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (period_end >= period_start)
);
create index ad_revenue_period_idx on public.ad_revenue_entries (period_start);

create or replace function public.record_ad_event(p_campaign uuid, p_placement text, p_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_kind not in ('impression', 'click') then
    raise exception 'Geçersiz olay';
  end if;
  if not exists (select 1 from public.ad_campaigns c where c.id = p_campaign and p_placement = any (c.placement_codes)) then
    raise exception 'Kampanya bulunamadı';
  end if;
  insert into public.ad_daily_stats (campaign_id, placement_code, day, impressions, clicks)
  values (p_campaign, p_placement, (now() at time zone 'Europe/Istanbul')::date,
          case when p_kind = 'impression' then 1 else 0 end,
          case when p_kind = 'click' then 1 else 0 end)
  on conflict (campaign_id, placement_code, day) do update
  set impressions = public.ad_daily_stats.impressions + excluded.impressions,
      clicks = public.ad_daily_stats.clicks + excluded.clicks;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.app_settings enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
alter table public.payouts enable row level security;
alter table public.ad_placements enable row level security;
alter table public.ad_campaigns enable row level security;
alter table public.ad_daily_stats enable row level security;
alter table public.ad_revenue_entries enable row level security;

create policy app_settings_read on public.app_settings for select
  using (is_public or public.is_owner_aal2());
create policy app_settings_write on public.app_settings for update
  using (public.is_owner_aal2()) with check (public.is_owner_aal2());

create policy subscriptions_read on public.subscriptions for select
  using (user_id = auth.uid() or public.is_owner_aal2());
create policy payments_read on public.payments for select
  using (user_id = auth.uid() or public.is_owner_aal2());
create policy payment_events_read on public.payment_events for select using (public.is_owner_aal2());
create policy payouts_read on public.payouts for select using (public.is_owner_aal2());
create policy payouts_write on public.payouts for insert with check (public.is_owner_aal2());

create policy ad_placements_read on public.ad_placements for select using (true);
create policy ad_placements_write on public.ad_placements for update
  using (public.is_owner_aal2()) with check (public.is_owner_aal2());

create policy ad_campaigns_read on public.ad_campaigns for select
  using ((is_active and now() between starts_at and ends_at) or public.is_owner_aal2());
create policy ad_campaigns_write on public.ad_campaigns for all
  using (public.is_owner_aal2()) with check (public.is_owner_aal2());

create policy ad_daily_stats_read on public.ad_daily_stats for select using (public.is_owner_aal2());
create policy ad_revenue_read on public.ad_revenue_entries for select using (public.is_owner_aal2());
create policy ad_revenue_write on public.ad_revenue_entries for insert with check (public.is_owner_aal2());

grant select on public.app_settings, public.ad_placements, public.ad_campaigns to anon, authenticated;
grant update (value) on public.app_settings to authenticated;
grant update (enabled, provider, adsense_slot_id) on public.ad_placements to authenticated;
grant insert, update, delete on public.ad_campaigns to authenticated;
grant select on public.subscriptions, public.payments to authenticated;
grant select on public.payment_events, public.ad_daily_stats to authenticated;
grant select, insert on public.payouts, public.ad_revenue_entries to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on function public.is_premium(uuid) to anon, authenticated;
revoke execute on function public.expire_subscriptions() from public, anon, authenticated;
revoke execute on function public.record_ad_event(uuid, text, text) from public, anon, authenticated;
grant execute on function public.expire_subscriptions(), public.record_ad_event(uuid, text, text) to service_role;

-- Premium rozetini aktif aboneliğe ver
create or replace function public.subscriptions_badge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active' then
    insert into public.user_badges (user_id, badge_code) values (new.user_id, 'premium_taraftar')
    on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger subscriptions_after_change after insert or update on public.subscriptions
  for each row execute function public.subscriptions_badge();
