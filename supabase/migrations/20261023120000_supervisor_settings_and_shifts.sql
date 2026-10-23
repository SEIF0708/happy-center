create or replace function public.update_supervisor_display_name(p_display_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supervisor_id uuid;
  v_previous_name text;
  v_name text := btrim(coalesce(p_display_name, ''));
begin
  v_supervisor_id := public.current_supervisor_id();
  if v_supervisor_id is null then
    raise exception 'not authorized';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'invalid_display_name';
  end if;

  select display_name into v_previous_name
  from public.supervisors
  where id = v_supervisor_id
  for update;

  update public.supervisors
  set display_name = v_name
  where id = v_supervisor_id;

  perform public.write_audit(
    'supervisor.display_name_updated',
    'supervisor',
    v_supervisor_id,
    jsonb_build_object('previous_name', v_previous_name, 'display_name', v_name)
  );
end;
$$;

create or replace function public.save_shift(
  p_shift_id uuid,
  p_name text,
  p_start_time time,
  p_end_time time,
  p_attendance_window_minutes integer
)
returns public.shifts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supervisor_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_shift public.shifts%rowtype;
  v_previous public.shifts%rowtype;
begin
  v_supervisor_id := public.current_supervisor_id();
  if v_supervisor_id is null then
    raise exception 'not authorized';
  end if;
  if char_length(v_name) < 2
    or char_length(v_name) > 80
    or p_start_time is null
    or p_end_time is null
    or p_start_time = p_end_time
    or p_attendance_window_minutes is null
    or p_attendance_window_minutes < 1
    or p_attendance_window_minutes > 720
  then
    raise exception 'invalid_shift';
  end if;

  if p_shift_id is null then
    insert into public.shifts (
      name,
      start_time,
      end_time,
      attendance_window_minutes,
      timezone,
      is_active
    )
    values (
      v_name,
      p_start_time,
      p_end_time,
      p_attendance_window_minutes,
      'Europe/Istanbul',
      false
    )
    returning * into v_shift;

    perform public.write_audit(
      'shift.created',
      'shift',
      v_shift.id,
      jsonb_build_object(
        'name', v_shift.name,
        'start_time', v_shift.start_time,
        'end_time', v_shift.end_time,
        'attendance_window_minutes', v_shift.attendance_window_minutes
      )
    );
  else
    select * into v_previous
    from public.shifts
    where id = p_shift_id
    for update;
    if not found then
      raise exception 'shift_not_found';
    end if;

    update public.shifts
    set name = v_name,
        start_time = p_start_time,
        end_time = p_end_time,
        attendance_window_minutes = p_attendance_window_minutes
    where id = p_shift_id
    returning * into v_shift;

    perform public.write_audit(
      'shift.updated',
      'shift',
      v_shift.id,
      jsonb_build_object(
        'previous_name', v_previous.name,
        'name', v_shift.name,
        'previous_start_time', v_previous.start_time,
        'start_time', v_shift.start_time,
        'previous_end_time', v_previous.end_time,
        'end_time', v_shift.end_time,
        'previous_attendance_window_minutes', v_previous.attendance_window_minutes,
        'attendance_window_minutes', v_shift.attendance_window_minutes
      )
    );
  end if;

  return v_shift;
end;
$$;

create or replace function public.set_active_shift(p_shift_id uuid)
returns public.shifts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supervisor_id uuid;
  v_previous_shift_id uuid;
  v_shift public.shifts%rowtype;
begin
  v_supervisor_id := public.current_supervisor_id();
  if v_supervisor_id is null then
    raise exception 'not authorized';
  end if;

  perform pg_advisory_xact_lock(hashtext('public.shifts.single_active'));

  select * into v_shift
  from public.shifts
  where id = p_shift_id
  for update;
  if not found then
    raise exception 'shift_not_found';
  end if;

  select id into v_previous_shift_id
  from public.shifts
  where is_active = true
  limit 1;

  if v_previous_shift_id = p_shift_id then
    return v_shift;
  end if;

  if exists (
    select 1
    from public.shift_instances
    where shift_id = v_previous_shift_id
      and status in ('scheduled', 'open')
      and starts_at <= now()
      and ends_at > now()
  ) then
    raise exception 'shift_in_progress';
  end if;

  update public.shifts set is_active = false where is_active = true;
  update public.shifts
  set is_active = true
  where id = p_shift_id
  returning * into v_shift;

  perform public.write_audit(
    'shift.activated',
    'shift',
    v_shift.id,
    jsonb_build_object('previous_shift_id', v_previous_shift_id, 'name', v_shift.name)
  );

  return v_shift;
end;
$$;

create or replace function public.assign_worker_shift(p_worker_id uuid, p_shift_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supervisor_id uuid;
  v_worker public.workers%rowtype;
  v_shift_name text;
  v_previous_shift_name text;
begin
  v_supervisor_id := public.current_supervisor_id();
  if v_supervisor_id is null then
    raise exception 'not authorized';
  end if;

  select name into v_shift_name
  from public.shifts
  where id = p_shift_id;
  if not found then
    raise exception 'shift_not_found';
  end if;

  select * into v_worker
  from public.workers
  where id = p_worker_id
  for update;
  if not found then
    raise exception 'worker_not_found';
  end if;

  select name into v_previous_shift_name
  from public.shifts
  where id = v_worker.shift_id;

  if v_worker.shift_id = p_shift_id then
    return;
  end if;

  if exists (
    select 1
    from public.shift_instances
    where shift_id in (v_worker.shift_id, p_shift_id)
      and status in ('scheduled', 'open')
      and starts_at <= now()
      and ends_at > now()
  ) then
    raise exception 'shift_in_progress';
  end if;

  update public.workers set shift_id = p_shift_id where id = p_worker_id;

  perform public.write_audit(
    'worker.shift_assigned',
    'worker',
    p_worker_id,
    jsonb_build_object(
      'worker_code', v_worker.worker_code,
      'previous_shift', v_previous_shift_name,
      'shift', v_shift_name
    )
  );
end;
$$;

revoke all on function public.update_supervisor_display_name(text) from public, anon;
revoke all on function public.save_shift(uuid, text, time, time, integer) from public, anon;
revoke all on function public.set_active_shift(uuid) from public, anon;
revoke all on function public.assign_worker_shift(uuid, uuid) from public, anon;

grant execute on function public.update_supervisor_display_name(text) to authenticated;
grant execute on function public.save_shift(uuid, text, time, time, integer) to authenticated;
grant execute on function public.set_active_shift(uuid) to authenticated;
grant execute on function public.assign_worker_shift(uuid, uuid) to authenticated;
