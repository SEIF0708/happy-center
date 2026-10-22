-- Temporarily opens today's only active shift for real attendance testing.
-- Run in the Supabase SQL Editor. Run restore_current_shift_after_testing.sql
-- as soon as testing is complete. While open, all supervisors can see and edit
-- this real shift and its attendance records.

begin;

create table if not exists public.attendance_test_shift_backup (
  singleton boolean primary key default true check (singleton),
  shift_id uuid not null,
  original_start_time time not null,
  original_end_time time not null,
  original_attendance_window_minutes integer not null,
  original_shift_updated_at timestamptz not null,
  shift_instance_id uuid not null,
  original_starts_at timestamptz not null,
  original_ends_at timestamptz not null,
  original_attendance_deadline_at timestamptz not null,
  original_status public.shift_instance_status not null,
  original_submitted_at timestamptz,
  original_submitted_by uuid,
  backed_up_at timestamptz not null default now()
);

alter table public.attendance_test_shift_backup enable row level security;
revoke all on public.attendance_test_shift_backup from public, anon, authenticated;

do $open_test_shift$
declare
  v_shift public.shifts%rowtype;
  v_instance public.shift_instances%rowtype;
  v_backup public.attendance_test_shift_backup%rowtype;
  v_active_shift_count integer;
  v_attendance_count integer;
  v_local_now timestamp;
  v_business_date date;
  v_test_start time;
  v_test_end time;
  v_test_starts_at timestamptz;
  v_test_ends_at timestamptz;
begin
  if exists (select 1 from public.attendance_test_shift_backup) then
    raise exception 'A temporary attendance test is already active. Restore it before opening another.';
  end if;

  select count(*) into v_active_shift_count
  from public.shifts
  where is_active = true;

  if v_active_shift_count <> 1 then
    raise exception 'Expected exactly one active shift; no changes were made.';
  end if;

  select * into v_shift
  from public.shifts
  where is_active = true
  order by start_time, id
  limit 1
  for update;

  v_local_now := timezone(v_shift.timezone, now());
  if v_shift.start_time > v_shift.end_time
    and v_local_now::time < v_shift.end_time then
    v_business_date := v_local_now::date - 1;
  else
    v_business_date := v_local_now::date;
  end if;

  if v_business_date <> v_local_now::date then
    raise exception 'Run this script during the shift business date, not after an overnight shift has crossed midnight.';
  end if;

  select * into v_instance
  from public.shift_instances
  where shift_id = v_shift.id
    and business_date = v_business_date
  for update;

  if not found then
    raise exception 'No current shift instance exists. Open /attendance once, then run this script again.';
  end if;

  if v_instance.status in ('submitted', 'closed') or now() >= v_instance.ends_at then
    raise exception 'The current shift is already submitted or closed; no changes were made.';
  end if;

  select count(*) into v_attendance_count
  from public.attendance_records
  where shift_instance_id = v_instance.id;

  if v_attendance_count <> 0 then
    raise exception 'The current shift already has attendance records; no changes were made.';
  end if;

  select * into v_backup
  from public.attendance_test_shift_backup
  where singleton = true;
  if found then
    raise exception 'A temporary attendance test is already active. Restore it before opening another.';
  end if;

  if v_local_now::time < time '00:05' then
    v_test_start := time '00:00';
  else
    v_test_start := (date_trunc('minute', v_local_now) - interval '5 minutes')::time;
  end if;
  v_test_end := (v_test_start + interval '12 hours')::time;
  v_test_starts_at := (v_instance.business_date + v_test_start) at time zone v_shift.timezone;
  v_test_ends_at := (
    (v_instance.business_date + case when v_test_end <= v_test_start then 1 else 0 end) + v_test_end
  ) at time zone v_shift.timezone;

  insert into public.attendance_test_shift_backup (
    shift_id,
    original_start_time,
    original_end_time,
    original_attendance_window_minutes,
    original_shift_updated_at,
    shift_instance_id,
    original_starts_at,
    original_ends_at,
    original_attendance_deadline_at,
    original_status,
    original_submitted_at,
    original_submitted_by
  )
  values (
    v_shift.id,
    v_shift.start_time,
    v_shift.end_time,
    v_shift.attendance_window_minutes,
    v_shift.updated_at,
    v_instance.id,
    v_instance.starts_at,
    v_instance.ends_at,
    v_instance.attendance_deadline_at,
    v_instance.status,
    v_instance.submitted_at,
    v_instance.submitted_by
  );

  update public.shifts
  set start_time = v_test_start,
      end_time = v_test_end,
      attendance_window_minutes = 720,
      updated_at = now()
  where id = v_shift.id;

  update public.shift_instances
  set starts_at = v_test_starts_at,
      ends_at = v_test_ends_at,
      attendance_deadline_at = v_test_ends_at,
      status = 'open',
      submitted_at = null,
      submitted_by = null
  where id = v_instance.id;
end;
$open_test_shift$;

commit;

select
  s.name as shift_name,
  s.start_time,
  s.end_time,
  s.attendance_window_minutes,
  si.business_date,
  si.status,
  si.starts_at,
  si.attendance_deadline_at,
  si.ends_at
from public.attendance_test_shift_backup b
join public.shifts s on s.id = b.shift_id
join public.shift_instances si on si.id = b.shift_instance_id;
