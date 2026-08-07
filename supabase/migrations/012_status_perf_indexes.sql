-- Speed /api/status send-quota count and post filters by user.
create index if not exists email_send_log_user_day
  on public.email_send_log (user_id, sent_on);

create index if not exists linkedin_posts_user_id
  on public.linkedin_posts (user_id);

create index if not exists email_drafts_user_id
  on public.email_drafts (user_id);
