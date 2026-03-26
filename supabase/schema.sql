-- ÁňaBoard v1 baseline schema (Supabase/Postgres)

create table if not exists families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists caregivers (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  email text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists boards (
  id text primary key,
  family_id uuid not null references families(id) on delete cascade,
  profile_id text not null,
  name text not null,
  locale text not null,
  columns_count int not null,
  rows_count int not null,
  updated_at timestamptz not null,
  revision int not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists tiles (
  id text primary key,
  board_id text not null references boards(id) on delete cascade,
  position int not null,
  label_cs text not null,
  emoji text not null,
  visual_type text not null default 'emoji',
  image_remote_path text,
  category text not null,
  speech_mode text not null,
  audio_clip_id text,
  updated_at timestamptz not null,
  revision int not null default 1,
  created_at timestamptz not null default now()
);

alter table tiles
add column if not exists visual_type text not null default 'emoji';

alter table tiles
add column if not exists image_remote_path text;

update tiles
set speech_mode = case
  when audio_clip_id is not null then 'recording_only'
  else 'tts'
end
where speech_mode = 'recording_with_tts_fallback';

create table if not exists audio_clips (
  id text primary key,
  tile_id text not null references tiles(id) on delete cascade,
  remote_path text,
  duration_ms int not null default 0,
  checksum text,
  format text not null,
  updated_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists profile_settings (
  profile_id text primary key,
  pin_hash text not null,
  lock_enabled boolean not null default true,
  tts_rate real not null default 0.86,
  tts_pitch real not null default 1,
  preferred_voice text,
  high_contrast boolean not null default false,
  show_labels boolean not null default false,
  updated_at timestamptz not null,
  revision int not null default 1,
  created_at timestamptz not null default now()
);

alter table profile_settings
add column if not exists show_labels boolean not null default false;

create table if not exists phrase_events (
  id uuid primary key default gen_random_uuid(),
  profile_id text not null,
  tile_sequence text not null,
  spoken_text text not null,
  mode text not null,
  spoken_at timestamptz not null
);

create table if not exists sync_events (
  id bigint generated always as identity primary key,
  entity_type text not null,
  entity_id text not null,
  operation text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table boards enable row level security;
alter table tiles enable row level security;
alter table audio_clips enable row level security;
alter table profile_settings enable row level security;

-- NOTE: adapt auth.uid() joins to your membership model.
create policy if not exists boards_family_rw on boards
for all to authenticated
using (
  exists (
    select 1 from caregivers c
    where c.family_id = boards.family_id and c.id = auth.uid()
  )
)
with check (
  exists (
    select 1 from caregivers c
    where c.family_id = boards.family_id and c.id = auth.uid()
  )
);

create policy if not exists tiles_board_rw on tiles
for all to authenticated
using (
  exists (
    select 1
    from boards b
    join caregivers c on c.family_id = b.family_id
    where b.id = tiles.board_id and c.id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from boards b
    join caregivers c on c.family_id = b.family_id
    where b.id = tiles.board_id and c.id = auth.uid()
  )
);

create policy if not exists audio_clips_tile_rw on audio_clips
for all to authenticated
using (
  exists (
    select 1
    from tiles t
    join boards b on b.id = t.board_id
    join caregivers c on c.family_id = b.family_id
    where t.id = audio_clips.tile_id and c.id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from tiles t
    join boards b on b.id = t.board_id
    join caregivers c on c.family_id = b.family_id
    where t.id = audio_clips.tile_id and c.id = auth.uid()
  )
);

create policy if not exists settings_profile_rw on profile_settings
for all to authenticated
using (true)
with check (true);

-- storage bucket
insert into storage.buckets (id, name, public)
values ('audio-clips', 'audio-clips', false)
on conflict (id) do nothing;
