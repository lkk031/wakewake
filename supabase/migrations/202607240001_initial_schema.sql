create extension if not exists pgcrypto;

create type public.todo_priority as enum ('none', 'low', 'medium', 'high');
create type public.todo_status as enum ('open', 'completed');
create type public.todo_timing_kind as enum ('unscheduled', 'timed', 'all_day');
create type public.occurrence_status as enum ('open', 'completed', 'cancelled');
create type public.device_platform as enum ('ios', 'android');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text not null default 'Asia/Shanghai',
  locale text not null default 'zh-CN',
  week_starts_on smallint not null default 1 check (week_starts_on between 0 and 6),
  default_duration_minutes integer not null default 30 check (default_duration_minutes between 5 and 1440),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80), color text not null,
  sort_order integer not null default 0, is_default boolean not null default false,
  archived_at timestamptz, version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create unique index categories_one_active_default_per_user on public.categories(user_id) where is_default and deleted_at is null;

create table public.todos (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  title text not null check (char_length(trim(title)) between 1 and 200), notes text not null default '' check (char_length(notes) <= 5000),
  priority public.todo_priority not null default 'none', status public.todo_status not null default 'open',
  timing_kind public.todo_timing_kind not null default 'unscheduled',
  start_at timestamptz, due_at timestamptz, all_day_start_date date, all_day_end_date date,
  timezone text not null default 'Asia/Shanghai', rrule text, recurrence_anchor_local timestamp,
  completed_at timestamptz, version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  constraint todos_timing_shape check (
    (timing_kind = 'unscheduled' and start_at is null and due_at is null and all_day_start_date is null and all_day_end_date is null) or
    (timing_kind = 'timed' and (start_at is not null or due_at is not null) and all_day_start_date is null and all_day_end_date is null) or
    (timing_kind = 'all_day' and start_at is null and due_at is null and all_day_start_date is not null and all_day_end_date > all_day_start_date)
  ),
  constraint todos_time_order check (start_at is null or due_at is null or due_at >= start_at),
  constraint todos_completion_shape check ((status = 'open' and completed_at is null) or (status = 'completed' and completed_at is not null))
);
create index todos_user_range on public.todos(user_id, due_at, start_at) where deleted_at is null;
create index todos_user_updated on public.todos(user_id, updated_at, id);

create table public.todo_occurrence_overrides (
  id uuid primary key default gen_random_uuid(), todo_id uuid not null references public.todos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, occurrence_key text not null,
  original_start_at timestamptz not null, override_start_at timestamptz, override_due_at timestamptz,
  override_payload jsonb, status public.occurrence_status not null default 'open', completed_at timestamptz,
  version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique(todo_id, occurrence_key)
);

create table public.reminder_rules (
  id uuid primary key, todo_id uuid not null references public.todos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  offset_minutes integer not null check (offset_minutes between 0 and 525600), sort_order integer not null default 0,
  version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique(todo_id, offset_minutes)
);

create table public.user_default_reminders (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  offset_minutes integer not null check (offset_minutes between 0 and 525600), sort_order integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id, offset_minutes)
);

create table public.device_push_tokens (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null, platform public.device_platform not null, expo_push_token text not null,
  app_version text not null, last_seen_at timestamptz not null default now(), disabled_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id, device_id)
);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id) values(new.id);
  insert into public.categories(user_id, name, color, is_default) values(new.id, '默认', 'indigo', true);
  insert into public.user_default_reminders(user_id, offset_minutes, sort_order) values
    (new.id, 1440, 0), (new.id, 60, 1), (new.id, 10, 2);
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.todos enable row level security;
alter table public.todo_occurrence_overrides enable row level security;
alter table public.reminder_rules enable row level security;
alter table public.user_default_reminders enable row level security;
alter table public.device_push_tokens enable row level security;

create policy profiles_own_all on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy categories_own_all on public.categories for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy todos_own_all on public.todos for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy occurrence_overrides_own_all on public.todo_occurrence_overrides for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy reminder_rules_own_all on public.reminder_rules for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy default_reminders_own_all on public.user_default_reminders for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy device_tokens_own_all on public.device_push_tokens for all using (user_id = auth.uid()) with check (user_id = auth.uid());
