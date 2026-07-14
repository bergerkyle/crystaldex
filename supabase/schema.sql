-- Schema for the CrystalDex Pokédex data stored in Supabase.
-- Run this in the Supabase SQL editor (or via the CLI) before the first sync.

create table if not exists public.pokemon (
  name             text primary key,
  region           text not null default '',
  type_1           text not null default '',
  type_2           text not null default '',
  hp               integer not null,
  attack           integer not null,
  defense          integer not null,
  special_attack   integer not null,
  special_defense  integer not null,
  speed            integer not null,
  front_sprite     text not null,
  back_sprite      text not null,
  -- git blob SHAs used to detect when a source file has been edited.
  stats_sha        text,
  evos_sha         text,
  front_sha        text,
  back_sha         text,
  updated_at       timestamptz not null default now()
);

create table if not exists public.evolutions (
  id            bigint generated always as identity primary key,
  pokemon_name  text not null references public.pokemon(name) on delete cascade,
  method        text not null,
  level         integer,
  item          text,
  condition     text,
  to_name       text not null,
  to_region     text not null default ''
);

-- The old `moves` table stored one learnset row per Pokémon. It is replaced by
-- a shared move catalog (`moves`) plus a `pokemon_moves` junction table.
-- WARNING: this drops the previous learnset data; re-run a sync to repopulate.
drop table if exists public.moves cascade;

-- Shared move catalog: one row per move, referenced by many Pokémon.
create table if not exists public.moves (
  key       text primary key,
  name      text not null,
  description text not null default '',
  power     integer not null default 0,
  type      text not null default '',
  category  text not null default '',   -- physical | special | status
  accuracy  integer not null default 0,
  pp        integer not null default 0
);

alter table public.moves
  add column if not exists description text not null default '';

alter table public.pokemon
  add column if not exists type_1 text not null default '';

alter table public.pokemon
  add column if not exists type_2 text not null default '';

-- Learnset: many-to-many link between Pokémon and moves, with the level learned.
create table if not exists public.pokemon_moves (
  id            bigint generated always as identity primary key,
  pokemon_name  text not null references public.pokemon(name) on delete cascade,
  move_key      text not null references public.moves(key) on delete cascade,
  level         integer not null
);

-- TM/HM learnset: which moves a Pokémon can learn from TMs/HMs (and tutors).
-- `label` is the TM/HM number (e.g. TM37, HM07); tutor moves have an empty label.
create table if not exists public.pokemon_tmhm (
  id            bigint generated always as identity primary key,
  pokemon_name  text not null references public.pokemon(name) on delete cascade,
  move_key      text not null references public.moves(key) on delete cascade,
  label         text not null default '',
  sort          integer not null default 0
);

-- Wild encounter rows for location pages and pokemon detail encounter lists.
create table if not exists public.location_encounters (
  id             bigint generated always as identity primary key,
  region         text not null,
  route          text not null,
  method         text not null check (method in ('grass', 'water')),
  time           text check (time in ('morn', 'day', 'nite')),
  pokemon_name   text not null references public.pokemon(name) on delete cascade,
  pokemon_region text not null default '',
  rate           integer not null check (rate >= 0)
);

-- Ability catalog: one row per ability, referenced by many Pokémon.
create table if not exists public.abilities (
  id          bigint generated always as identity primary key,
  name        text not null unique,
  description text not null default ''
);

alter table public.pokemon
  add column if not exists ability_id bigint references public.abilities(id) on delete set null;

-- Small key/value store for tracking source-file SHAs between syncs.
create table if not exists public.sync_meta (
  key    text primary key,
  value  text
);

create index if not exists evolutions_pokemon_name_idx on public.evolutions (pokemon_name);
create index if not exists pokemon_moves_pokemon_name_idx on public.pokemon_moves (pokemon_name);
create index if not exists pokemon_moves_move_key_idx on public.pokemon_moves (move_key);
create index if not exists pokemon_tmhm_pokemon_name_idx on public.pokemon_tmhm (pokemon_name);
create index if not exists pokemon_tmhm_move_key_idx on public.pokemon_tmhm (move_key);
create index if not exists location_encounters_region_route_idx on public.location_encounters (region, route);
create index if not exists location_encounters_pokemon_name_idx on public.location_encounters (pokemon_name);
create index if not exists pokemon_ability_id_idx on public.pokemon (ability_id);

-- The API reads/writes with the service-role key, which bypasses RLS. Enabling
-- RLS with no public policies keeps the anon key from reading the tables.
alter table public.pokemon enable row level security;
alter table public.evolutions enable row level security;
alter table public.moves enable row level security;
alter table public.pokemon_moves enable row level security;
alter table public.pokemon_tmhm enable row level security;
alter table public.location_encounters enable row level security;
alter table public.abilities enable row level security;
alter table public.sync_meta enable row level security;
