alter table profile_settings
alter column category_order set default '["needs","feelings","social","activities","food"]';

update profile_settings
set category_order = '["needs","feelings","social","activities","food"]'
where category_order = '["needs","feelings","social","food"]';
