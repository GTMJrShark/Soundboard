-- Run this if you already applied the older auth-only schema.
-- Makes the board editable by anyone with the anon key / site link (no login).

drop policy if exists "pads_insert_auth" on public.pads;
drop policy if exists "pads_update_auth" on public.pads;
drop policy if exists "pads_delete_auth" on public.pads;
drop policy if exists "pads_insert_all" on public.pads;
drop policy if exists "pads_update_all" on public.pads;
drop policy if exists "pads_delete_all" on public.pads;

create policy "pads_insert_all"
  on public.pads for insert
  with check (true);

create policy "pads_update_all"
  on public.pads for update
  using (true)
  with check (true);

create policy "pads_delete_all"
  on public.pads for delete
  using (true);

drop policy if exists "sounds_insert_auth" on storage.objects;
drop policy if exists "sounds_update_auth" on storage.objects;
drop policy if exists "sounds_delete_auth" on storage.objects;
drop policy if exists "sounds_insert_all" on storage.objects;
drop policy if exists "sounds_update_all" on storage.objects;
drop policy if exists "sounds_delete_all" on storage.objects;

create policy "sounds_insert_all"
  on storage.objects for insert
  with check (bucket_id = 'sounds');

create policy "sounds_update_all"
  on storage.objects for update
  using (bucket_id = 'sounds')
  with check (bucket_id = 'sounds');

create policy "sounds_delete_all"
  on storage.objects for delete
  using (bucket_id = 'sounds');
