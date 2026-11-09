export type Role = "owner" | "admin" | "moderator" | "editor";

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  avatar_url: string | null;
  is_private: boolean;
  data_saver: boolean;
  personalized_ads: boolean;
  status: "active" | "suspended" | "banned";
  followers_count: number;
  following_count: number;
  posts_count: number;
  points: number;
  created_at: string;
}

export type ProfileCard = Pick<Profile, "id" | "username" | "display_name" | "avatar_url">;

export interface MediaItem {
  id: string;
  media_type: "image" | "video";
  storage_path: string;
  poster_path: string | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  position: number;
  url?: string | null;
  poster_url?: string | null;
}

export interface PollOption {
  id: string;
  label: string;
  position: number;
  vote_count: number;
}

export interface Post {
  id: string;
  author_id: string;
  kind: "post" | "short" | "poll";
  body: string;
  moderation_status: "approved" | "pending" | "rejected" | "removed";
  moderation_reason: string | null;
  like_count: number;
  comment_count: number;
  edited_at: string | null;
  created_at: string;
  author: ProfileCard | null;
  media: MediaItem[];
  poll_options: PollOption[];
  liked_by_me?: boolean;
  bookmarked_by_me?: boolean;
  my_vote?: string | null;
}

export interface Comment {
  id: string;
  post_id: string;
  author_id: string;
  parent_id: string | null;
  body: string;
  moderation_status: string;
  created_at: string;
  author: ProfileCard | null;
}

export interface Team {
  id: string;
  name: string;
  short_name: string | null;
  is_amedspor: boolean;
  logo_url: string | null;
}

export interface Match {
  id: string;
  competition: string;
  season: string;
  kickoff_at: string;
  venue: string | null;
  status: "scheduled" | "live" | "halftime" | "finished" | "postponed" | "cancelled";
  minute: number | null;
  home_score: number | null;
  away_score: number | null;
  stats: Record<string, [number, number]>;
  source_name: string | null;
  source_url: string | null;
  verified: boolean;
  predictions_settled_at: string | null;
  updated_at: string;
  home: Team | null;
  away: Team | null;
}

export interface MatchEvent {
  id: string;
  match_id: string;
  team_id: string | null;
  player_id: string | null;
  player_name: string | null;
  type: string;
  minute: number;
  extra_minute: number | null;
  detail: string;
}

export interface Player {
  id: string;
  full_name: string;
  slug: string;
  shirt_number: number | null;
  position: string | null;
  nationality: string | null;
  birth_date: string | null;
  photo_url: string | null;
  photo_credit: string | null;
  bio: string;
  career: { club: string; from?: string; to?: string }[];
  is_active: boolean;
  source_name: string | null;
  source_url: string | null;
  updated_at: string;
}

export interface PlayerStat {
  season: string;
  competition: string;
  appearances: number;
  minutes: number;
  goals: number;
  assists: number;
  yellow_cards: number;
  red_cards: number;
  source_name: string | null;
  source_url: string | null;
}

export interface NewsSource {
  id: string;
  name: string;
  homepage_url: string;
  feed_url: string | null;
  kind: "official_club" | "official_social" | "federation" | "media" | "journalist" | "aggregator";
  trust_level: "official" | "trusted" | "review";
  auto_publish: boolean;
  keywords: string[];
  is_active: boolean;
  republish_allowed: boolean;
  last_fetched_at: string | null;
  last_error: string | null;
}

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  body: string;
  original_url: string | null;
  image_url: string | null;
  image_credit: string | null;
  category: "son_dakika" | "resmi" | "haber" | "transfer" | "mac" | "roportaj";
  verification: "official" | "verified" | "unverified" | "rumor";
  status: "pending" | "published" | "rejected" | "removed";
  is_sensitive: boolean;
  published_at: string | null;
  source_published_at: string | null;
  created_at: string;
  source: Pick<NewsSource, "id" | "name" | "homepage_url" | "kind"> | null;
}

export interface NotificationItem {
  id: number;
  type: string;
  message: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
  actor: ProfileCard | null;
}

export interface AdCampaign {
  id: string;
  name: string;
  advertiser_name: string;
  placement_codes: string[];
  title: string;
  body: string;
  image_url: string | null;
  target_url: string;
  cta_label: string;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  priority: number;
  contract_amount: number | null;
}

export interface AdPlacement {
  code: string;
  name: string;
  enabled: boolean;
  provider: "direct" | "adsense" | "direct_then_adsense";
  adsense_slot_id: string | null;
}
