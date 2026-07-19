-- Public contact / subscription inquiry submissions from the marketing site.

create table if not exists public.contact_submissions (
  id serial primary key,
  name text not null default '',
  email text not null,
  plan text not null default 'general',
  message text not null default '',
  source text not null default 'website',
  created_at timestamptz not null default now()
);

create index if not exists contact_submissions_created_at_idx
  on public.contact_submissions (created_at desc);

alter table public.contact_submissions enable row level security;

-- Inserts go through the Next.js API using DATABASE_URL (bypasses RLS).
-- No public anon policies — do not expose this table to the browser client.
