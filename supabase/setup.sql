-- Run in the Supabase Dashboard SQL Editor as the project owner.
-- Rerunning preserves workspace rows and stored photos.
begin;

create table if not exists public.arbejde_workspaces (
  user_id uuid primary key references auth.users (id) on delete cascade,
  document jsonb not null check (
    jsonb_typeof(document) = 'object' and octet_length(document::text) <= 5242880
  ),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);

alter table public.arbejde_workspaces enable row level security;
revoke all on table public.arbejde_workspaces from public, anon, authenticated;
grant select, insert, update on table public.arbejde_workspaces to authenticated;

drop policy if exists arbejde_workspace_read on public.arbejde_workspaces;
create policy arbejde_workspace_read on public.arbejde_workspaces
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists arbejde_workspace_create on public.arbejde_workspaces;
create policy arbejde_workspace_create on public.arbejde_workspaces
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists arbejde_workspace_update on public.arbejde_workspaces;
create policy arbejde_workspace_update on public.arbejde_workspaces
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('arbejde-photos', 'arbejde-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists arbejde_photos_read on storage.objects;
create policy arbejde_photos_read on storage.objects
  for select to authenticated using (
    bucket_id = 'arbejde-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists arbejde_photos_upload on storage.objects;
create policy arbejde_photos_upload on storage.objects
  for insert to authenticated with check (
    bucket_id = 'arbejde-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Restrict this bucket even if the project already has broader storage policies.
drop policy if exists arbejde_photos_owner_guard on storage.objects;
create policy arbejde_photos_owner_guard on storage.objects as restrictive
  for all to public using (
    bucket_id <> 'arbejde-photos' or (storage.foldername(name))[1] = (select auth.uid())::text
  ) with check (
    bucket_id <> 'arbejde-photos' or (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists arbejde_photos_no_update on storage.objects;
create policy arbejde_photos_no_update on storage.objects as restrictive
  for update to public using (bucket_id <> 'arbejde-photos')
  with check (bucket_id <> 'arbejde-photos');

drop policy if exists arbejde_photos_no_delete on storage.objects;
create policy arbejde_photos_no_delete on storage.objects as restrictive
  for delete to public using (bucket_id <> 'arbejde-photos');

commit;
