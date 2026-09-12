-- Makes a race shared across drivers, so multiple drivers can compete
-- head-to-head in the same race instead of each race belonging to one
-- driver. Run once in your Supabase SQL editor.
--
-- Safe to run no matter which earlier state your database is in —
-- the very first single-table version, after migration-2-drivers-races.sql,
-- or even if you never ran any earlier migration at all. Also safe to
-- run twice by accident.

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

-- Very first version: a single "laps" table with track/driver/session_id
-- columns and no drivers/races tables at all. Get it out of the way.
do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'laps')
     and exists (select 1 from information_schema.columns where table_name = 'laps' and column_name = 'session_id')
     and not exists (select 1 from information_schema.columns where table_name = 'laps' and column_name = 'race_id')
  then
    alter table laps rename to laps_legacy;
  end if;
end $$;

create table if not exists laps (
  id bigint generated always as identity primary key,
  race_id uuid not null references races(id) on delete cascade,
  driver_id uuid references drivers(id) on delete cascade,
  lap_number int not null,
  duration_ms int not null,
  created_at timestamptz not null default now()
);

-- If migration-2-drivers-races.sql already ran, races has a driver_id
-- column (one driver "owning" the race). Move that ownership down onto
-- each lap instead, so a race can hold laps from several drivers.
do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'races' and column_name = 'driver_id') then
    if not exists (select 1 from information_schema.columns where table_name = 'laps' and column_name = 'driver_id') then
      alter table laps add column driver_id uuid references drivers(id) on delete cascade;
    end if;
    update laps set driver_id = races.driver_id
      from races where laps.race_id = races.id and laps.driver_id is null;
    alter table races drop column driver_id;
  end if;
end $$;

alter table laps alter column driver_id set not null;

create index if not exists laps_race_id_idx on laps(race_id);
create index if not exists laps_driver_id_idx on laps(driver_id);

alter table drivers enable row level security;
alter table races enable row level security;
alter table laps enable row level security;

drop policy if exists "anon full access to drivers" on drivers;
create policy "anon full access to drivers" on drivers for all to anon using (true) with check (true);

drop policy if exists "anon full access to races" on races;
create policy "anon full access to races" on races for all to anon using (true) with check (true);

drop policy if exists "anon full access to laps" on laps;
create policy "anon full access to laps" on laps for all to anon using (true) with check (true);
