-- Daily CSV import counter (capped by profiles.daily_post_limit, same as scrape/send).

alter table public.profiles
  add column if not exists posts_imported_on text not null default '',
  add column if not exists posts_imported_today integer not null default 0;
