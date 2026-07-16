-- Run this in Supabase SQL Editor once.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  yoe text not null default '',
  top_skills text not null default '',
  "current_role" text not null default '',
  resume_link text not null default '',
  phone text not null default '',
  email text not null default '',
  resume_text text not null default '',
  resume_filename text not null default '',
  resume_mime text not null default '',
  resume_path text not null default '',
  immediate_joiner boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.smtp_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  host text not null default 'smtp.gmail.com',
  port integer not null default 587,
  secure boolean not null default false,
  "user" text not null default '',
  pass text not null default '',
  from_email text not null default '',
  from_name text not null default '',
  attach_resume boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.linkedin_posts (
  id serial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  posted_by text not null default '',
  posted_by_url text not null default '',
  posted_date text not null default '',
  posted_content text not null default '',
  post_url text not null default '',
  emails_json text not null default '[]',
  created_at timestamptz not null default now()
);

create unique index if not exists linkedin_posts_user_url_content
  on public.linkedin_posts (user_id, posted_by_url, posted_content);

create table if not exists public.email_drafts (
  id serial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id integer not null references public.linkedin_posts(id) on delete cascade,
  recipient_email text not null,
  recipient_name text not null default '',
  subject text not null default '',
  body text not null default '',
  status text not null default 'draft',
  phone text not null default '',
  location text not null default '',
  company text not null default '',
  contact_name text not null default '',
  hiring_summary text not null default '',
  talking_points text not null default '',
  job_post text not null default '',
  matched_skills text not null default '',
  called boolean not null default false,
  called_at text not null default '',
  replied boolean not null default false,
  replied_at text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists email_drafts_user_post
  on public.email_drafts (user_id, post_id);

create table if not exists public.email_send_log (
  id serial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  recipient_email text not null,
  sent_on text not null,
  draft_id integer,
  sent_at timestamptz not null default now()
);

create unique index if not exists email_send_log_user_email_day
  on public.email_send_log (user_id, recipient_email, sent_on);

create table if not exists public.draft_notes (
  id serial primary key,
  draft_id integer not null references public.email_drafts(id) on delete cascade,
  note text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.smtp_settings enable row level security;
alter table public.linkedin_posts enable row level security;
alter table public.email_drafts enable row level security;
alter table public.email_send_log enable row level security;
alter table public.draft_notes enable row level security;

create policy "profiles_own" on public.profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "smtp_own" on public.smtp_settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "posts_own" on public.linkedin_posts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "drafts_own" on public.email_drafts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "send_log_own" on public.email_send_log for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "notes_own" on public.draft_notes for all using (
  exists (select 1 from public.email_drafts d where d.id = draft_id and d.user_id = auth.uid())
) with check (
  exists (select 1 from public.email_drafts d where d.id = draft_id and d.user_id = auth.uid())
);

insert into storage.buckets (id, name, public)
values ('resumes', 'resumes', false)
on conflict (id) do nothing;

create policy "resumes_select_own"
on storage.objects for select
using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "resumes_insert_own"
on storage.objects for insert
with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "resumes_update_own"
on storage.objects for update
using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "resumes_delete_own"
on storage.objects for delete
using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
