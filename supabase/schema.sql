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
  board_layout_mode text not null default 'manual',
  category_order text not null default '["needs","feelings","social","activities","food"]',
  categories_start_new_page boolean not null default true,
  child_gender text not null default 'masculine',
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

alter table profile_settings
add column if not exists board_layout_mode text not null default 'manual';

alter table profile_settings
add column if not exists category_order text not null default '["needs","feelings","social","activities","food"]';

alter table profile_settings
add column if not exists categories_start_new_page boolean not null default true;

alter table profile_settings
add column if not exists child_gender text not null default 'masculine';

create table if not exists phrase_events (
  id text primary key,
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

create table if not exists ai_image_generation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  family_id uuid references families(id) on delete set null,
  profile_id text,
  is_anonymous boolean not null default false,
  label_length int not null default 0,
  locale text not null default 'cs-CZ',
  category text,
  prompt_version text not null,
  model text not null,
  status text not null default 'accepted',
  error_message text,
  draft_storage_path text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint ai_image_generation_events_status_check
    check (status in ('accepted', 'succeeded', 'failed'))
);

create index if not exists ai_image_generation_events_user_created_idx
on ai_image_generation_events (user_id, created_at desc);

create index if not exists ai_image_generation_events_family_created_idx
on ai_image_generation_events (family_id, created_at desc)
where family_id is not null;

create index if not exists ai_image_generation_events_status_created_idx
on ai_image_generation_events (status, created_at desc);

revoke all on ai_image_generation_events from anon, authenticated;
grant select, insert, update on ai_image_generation_events to service_role;

create or replace function anaboard_consume_ai_image_generation_quota(
  p_user_id uuid,
  p_family_id uuid,
  p_profile_id text,
  p_is_anonymous boolean,
  p_label_length int,
  p_locale text,
  p_category text,
  p_prompt_version text,
  p_model text,
  p_rate_limit_window_seconds int,
  p_rate_limit_max int,
  p_anonymous_lifetime_limit int,
  p_signed_in_daily_limit int,
  p_family_daily_limit int,
  p_signed_in_monthly_limit int,
  p_family_monthly_limit int
)
returns table (
  event_id uuid,
  rate_limit_remaining int,
  signed_in_daily_remaining int,
  signed_in_monthly_remaining int,
  family_daily_remaining int,
  family_monthly_remaining int,
  anonymous_lifetime_remaining int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_rate_count int := 0;
  v_anonymous_lifetime_count int := 0;
  v_signed_in_daily_count int := 0;
  v_signed_in_monthly_count int := 0;
  v_family_daily_count int := 0;
  v_family_monthly_count int := 0;
begin
  if p_user_id is null then
    raise exception 'AI_IMAGE_CONFIG_ERROR: Missing quota user id';
  end if;

  if p_rate_limit_window_seconds < 1
    or p_rate_limit_max < 1
    or p_anonymous_lifetime_limit < 1
    or p_signed_in_daily_limit < 1
    or p_family_daily_limit < 1
    or p_signed_in_monthly_limit < 1
    or p_family_monthly_limit < 1
  then
    raise exception 'AI_IMAGE_CONFIG_ERROR: Invalid image generation quota config';
  end if;

  perform pg_advisory_xact_lock(hashtext('anaboard_ai_image_user'), hashtext(p_user_id::text));

  if p_family_id is not null then
    perform pg_advisory_xact_lock(hashtext('anaboard_ai_image_family'), hashtext(p_family_id::text));
  end if;

  select count(*) into v_rate_count
  from ai_image_generation_events
  where user_id = p_user_id
    and created_at >= v_now - (p_rate_limit_window_seconds * interval '1 second')
    and status in ('accepted', 'succeeded', 'failed');

  if v_rate_count >= p_rate_limit_max then
    raise exception 'AI_IMAGE_RATE_LIMIT: Chvilku počkej a zkus obrázek vygenerovat znovu.';
  end if;

  if p_is_anonymous then
    select count(*) into v_anonymous_lifetime_count
    from ai_image_generation_events
    where user_id = p_user_id
      and is_anonymous = true
      and status in ('accepted', 'succeeded', 'failed');

    if v_anonymous_lifetime_count >= p_anonymous_lifetime_limit then
      raise exception 'AI_IMAGE_ANONYMOUS_LIMIT: Bez účtu už je vyčerpaný limit AI obrázků. Přihlas se pro další.';
    end if;

    anonymous_lifetime_remaining := greatest(0, p_anonymous_lifetime_limit - v_anonymous_lifetime_count - 1);
    signed_in_daily_remaining := null;
    signed_in_monthly_remaining := null;
    family_daily_remaining := null;
    family_monthly_remaining := null;
  else
    select count(*) into v_signed_in_daily_count
    from ai_image_generation_events
    where user_id = p_user_id
      and is_anonymous = false
      and created_at >= date_trunc('day', v_now)
      and status in ('accepted', 'succeeded', 'failed');

    if v_signed_in_daily_count >= p_signed_in_daily_limit then
      raise exception 'AI_IMAGE_DAILY_LIMIT: Denní limit AI obrázků je vyčerpaný. Zkus to zítra.';
    end if;

    select count(*) into v_signed_in_monthly_count
    from ai_image_generation_events
    where user_id = p_user_id
      and is_anonymous = false
      and created_at >= date_trunc('month', v_now)
      and status in ('accepted', 'succeeded', 'failed');

    if v_signed_in_monthly_count >= p_signed_in_monthly_limit then
      raise exception 'AI_IMAGE_MONTHLY_LIMIT: Měsíční limit AI obrázků je vyčerpaný.';
    end if;

    signed_in_daily_remaining := greatest(0, p_signed_in_daily_limit - v_signed_in_daily_count - 1);
    signed_in_monthly_remaining := greatest(0, p_signed_in_monthly_limit - v_signed_in_monthly_count - 1);
    anonymous_lifetime_remaining := null;

    if p_family_id is not null then
      select count(*) into v_family_daily_count
      from ai_image_generation_events
      where family_id = p_family_id
        and created_at >= date_trunc('day', v_now)
        and status in ('accepted', 'succeeded', 'failed');

      if v_family_daily_count >= p_family_daily_limit then
        raise exception 'AI_IMAGE_FAMILY_DAILY_LIMIT: Denní rodinný limit AI obrázků je vyčerpaný. Zkus to zítra.';
      end if;

      select count(*) into v_family_monthly_count
      from ai_image_generation_events
      where family_id = p_family_id
        and created_at >= date_trunc('month', v_now)
        and status in ('accepted', 'succeeded', 'failed');

      if v_family_monthly_count >= p_family_monthly_limit then
        raise exception 'AI_IMAGE_FAMILY_MONTHLY_LIMIT: Měsíční rodinný limit AI obrázků je vyčerpaný.';
      end if;

      family_daily_remaining := greatest(0, p_family_daily_limit - v_family_daily_count - 1);
      family_monthly_remaining := greatest(0, p_family_monthly_limit - v_family_monthly_count - 1);
    else
      family_daily_remaining := null;
      family_monthly_remaining := null;
    end if;
  end if;

  event_id := gen_random_uuid();
  rate_limit_remaining := greatest(0, p_rate_limit_max - v_rate_count - 1);

  insert into ai_image_generation_events (
    id,
    user_id,
    family_id,
    profile_id,
    is_anonymous,
    label_length,
    locale,
    category,
    prompt_version,
    model,
    status
  )
  values (
    event_id,
    p_user_id,
    p_family_id,
    p_profile_id,
    p_is_anonymous,
    greatest(0, coalesce(p_label_length, 0)),
    coalesce(nullif(trim(p_locale), ''), 'cs-CZ'),
    nullif(trim(p_category), ''),
    p_prompt_version,
    p_model,
    'accepted'
  );

  return next;
end;
$$;

create or replace function anaboard_complete_ai_image_generation_event(
  p_event_id uuid,
  p_status text,
  p_draft_storage_path text default null,
  p_error_message text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('succeeded', 'failed') then
    raise exception 'AI_IMAGE_CONFIG_ERROR: Invalid image generation event status';
  end if;

  update ai_image_generation_events
  set
    status = p_status,
    draft_storage_path = nullif(trim(p_draft_storage_path), ''),
    error_message = left(nullif(trim(p_error_message), ''), 500),
    completed_at = now()
  where id = p_event_id;
end;
$$;

revoke all on function anaboard_consume_ai_image_generation_quota(
  uuid,
  uuid,
  text,
  boolean,
  int,
  text,
  text,
  text,
  text,
  int,
  int,
  int,
  int,
  int,
  int,
  int
) from public, anon, authenticated;

revoke all on function anaboard_complete_ai_image_generation_event(
  uuid,
  text,
  text,
  text
) from public, anon, authenticated;

grant execute on function anaboard_consume_ai_image_generation_quota(
  uuid,
  uuid,
  text,
  boolean,
  int,
  text,
  text,
  text,
  text,
  int,
  int,
  int,
  int,
  int,
  int,
  int
) to service_role;

grant execute on function anaboard_complete_ai_image_generation_event(
  uuid,
  text,
  text,
  text
) to service_role;

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
alter table ai_image_generation_events enable row level security;

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
    where p.id::text = profile_settings.profile_id and c.id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from profiles p
    join caregivers c on c.family_id = p.family_id
    where p.id::text = profile_settings.profile_id and c.id = auth.uid()
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
    where p.id::text = phrase_events.profile_id and c.id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from profiles p
    join caregivers c on c.family_id = p.family_id
    where p.id::text = phrase_events.profile_id and c.id = auth.uid()
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
    where p.id::text = saved_phrases.profile_id and c.id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from profiles p
    join caregivers c on c.family_id = p.family_id
    where p.id::text = saved_phrases.profile_id and c.id = auth.uid()
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
