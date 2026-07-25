-- Store phone numbers scraped from LinkedIn posts alongside emails_json.
alter table public.linkedin_posts
  add column if not exists phones_json text not null default '[]';
