-- Superseded by migration-3-shared-races.sql — skip straight to that one,
-- it handles this step too regardless of whether you've run this file.
-- Kept here only as a record of the intermediate schema.
--
-- Upgrades an existing Lap Gate project (which only had a "laps" table,
-- with laps identified by browser session instead of by driver) to the
-- new drivers/races model. Run once in your Supabase project's SQL editor.
--
-- Safe to run even if "laps" already has rows in the old shape: this
-- renames the old table to laps_legacy instead of dropping it, so nothing
-- is deleted. Once you've confirmed the app works, you can drop
-- laps_legacy yourself if you don't need that old data.

alter table if exists laps rename to laps_legacy;

create table if not exists drivers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists races (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references drivers(id) on delete cascade,
  track text not null,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists laps (
  id bigint generated always as identity primary key,
  race_id uuid not null references races(id) on delete cascade,
  lap_number int not null,
  duration_ms int not null,
  created_at timestamptz not null default now()
);

create index if not exists races_driver_id_idx on races(driver_id);
create index if not exists laps_race_id_idx on laps(race_id);

alter table drivers enable row level security;
alter table races enable row level security;
alter table laps enable row level security;

drop policy if exists "anon full access to drivers" on drivers;
create policy "anon full access to drivers" on drivers for all to anon using (true) with check (true);

drop policy if exists "anon full access to races" on races;
create policy "anon full access to races" on races for all to anon using (true) with check (true);

drop policy if exists "anon full access to laps" on laps;
create policy "anon full access to laps" on laps for all to anon using (true) with check (true);
