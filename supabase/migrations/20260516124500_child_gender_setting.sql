alter table profile_settings
add column if not exists child_gender text not null default 'masculine';
