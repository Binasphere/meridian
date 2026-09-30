-- ============================================================================
-- Verified withdrawals, profile photos, live chat
-- ----------------------------------------------------------------------------
-- Run once in the Supabase SQL editor, after verification.sql. Idempotent.
-- ============================================================================


-- --- 1. No withdrawal before verification is approved -------------------------

/*
 * Enforced on the table, so every path that books a withdrawal — the
 * `withdrawal_request` RPC, the VIP rail, anything added later — is covered
 * by one rule rather than a check in each.
 */
create or replace function public.require_verified_withdrawal()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.kind = 'WITHDRAWAL' and not exists (
    select 1 from public.verifications v
     where v.user_id = new.user_id and v.status = 'APPROVED'
  ) then
    raise exception 'VERIFY_FIRST';
  end if;
  return new;
end;
$$;

drop trigger if exists cash_events_require_verified on public.cash_events;
create trigger cash_events_require_verified
  before insert on public.cash_events
  for each row execute function public.require_verified_withdrawal();


-- --- 2. Profile photos ---------------------------------------------------------

/*
 * A public bucket: an avatar is shown wherever the name is, and a signed URL
 * that expires would break it in every cached page. Customers write only into
 * their own folder; 2 MB, images only.
 */
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatar upload own" on storage.objects;
create policy "avatar upload own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatar replace own" on storage.objects;
create policy "avatar replace own" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

alter table public.profiles add column if not exists avatar_url text;

/* Points the caller's profile at an image in their own avatar folder. */
create or replace function public.set_avatar(p_url text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  if p_url is not null and position('/avatars/' || auth.uid()::text || '/' in p_url) = 0 then
    raise exception 'BAD_URL';
  end if;
  update public.profiles set avatar_url = p_url where id = auth.uid();
end;
$$;

revoke all on function public.set_avatar(text) from public, anon;
grant execute on function public.set_avatar(text) to authenticated;


-- --- 3. Live chat --------------------------------------------------------------

/*
 * One conversation per customer. Customers read theirs and write as
 * themselves only; agents reply through the payments service (service role).
 * Realtime carries new rows to both sides.
 */
create table if not exists public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  sender      text not null check (sender in ('CUSTOMER', 'AGENT')),
  body        text not null check (char_length(body) between 1 and 2000),
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);

create index if not exists chat_messages_user_idx
  on public.chat_messages (user_id, created_at);

alter table public.chat_messages enable row level security;

drop policy if exists "own chat" on public.chat_messages;
create policy "own chat" on public.chat_messages
  for select using (auth.uid() = user_id);

drop policy if exists "send own chat" on public.chat_messages;
create policy "send own chat" on public.chat_messages
  for insert with check (auth.uid() = user_id and sender = 'CUSTOMER');

do $$ begin
  alter publication supabase_realtime add table public.chat_messages;
exception when duplicate_object then null; end $$;
