create or replace function public.ensure_shift_instance(p_shift_id uuid, p_now timestamptz default now())
returns public.shift_instances
language plpgsql
security definer
set search_path = public
as $$
declare
  shift_row public.shifts%rowtype;
  tz text;
  local_ts timestamp;
  local_date date;
  local_time time;
  business_date date;
  starts_at timestamptz;
  ends_at timestamptz;
  deadline_at timestamptz;
  instance public.shift_instances%rowtype;
  new_status public.shift_instance_status;
begin
  if not public.is_supervisor() then
    raise exception 'not authorized';
  end if;

  select * into shift_row from public.shifts where id = p_shift_id and is_active = true;
  if not found then
    raise exception 'shift_not_found';
  end if;

  tz := shift_row.timezone;
  local_ts := timezone(tz, p_now);
  local_date := local_ts::date;
  local_time := local_ts::time;

  if shift_row.start_time > shift_row.end_time and local_time < shift_row.end_time then
    business_date := local_date - 1;
  else
    business_date := local_date;
  end if;

  starts_at := (business_date::timestamp + shift_row.start_time) at time zone tz;
  if shift_row.start_time > shift_row.end_time then
    ends_at := ((business_date + 1)::timestamp + shift_row.end_time) at time zone tz;
  else
    ends_at := (business_date::timestamp + shift_row.end_time) at time zone tz;
  end if;
  deadline_at := starts_at + make_interval(mins => shift_row.attendance_window_minutes);

  if p_now < starts_at then
    new_status := 'scheduled';
  elsif p_now >= ends_at then
    new_status := 'closed';
  else
    new_status := 'open';
  end if;

  insert into public.shift_instances (
    shift_id, business_date, starts_at, ends_at, attendance_deadline_at, status
  )
  values (p_shift_id, business_date, starts_at, ends_at, deadline_at, new_status)
  on conflict (shift_id, business_date) do nothing;

  select * into instance
  from public.shift_instances
  where shift_id = p_shift_id and business_date = business_date;

  if instance.status not in ('submitted', 'closed') then
    update public.shift_instances
    set status = new_status
    where id = instance.id
      and status not in ('submitted', 'closed')
    returning * into instance;
  end if;

  return instance;
end;
$$;

create or replace function public.submit_shift_attendance(
  p_instance_id uuid,
  p_decisions jsonb
)
returns public.shift_instances
language plpgsql
security definer
set search_path = public
as $$
declare
  instance public.shift_instances%rowtype;
  supervisor_id uuid;
  now_ts timestamptz := now();
  required_count integer;
  decision_count integer;
  missing_count integer;
  worker_row record;
  decision text;
  snapshot integer;
begin
  supervisor_id := public.current_supervisor_id();
  if supervisor_id is null then
    raise exception 'not authorized';
  end if;

  select * into instance from public.shift_instances where id = p_instance_id for update;
  if not found then
    raise exception 'instance_not_found';
  end if;

  if instance.status in ('submitted', 'closed') then
    return instance;
  end if;

  if now_ts < instance.starts_at then
    raise exception 'shift_not_open';
  end if;

  select count(*) into required_count
  from public.workers w
  where w.shift_id = instance.shift_id
    and w.employment_status = 'active';

  select count(*) into decision_count
  from jsonb_object_keys(p_decisions);

  if decision_count <> required_count then
    raise exception 'incomplete_attendance';
  end if;

  select count(*) into missing_count
  from public.workers w
  where w.shift_id = instance.shift_id
    and w.employment_status = 'active'
    and not (p_decisions ? w.id::text);

  if missing_count > 0 then
    raise exception 'incomplete_attendance';
  end if;

  for worker_row in
    select * from public.workers
    where shift_id = instance.shift_id
      and employment_status = 'active'
  loop
    decision := p_decisions ->> worker_row.id::text;
    if decision not in ('present', 'absent') then
      raise exception 'invalid_decision';
    end if;
    if decision = 'present' and now_ts >= instance.attendance_deadline_at then
      if not exists (
        select 1 from public.attendance_records
        where shift_instance_id = instance.id
          and worker_id = worker_row.id
          and status = 'present'
      ) then
        raise exception 'present_window_closed';
      end if;
    end if;

    snapshot := coalesce(
      public.salary_for_date(worker_row.id, instance.business_date),
      worker_row.daily_salary_kurus
    );

    insert into public.attendance_records (
      shift_instance_id,
      worker_id,
      status,
      daily_salary_kurus_snapshot,
      marked_at,
      marked_by,
      submitted_at,
      submitted_by
    )
    values (
      instance.id,
      worker_row.id,
      decision::public.attendance_status,
      snapshot,
      now_ts,
      supervisor_id,
      now_ts,
      supervisor_id
    )
    on conflict (shift_instance_id, worker_id)
    do update set
      status = excluded.status,
      daily_salary_kurus_snapshot = excluded.daily_salary_kurus_snapshot,
      marked_at = excluded.marked_at,
      marked_by = excluded.marked_by,
      submitted_at = excluded.submitted_at,
      submitted_by = excluded.submitted_by,
      updated_at = now();
  end loop;

  update public.shift_instances
  set status = 'submitted',
      submitted_at = now_ts,
      submitted_by = supervisor_id
  where id = instance.id
  returning * into instance;

  perform public.write_audit(
    'attendance.submitted',
    'shift_instance',
    instance.id,
    jsonb_build_object(
      'business_date', instance.business_date,
      'required_count', required_count
    )
  );

  return instance;
end;
$$;

grant execute on function public.ensure_shift_instance(uuid, timestamptz) to authenticated;
grant execute on function public.submit_shift_attendance(uuid, jsonb) to authenticated;
grant execute on function public.write_audit(text, text, uuid, jsonb) to authenticated;
grant execute on function public.next_worker_code() to authenticated;
grant execute on function public.is_supervisor() to authenticated;
grant execute on function public.current_supervisor_id() to authenticated;
grant execute on function public.salary_for_date(uuid, date) to authenticated;
