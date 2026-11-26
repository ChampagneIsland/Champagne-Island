-- Champagne Island: keep-alive for the free Supabase project.
-- Run once in Supabase > SQL Editor. Safe to run again (it replaces the function).

create table if not exists keepalive (
  id integer primary key,
  pinged_at timestamptz not null default now(),
  pings bigint not null default 0
);
alter table keepalive enable row level security;  -- no policies: the website cannot read it

create or replace function keep_alive()
returns text
language plpgsql volatile security definer
set search_path = public
as $$
begin
  insert into keepalive (id, pinged_at, pings) values (1, now(), 1)
  on conflict (id) do update
    set pinged_at = now(), pings = keepalive.pings + 1;
  return 'ok';
end;
$$;

revoke execute on function keep_alive() from public;
grant execute on function keep_alive() to anon, authenticated;
