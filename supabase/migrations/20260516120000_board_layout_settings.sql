alter table profile_settings
add column if not exists board_layout_mode text not null default 'manual';

alter table profile_settings
add column if not exists category_order text not null default '["needs","feelings","social","food"]';
