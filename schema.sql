-- Run this once in your Supabase project's SQL editor (Database -> SQL Editor -> New query).

create table if not exists laps (
  id bigint generated always as identity primary key,
  track text not null,
  driver text not null,
  lap_number int not null,
  duration_ms int not null,
  session_id uuid not null,
  created_at timestamptz not null default now()
);

-- Row Level Security: this app has no login, so anyone with your anon key
-- (which is visible in the app's public JS) can insert and read rows.
-- That's fine for a personal hobby tracker with no sensitive data, but
-- don't reuse this table/project for anything you'd want private.
alter table laps enable row level security;

create policy "anon can insert laps"
  on laps for insert
  to anon
  with check (true);

create policy "anon can read laps"
  on laps for select
  to anon
  using (true);
