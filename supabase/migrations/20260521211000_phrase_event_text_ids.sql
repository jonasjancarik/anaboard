alter table phrase_events
alter column id drop default;

alter table phrase_events
alter column id type text using id::text;
