-- ============================================================================
-- Identity verification: national ID + proof of address
-- ----------------------------------------------------------------------------
-- Run once in the Supabase SQL editor, after support-and-deposit.sql.
-- Idempotent.
-- ============================================================================

-- --- 1. A private bucket, one folder per user --------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'verification',
  'verification',
  false,
  10485760, -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- A customer may upload into their own folder only, and never read, list or
-- overwrite anything — the console reads through the service role.
drop policy if exists "verification upload own" on storage.objects;
create policy "verification upload own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'verification'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


-- --- 2. One submission per account --------------------------------------------

create table if not exists public.verifications (
  user_id       uuid primary key references public.profiles (id) on delete cascade,
  id_path       text not null,
  address_path  text not null,
  status        text not null default 'PENDING'
                check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  note          text,
  submitted_at  timestamptz not null default now(),
  decided_at    timestamptz
);

create index if not exists verifications_status_idx
  on public.verifications (status, submitted_at desc);

alter table public.verifications enable row level security;

drop policy if exists "own verification" on public.verifications;
create policy "own verification" on public.verifications
  for select using (auth.uid() = user_id);


-- --- 3. Submitting ---------------------------------------------------------------

/*
 * Records both documents at once — neither is accepted alone. The paths must
 * sit in the caller's own folder, so nobody can point their submission at
 * someone else's upload. An approved account cannot resubmit over itself.
 */
create or replace function public.submit_verification(p_id_path text, p_address_path text)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_prefix text := auth.uid()::text || '/';
begin
  if auth.uid() is null then
    raise exception 'NOT_SIGNED_IN';
  end if;
  if p_id_path is null or p_address_path is null
     or left(p_id_path, length(v_prefix)) <> v_prefix
     or left(p_address_path, length(v_prefix)) <> v_prefix then
    raise exception 'BAD_PATH';
  end if;

  insert into public.verifications (user_id, id_path, address_path)
  values (auth.uid(), p_id_path, p_address_path)
  on conflict (user_id) do update
    set id_path = excluded.id_path,
        address_path = excluded.address_path,
        status = 'PENDING',
        note = null,
        submitted_at = now(),
        decided_at = null
    where public.verifications.status <> 'APPROVED';

  return 'PENDING';
end;
$$;

revoke all on function public.submit_verification(text, text) from public, anon;
grant execute on function public.submit_verification(text, text) to authenticated;
