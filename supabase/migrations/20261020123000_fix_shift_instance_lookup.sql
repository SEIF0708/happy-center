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
  instance_date date;
  starts_at timestamptz;
  ends_at timestamptz;
  deadline_at timestamptz;
  instance public.shift_instances%rowtype;
  new_status public.shift_instance_status;
begin
  if not public.is_supervisor() then
    raise exception 'not authorized';
  end if;

  select * into shift_row
  from public.shifts
  where id = p_shift_id and is_active = true;
  if not found then
    raise exception 'shift_not_found';
  end if;

  tz := shift_row.timezone;
  local_ts := timezone(tz, p_now);
  local_date := local_ts::date;
  local_time := local_ts::time;

  if shift_row.start_time > shift_row.end_time and local_time < shift_row.end_time then
    instance_date := local_date - 1;
  else
    instance_date := local_date;
  end if;

  starts_at := (instance_date::timestamp + shift_row.start_time) at time zone tz;
  if shift_row.start_time > shift_row.end_time then
    ends_at := ((instance_date + 1)::timestamp + shift_row.end_time) at time zone tz;
  else
    ends_at := (instance_date::timestamp + shift_row.end_time) at time zone tz;
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
  values (p_shift_id, instance_date, starts_at, ends_at, deadline_at, new_status)
  on conflict (shift_id, business_date) do nothing;

  select si.* into instance
  from public.shift_instances si
  where si.shift_id = p_shift_id
    and si.business_date = instance_date;

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
