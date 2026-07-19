-- Required Chrome extension version gate.
-- Users may scrape only when their installed extension version exactly matches required_version.
-- Update update_url when you publish a new build.

create table if not exists public.extension_config (
  id integer primary key default 1 check (id = 1),
  required_version text not null default '2.1.0',
  update_url text not null default '',
  message text not null default 'Please install the latest ReachPod extension to continue.',
  updated_at timestamptz not null default now()
);

insert into public.extension_config (id, required_version, update_url, message)
values (
  1,
  '2.1.0',
  '',
  'Please install the latest ReachPod extension to continue.'
)
on conflict (id) do nothing;

alter table public.extension_config enable row level security;

-- Reads/writes go through Next.js API using DATABASE_URL (bypasses RLS).
