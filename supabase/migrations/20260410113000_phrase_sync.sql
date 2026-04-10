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

alter table saved_phrases enable row level security;

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
