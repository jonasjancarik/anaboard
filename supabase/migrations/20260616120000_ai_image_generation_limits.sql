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

alter table ai_image_generation_events enable row level security;

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
