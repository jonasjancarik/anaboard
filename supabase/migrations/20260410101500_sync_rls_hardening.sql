alter table families
add column if not exists created_by uuid default auth.uid();

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

alter table families enable row level security;
alter table caregivers enable row level security;
alter table profiles enable row level security;
alter table phrase_events enable row level security;
alter table sync_events enable row level security;

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
