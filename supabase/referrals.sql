-- ============================================================================
-- Refer & earn: codes, who referred whom, and a customer's own counts
-- ----------------------------------------------------------------------------
-- Run once in the Supabase SQL editor, after support-and-deposit.sql.
-- Idempotent. Rewards are not paid automatically: the counts here are what
-- an admin pays against until a reward rule is decided.
-- ============================================================================

alter table public.profiles add column if not exists referral_code text;
alter table public.profiles add column if not exists referred_by uuid
  references public.profiles (id) on delete set null;

-- Eight characters from an alphabet without look-alikes.
create or replace function public.new_referral_code()
returns text
language plpgsql
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..8 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where referral_code = code);
  end loop;
  return code;
end;
$$;

update public.profiles set referral_code = public.new_referral_code()
 where referral_code is null;

alter table public.profiles alter column referral_code set default public.new_referral_code();
create unique index if not exists profiles_referral_code_idx on public.profiles (referral_code);
create index if not exists profiles_referred_by_idx on public.profiles (referred_by);

/*
 * The profile bootstrap, now also recording the referrer. The code arrives in
 * the sign-up metadata as `ref`; an unknown code is ignored rather than
 * refusing the sign-up.
 */
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, phone, username, site, referred_by)
  values (
    new.id,
    nullif(coalesce(new.raw_user_meta_data ->> 'phone', new.phone, ''), ''),
    coalesce(
      new.raw_user_meta_data ->> 'username',
      nullif(left(regexp_replace(coalesce(new.raw_user_meta_data ->> 'full_name',
                                          new.raw_user_meta_data ->> 'name', ''),
                                 '[^A-Za-z0-9_ ]', '', 'g'), 24), ''),
      'trader'
    ),
    coalesce(
      (select s.id from public.sites s
        where s.id = new.raw_user_meta_data ->> 'site'),
      public.primary_site()
    ),
    (select p.id from public.profiles p
      where p.referral_code = upper(nullif(new.raw_user_meta_data ->> 'ref', '')))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

/*
 * The caller's own code and how many people it has brought in. Counts only —
 * never who they are.
 */
create or replace function public.my_referrals()
returns table (code text, joined bigint, funded bigint)
language sql
security definer set search_path = public
stable
as $$
  select
    me.referral_code,
    (select count(*) from public.profiles r where r.referred_by = me.id),
    (select count(distinct r.id)
       from public.profiles r
       join public.cash_events c on c.user_id = r.id
      where r.referred_by = me.id
        and c.kind = 'DEPOSIT' and c.status = 'COMPLETED')
  from public.profiles me
  where me.id = auth.uid();
$$;

revoke all on function public.my_referrals() from public, anon;
grant execute on function public.my_referrals() to authenticated;
