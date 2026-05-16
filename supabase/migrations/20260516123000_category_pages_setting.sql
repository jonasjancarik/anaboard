alter table profile_settings
add column if not exists categories_start_new_page boolean not null default true;
