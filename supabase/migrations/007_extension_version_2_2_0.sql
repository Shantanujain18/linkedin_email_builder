-- Bump required Chrome extension version to 2.2.0 (scrape → save → draft pipeline).
update public.extension_config
set
  required_version = '2.2.0',
  update_url = 'https://github.com/Shantanujain18/linkedin_post_scrapper/raw/main/dist.zip',
  message = 'Please install ReachPod extension 2.2.0 to continue. Download the latest build and Load unpacked in chrome://extensions.',
  updated_at = now()
where id = 1;

insert into public.extension_config (id, required_version, update_url, message)
values (
  1,
  '2.2.0',
  'https://github.com/Shantanujain18/linkedin_post_scrapper/raw/main/dist.zip',
  'Please install ReachPod extension 2.2.0 to continue. Download the latest build and Load unpacked in chrome://extensions.'
)
on conflict (id) do update set
  required_version = excluded.required_version,
  update_url = excluded.update_url,
  message = excluded.message,
  updated_at = now();
