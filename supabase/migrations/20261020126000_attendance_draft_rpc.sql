create or replace function public.save_attendance_decision(
  p_instance_id uuid,
  p_worker_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  instance public.shift_instances%rowtype;
  worker_row public.workers%rowtype;
  supervisor_id uuid;
  salary_snapshot integer;
  now_ts timestamptz := now();
begin
  supervisor_id := public.current_supervisor_id();
  if supervisor_id is null then
    raise exception 'not authorized';
  end if;

  select * into instance
  from public.shift_instances
  where id = p_instance_id
  for update;
  if not found then
    raise exception 'instance_not_found';
  end if;
  if instance.status in ('submitted', 'closed') or now_ts >= instance.ends_at then
    raise exception 'shift_closed';
  end if;
  if now_ts < instance.starts_at then
    raise exception 'shift_not_open';
  end if;

  select * into worker_row
  from public.workers
  where id = p_worker_id
    and shift_id = instance.shift_id
    and employment_status = 'active';
  if not found then
    raise exception 'worker_not_active_for_shift';
  end if;

  if p_status = 'pending' then
    delete from public.attendance_records
    where shift_instance_id = instance.id
      and worker_id = worker_row.id
      and submitted_at is null;
    return;
  end if;

  if p_status is null or p_status not in ('present', 'absent') then
    raise exception 'invalid_decision';
  end if;
  if p_status = 'present' and now_ts >= instance.attendance_deadline_at then
    raise exception 'present_window_closed';
  end if;

  salary_snapshot := coalesce(
    public.salary_for_date(worker_row.id, instance.business_date),
    worker_row.daily_salary_kurus
  );

  insert into public.attendance_records (
    shift_instance_id,
    worker_id,
    status,
    daily_salary_kurus_snapshot,
    marked_at,
    marked_by
  )
  values (
    instance.id,
    worker_row.id,
    p_status::public.attendance_status,
    salary_snapshot,
    now_ts,
    supervisor_id
  )
  on conflict (shift_instance_id, worker_id)
  do update set
    status = excluded.status,
    daily_salary_kurus_snapshot = excluded.daily_salary_kurus_snapshot,
    marked_at = excluded.marked_at,
    marked_by = excluded.marked_by,
    updated_at = now()
  where public.attendance_records.submitted_at is null;

  if not found then
    raise exception 'attendance_already_submitted';
  end if;
end;
$$;

revoke all on function public.save_attendance_decision(uuid, uuid, text)
  from public, anon;
grant execute on function public.save_attendance_decision(uuid, uuid, text)
  to authenticated;
