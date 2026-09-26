-- 0009_bot_languages_and_amharic_services.sql
-- Persist Telegram language choices and add localized service names.

create table if not exists bot_users (
  telegram_chat_id bigint primary key,
  language text not null check (language in ('am', 'en')),
  created_at timestamptz not null default now()
);

alter table bot_users enable row level security;

alter table services
  add column if not exists name_am text;

update services
set name_am = case name
  when 'Haircut' then 'ጸጉር መቁረጥ'
  when 'Haircut + Beard' then 'ጸጉር መቁረጥ + ጢም'
  when 'Beard' then 'ጢም መቁረጥ'
  else name_am
end
where name in ('Haircut', 'Haircut + Beard', 'Beard');
