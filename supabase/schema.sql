-- Soundboard team board — run once in Supabase SQL Editor
-- Open access: anyone with the site link can read AND write (no login).

-- Pads metadata
create table if not exists public.pads (
  id text primary key,
  label text not null default 'Pad',
  shortcut text not null default '',
  color int not null default 1,
  mime_type text,
  duration double precision not null default 0,
  storage_path text,
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists pads_sort_order_idx on public.pads (sort_order);

alter table public.pads enable row level security;

drop policy if exists "pads_select_all" on public.pads;
drop policy if exists "pads_insert_auth" on public.pads;
drop policy if exists "pads_update_auth" on public.pads;
drop policy if exists "pads_delete_auth" on public.pads;
drop policy if exists "pads_insert_all" on public.pads;
drop policy if exists "pads_update_all" on public.pads;
drop policy if exists "pads_delete_all" on public.pads;

create policy "pads_select_all"
  on public.pads for select
  using (true);

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

-- Audio files
insert into storage.buckets (id, name, public)
values ('sounds', 'sounds', true)
on conflict (id) do update set public = true;

drop policy if exists "sounds_read" on storage.objects;
drop policy if exists "sounds_insert_auth" on storage.objects;
drop policy if exists "sounds_update_auth" on storage.objects;
drop policy if exists "sounds_delete_auth" on storage.objects;
drop policy if exists "sounds_insert_all" on storage.objects;
drop policy if exists "sounds_update_all" on storage.objects;
drop policy if exists "sounds_delete_all" on storage.objects;

create policy "sounds_read"
  on storage.objects for select
  using (bucket_id = 'sounds');

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

-- Live updates when teammates change pads
do $$
begin
  alter publication supabase_realtime add table public.pads;
exception
  when duplicate_object then null;
  when others then null;
end $$;
