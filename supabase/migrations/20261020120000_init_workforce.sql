-- Happy Center Workforce — initial schema, RLS, and night-shift seed.

create extension if not exists pgcrypto;

create type public.employment_status as enum ('active', 'inactive');
create type public.shift_instance_status as enum ('scheduled', 'open', 'submitted', 'closed');
create type public.attendance_status as enum ('present', 'absent');

create table public.supervisors (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 2 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 80),
  start_time time not null,
  end_time time not null,
  attendance_window_minutes integer not null check (attendance_window_minutes > 0 and attendance_window_minutes <= 720),
  timezone text not null default 'Europe/Istanbul' check (timezone = 'Europe/Istanbul'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shifts_nonzero_duration check (start_time <> end_time)
);

create sequence public.worker_code_seq as bigint start with 1 increment by 1;

create table public.workers (
  id uuid primary key default gen_random_uuid(),
  worker_code text not null unique,
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  photo_path text,
  shift_id uuid not null references public.shifts (id),
  daily_salary_kurus integer not null check (daily_salary_kurus >= 0 and daily_salary_kurus <= 50000000),
  employment_status public.employment_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deactivated_at timestamptz,
  constraint workers_inactive_has_timestamp check (
    (employment_status = 'active' and deactivated_at is null)
    or (employment_status = 'inactive' and deactivated_at is not null)
  )
);

create table public.worker_salary_history (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers (id) on delete cascade,
  daily_salary_kurus integer not null check (daily_salary_kurus >= 0 and daily_salary_kurus <= 50000000),
  effective_from date not null,
  created_at timestamptz not null default now(),
  unique (worker_id, effective_from)
);

create table public.shift_instances (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts (id),
  business_date date not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  attendance_deadline_at timestamptz not null,
  status public.shift_instance_status not null default 'scheduled',
  submitted_at timestamptz,
  submitted_by uuid references public.supervisors (id),
  created_at timestamptz not null default now(),
  unique (shift_id, business_date),
  constraint shift_instances_time_order check (starts_at < ends_at),
  constraint shift_instances_deadline_order check (attendance_deadline_at > starts_at)
);

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  shift_instance_id uuid not null references public.shift_instances (id),
  worker_id uuid not null references public.workers (id),
  status public.attendance_status not null,
  daily_salary_kurus_snapshot integer not null check (daily_salary_kurus_snapshot >= 0),
  marked_at timestamptz not null default now(),
  marked_by uuid not null references public.supervisors (id),
  submitted_at timestamptz,
  submitted_by uuid references public.supervisors (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shift_instance_id, worker_id)
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.supervisors (id),
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  event_details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index workers_shift_status_idx on public.workers (shift_id, employment_status);
create index workers_name_idx on public.workers (full_name);
create index attendance_instance_idx on public.attendance_records (shift_instance_id);
create index attendance_worker_idx on public.attendance_records (worker_id);
create index shift_instances_date_idx on public.shift_instances (business_date);
create index audit_created_idx on public.audit_events (created_at desc);
create index salary_history_lookup_idx on public.worker_salary_history (worker_id, effective_from desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger supervisors_updated_at before update on public.supervisors
for each row execute function public.set_updated_at();
create trigger shifts_updated_at before update on public.shifts
for each row execute function public.set_updated_at();
create trigger workers_updated_at before update on public.workers
for each row execute function public.set_updated_at();
create trigger attendance_updated_at before update on public.attendance_records
for each row execute function public.set_updated_at();

create or replace function public.current_supervisor_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.supervisors where auth_user_id = auth.uid()
$$;

create or replace function public.is_supervisor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.supervisors where auth_user_id = auth.uid())
$$;

create or replace function public.next_worker_code()
returns text
language plpgsql
as $$
declare
  n bigint;
begin
  n := nextval('public.worker_code_seq');
  return 'HC' || lpad(n::text, 6, '0');
end;
$$;

create or replace function public.workers_assign_code()
returns trigger
language plpgsql
as $$
begin
  if new.worker_code is null or btrim(new.worker_code) = '' then
    new.worker_code := public.next_worker_code();
  end if;
  return new;
end;
$$;

create trigger workers_assign_code before insert on public.workers
for each row execute function public.workers_assign_code();

create or replace function public.prevent_worker_code_change()
returns trigger
language plpgsql
as $$
begin
  if new.worker_code is distinct from old.worker_code then
    raise exception 'worker_code is immutable';
  end if;
  return new;
end;
$$;

create trigger workers_protect_code before update on public.workers
for each row execute function public.prevent_worker_code_change();

create or replace function public.protect_submitted_attendance()
returns trigger
language plpgsql
as $$
declare
  instance_status public.shift_instance_status;
begin
  select status into instance_status from public.shift_instances where id = coalesce(new.shift_instance_id, old.shift_instance_id);
  if instance_status in ('submitted', 'closed') then
    raise exception 'confirmed attendance cannot be changed';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger attendance_protect before update or delete on public.attendance_records
for each row execute function public.protect_submitted_attendance();

create or replace function public.write_audit(
  p_event_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_events (actor_id, event_type, entity_type, entity_id, event_details)
  values (public.current_supervisor_id(), p_event_type, p_entity_type, p_entity_id, coalesce(p_details, '{}'::jsonb));
end;
$$;

create or replace function public.salary_for_date(p_worker_id uuid, p_business_date date)
returns integer
language sql
stable
as $$
  select daily_salary_kurus
  from public.worker_salary_history
  where worker_id = p_worker_id
    and effective_from <= p_business_date
  order by effective_from desc
  limit 1
$$;

-- Seed default night shift. Idempotent on name.
insert into public.shifts (name, start_time, end_time, attendance_window_minutes, timezone, is_active)
select 'Night Shift', '22:00', '06:00', 60, 'Europe/Istanbul', true
where not exists (select 1 from public.shifts where name = 'Night Shift');

alter table public.supervisors enable row level security;
alter table public.shifts enable row level security;
alter table public.workers enable row level security;
alter table public.worker_salary_history enable row level security;
alter table public.shift_instances enable row level security;
alter table public.attendance_records enable row level security;
alter table public.audit_events enable row level security;

create policy supervisors_select on public.supervisors
  for select to authenticated using (public.is_supervisor());
create policy supervisors_update_self on public.supervisors
  for update to authenticated using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());

create policy shifts_select on public.shifts
  for select to authenticated using (public.is_supervisor());
create policy shifts_write on public.shifts
  for all to authenticated using (public.is_supervisor()) with check (public.is_supervisor());

create policy workers_all on public.workers
  for all to authenticated using (public.is_supervisor()) with check (public.is_supervisor());

create policy salary_history_all on public.worker_salary_history
  for all to authenticated using (public.is_supervisor()) with check (public.is_supervisor());

create policy shift_instances_all on public.shift_instances
  for all to authenticated using (public.is_supervisor()) with check (public.is_supervisor());

create policy attendance_all on public.attendance_records
  for all to authenticated using (public.is_supervisor()) with check (public.is_supervisor());

create policy audit_select on public.audit_events
  for select to authenticated using (public.is_supervisor());

revoke insert, update, delete on public.audit_events from authenticated, anon;
revoke all on public.supervisors from anon;
revoke all on public.workers from anon;
revoke all on public.shifts from anon;
revoke all on public.shift_instances from anon;
revoke all on public.attendance_records from anon;
revoke all on public.worker_salary_history from anon;
revoke all on public.audit_events from anon;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.shifts, public.workers, public.worker_salary_history, public.shift_instances, public.attendance_records to authenticated;
grant select, update on public.supervisors to authenticated;
grant select on public.audit_events to authenticated;
grant usage, select on sequence public.worker_code_seq to authenticated;

insert into storage.buckets (id, name, public)
values ('worker-photos', 'worker-photos', false)
on conflict (id) do update set public = false;

create policy worker_photos_select on storage.objects
  for select to authenticated
  using (bucket_id = 'worker-photos' and public.is_supervisor());

create policy worker_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'worker-photos'
    and public.is_supervisor()
  );

create policy worker_photos_update on storage.objects
  for update to authenticated
  using (bucket_id = 'worker-photos' and public.is_supervisor())
  with check (bucket_id = 'worker-photos' and public.is_supervisor());

create policy worker_photos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'worker-photos' and public.is_supervisor());
