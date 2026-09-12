-- Full schema for a fresh Supabase project. Run once in the SQL editor
-- (Database -> SQL Editor -> New query).
--
-- If you already have laps/drivers/races tables from an earlier version
-- of this app, use migration-3-shared-races.sql instead — it upgrades
-- your existing project (whatever state it's in) without losing data.

create table if not exists drivers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists races (
  id uuid primary key default gen_random_uuid(),
  track text not null,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists laps (
  id bigint generated always as identity primary key,
  race_id uuid not null references races(id) on delete cascade,
  driver_id uuid not null references drivers(id) on delete cascade,
  lap_number int not null,
  duration_ms int not null,
  created_at timestamptz not null default now()
);

create index if not exists laps_race_id_idx on laps(race_id);
create index if not exists laps_driver_id_idx on laps(driver_id);

-- Row Level Security: this app has no login, so anyone with your anon key
-- (which is visible in the app's public JS) can read/write these tables,
-- including deleting drivers/races/laps from the app's delete buttons.
-- That's fine for a personal hobby tracker with no sensitive data, but
-- don't reuse this project for anything you'd want private.
alter table drivers enable row level security;
alter table races enable row level security;
alter table laps enable row level security;

create policy "anon full access to drivers" on drivers for all to anon using (true) with check (true);
create policy "anon full access to races" on races for all to anon using (true) with check (true);
create policy "anon full access to laps" on laps for all to anon using (true) with check (true);
