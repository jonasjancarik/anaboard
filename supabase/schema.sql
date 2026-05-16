-- ÁňaBoard v1 baseline schema (Supabase/Postgres)

create table if not exists families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

alter table families
add column if not exists created_by uuid default auth.uid();

create or replace function anaboard_canonicalize_email(input text)
returns text
language sql
immutable
returns null on null input
as $$
  with normalized as (
    select lower(trim(input)) as lowered
  ),
  parts as (
    select
      lowered,
      split_part(lowered, '@', 1) as local_part,
      split_part(lowered, '@', 2) as domain_part
    from normalized
  )
  select case
    when position('@' in lowered) = 0 then lowered
    when domain_part in ('gmail.com', 'googlemail.com') then
      regexp_replace(
        regexp_replace(local_part, '\+.*$', ''),
        '\.',
        '',
        'g'
      ) || '@gmail.com'
    else lowered
  end
  from parts;
$$;

create table if not exists caregivers (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

alter table caregivers
add column if not exists email_canonical text generated always as (anaboard_canonicalize_email(email)) stored;

create unique index if not exists caregivers_email_canonical_key
on caregivers (email_canonical);

alter table caregivers
drop constraint if exists caregivers_email_key;

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
  is_active boolean not null default true,
  updated_at timestamptz not null,
  revision int not null default 1,
  created_at timestamptz not null default now()
);

alter table boards
add column if not exists is_active boolean not null default true;

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
  backup_pin_enabled boolean not null default false,
  tts_rate real not null default 0.86,
  tts_pitch real not null default 1,
  preferred_voice text,
  high_contrast boolean not null default false,
  show_labels boolean not null default false,
  phrase_bar_enabled boolean not null default true,
  suggestion_count int not null default 3,
  updated_at timestamptz not null,
  revision int not null default 1,
  created_at timestamptz not null default now()
);

alter table profile_settings
add column if not exists backup_pin_enabled boolean not null default false;

alter table profile_settings
add column if not exists show_labels boolean not null default false;

alter table profile_settings
add column if not exists phrase_bar_enabled boolean not null default true;

alter table profile_settings
add column if not exists suggestion_count int not null default 3;

create table if not exists phrase_events (
  id uuid primary key default gen_random_uuid(),
  profile_id text not null,
  tile_sequence text not null,
  spoken_text text not null,
  mode text not null,
  spoken_at timestamptz not null
);

create table if not exists saved_phrases (
  id text primary key,
  profile_id text not null,
  phrase_key text not null,
  label text not null,
  spoken_text text not null,
  tokens_json text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  usage_count int not null default 0
);

create unique index if not exists saved_phrases_profile_phrase_key_key
on saved_phrases (profile_id, phrase_key);

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
alter table families enable row level security;
alter table caregivers enable row level security;
alter table profiles enable row level security;
alter table phrase_events enable row level security;
alter table saved_phrases enable row level security;
alter table sync_events enable row level security;

with ranked_caregivers as (
  select
    family_id,
    id as caregiver_id,
    row_number() over (partition by family_id order by created_at asc, id asc) as row_number
  from caregivers
)
update families
set created_by = ranked_caregivers.caregiver_id
from ranked_caregivers
where families.id = ranked_caregivers.family_id
  and ranked_caregivers.row_number = 1
  and families.created_by is null;

drop policy if exists families_select on families;
create policy families_select on families
for select to authenticated
using (
  created_by = auth.uid()
  or exists (
    select 1 from caregivers c
    where c.family_id = families.id and c.id = auth.uid()
  )
);

drop policy if exists families_insert on families;
create policy families_insert on families
for insert to authenticated
with check (coalesce(created_by, auth.uid()) = auth.uid());

drop policy if exists families_update on families;
create policy families_update on families
for update to authenticated
using (
  created_by = auth.uid()
  or exists (
    select 1 from caregivers c
    where c.family_id = families.id and c.id = auth.uid()
  )
)
with check (
  created_by = auth.uid()
  or exists (
    select 1 from caregivers c
    where c.family_id = families.id and c.id = auth.uid()
  )
);

drop policy if exists families_delete on families;
create policy families_delete on families
for delete to authenticated
using (created_by = auth.uid());

drop policy if exists caregivers_self_select on caregivers;
create policy caregivers_self_select on caregivers
for select to authenticated
using (id = auth.uid());

drop policy if exists caregivers_self_insert on caregivers;
create policy caregivers_self_insert on caregivers
for insert to authenticated
with check (
  id = auth.uid()
  and exists (
    select 1 from families f
    where f.id = caregivers.family_id and f.created_by = auth.uid()
  )
);

drop policy if exists profiles_family_rw on profiles;
create policy profiles_family_rw on profiles
for all to authenticated
using (
  exists (
    select 1 from caregivers c
    where c.family_id = profiles.family_id and c.id = auth.uid()
  )
)
with check (
  exists (
    select 1 from caregivers c
    where c.family_id = profiles.family_id and c.id = auth.uid()
  )
);

-- NOTE: adapt auth.uid() joins to your membership model.
drop policy if exists boards_family_rw on boards;
create policy boards_family_rw on boards
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

drop policy if exists tiles_board_rw on tiles;
create policy tiles_board_rw on tiles
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

drop policy if exists audio_clips_tile_rw on audio_clips;
create policy audio_clips_tile_rw on audio_clips
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

drop policy if exists settings_profile_rw on profile_settings;
create policy settings_profile_rw on profile_settings
for all to authenticated
using (
  exists (
    select 1
    from profiles p
    join caregivers c on c.family_id = p.family_id
    where p.id = profile_settings.profile_id and c.id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from profiles p
    join caregivers c on c.family_id = p.family_id
    where p.id = profile_settings.profile_id and c.id = auth.uid()
  )
);

drop policy if exists phrase_events_profile_rw on phrase_events;
create policy phrase_events_profile_rw on phrase_events
for all to authenticated
using (
  exists (
    select 1
    from profiles p
    join caregivers c on c.family_id = p.family_id
    where p.id = phrase_events.profile_id and c.id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from profiles p
    join caregivers c on c.family_id = p.family_id
    where p.id = phrase_events.profile_id and c.id = auth.uid()
  )
);

drop policy if exists saved_phrases_profile_rw on saved_phrases;
create policy saved_phrases_profile_rw on saved_phrases
for all to authenticated
using (
  exists (
    select 1
    from profiles p
    join caregivers c on c.family_id = p.family_id
    where p.id = saved_phrases.profile_id and c.id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from profiles p
    join caregivers c on c.family_id = p.family_id
    where p.id = saved_phrases.profile_id and c.id = auth.uid()
  )
);

-- storage bucket
insert into storage.buckets (id, name, public)
values ('audio-clips', 'audio-clips', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('tile-images', 'tile-images', false)
on conflict (id) do nothing;

drop policy if exists audio_clips_storage_select on storage.objects;
create policy audio_clips_storage_select on storage.objects
for select to authenticated
using (
  bucket_id = 'audio-clips'
  and exists (
    select 1
    from caregivers c
    where c.id = auth.uid()
      and c.family_id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists audio_clips_storage_insert on storage.objects;
create policy audio_clips_storage_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'audio-clips'
  and exists (
    select 1
    from caregivers c
    where c.id = auth.uid()
      and c.family_id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists audio_clips_storage_update on storage.objects;
create policy audio_clips_storage_update on storage.objects
for update to authenticated
using (
  bucket_id = 'audio-clips'
  and exists (
    select 1
    from caregivers c
    where c.id = auth.uid()
      and c.family_id::text = (storage.foldername(name))[1]
  )
)
with check (
  bucket_id = 'audio-clips'
  and exists (
    select 1
    from caregivers c
    where c.id = auth.uid()
      and c.family_id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists tile_images_storage_select on storage.objects;
create policy tile_images_storage_select on storage.objects
for select to authenticated
using (
  bucket_id = 'tile-images'
  and exists (
    select 1
    from caregivers c
    where c.id = auth.uid()
      and c.family_id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists tile_images_storage_insert on storage.objects;
create policy tile_images_storage_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'tile-images'
  and exists (
    select 1
    from caregivers c
    where c.id = auth.uid()
      and c.family_id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists tile_images_storage_update on storage.objects;
create policy tile_images_storage_update on storage.objects
for update to authenticated
using (
  bucket_id = 'tile-images'
  and exists (
    select 1
    from caregivers c
    where c.id = auth.uid()
      and c.family_id::text = (storage.foldername(name))[1]
  )
)
with check (
  bucket_id = 'tile-images'
  and exists (
    select 1
    from caregivers c
    where c.id = auth.uid()
      and c.family_id::text = (storage.foldername(name))[1]
  )
);
