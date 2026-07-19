-- Daily LinkedIn scrape quota (default free plan = 50 posts/day).
-- Raise daily_post_limit per user in the database for paid plans.

alter table public.profiles
  add column if not exists plan text not null default 'free',
  add column if not exists daily_post_limit integer not null default 50,
  add column if not exists posts_fetched_on text not null default '',
  add column if not exists posts_fetched_today integer not null default 0;
