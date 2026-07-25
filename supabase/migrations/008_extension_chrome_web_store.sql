-- Point extension update URL at the Chrome Web Store listing.
update public.extension_config
set
  update_url = 'https://chromewebstore.google.com/detail/ippbibmncgbjnepmkgogdmbohfegfmid?utm_source=item-share-cb',
  message = 'Please install ReachPod extension 2.2.0 from the Chrome Web Store to continue.',
  updated_at = now()
where id = 1;
