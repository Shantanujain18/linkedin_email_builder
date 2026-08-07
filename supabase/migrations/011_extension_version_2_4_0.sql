-- Bump required Chrome extension version to 2.4.0
-- (bulk post upsert, draft only uploaded postIds, semver >= version gate).
update public.extension_config
set
  required_version = '2.4.0',
  update_url = 'https://chromewebstore.google.com/detail/ippbibmncgbjnepmkgogdmbohfegfmid?utm_source=item-share-cb',
  message = 'Please install ReachPod extension 2.4.0 from the Chrome Web Store to continue.',
  updated_at = now()
where id = 1;

insert into public.extension_config (id, required_version, update_url, message)
values (
  1,
  '2.4.0',
  'https://chromewebstore.google.com/detail/ippbibmncgbjnepmkgogdmbohfegfmid?utm_source=item-share-cb',
  'Please install ReachPod extension 2.4.0 from the Chrome Web Store to continue.'
)
on conflict (id) do update set
  required_version = excluded.required_version,
  update_url = excluded.update_url,
  message = excluded.message,
  updated_at = now();
