-- Persist why a valid post was not drafted (model/local skill skip).
alter table public.linkedin_posts
  add column if not exists draft_skip_reason text not null default '';
