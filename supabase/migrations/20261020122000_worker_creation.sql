create or replace function public.create_worker(
  p_full_name text,
  p_shift_id uuid,
  p_daily_salary_kurus integer
)
returns public.workers
language plpgsql
security definer
set search_path = public
as $$
declare
  supervisor_id uuid;
  shift_exists boolean;
  worker public.workers%rowtype;
  effective_date date;
begin
  supervisor_id := public.current_supervisor_id();
  if supervisor_id is null then
    raise exception 'not authorized';
  end if;

  if char_length(trim(p_full_name)) < 2 or char_length(trim(p_full_name)) > 120 then
    raise exception 'invalid_worker_name';
  end if;
  if p_daily_salary_kurus < 0 or p_daily_salary_kurus > 50000000 then
    raise exception 'invalid_salary';
  end if;

  select exists (
    select 1 from public.shifts where id = p_shift_id and is_active = true
  ) into shift_exists;
  if not shift_exists then
    raise exception 'shift_not_found';
  end if;

  effective_date := timezone('Europe/Istanbul', now())::date;

  insert into public.workers (
    full_name,
    shift_id,
    daily_salary_kurus,
    employment_status,
    deactivated_at
  )
  values (trim(p_full_name), p_shift_id, p_daily_salary_kurus, 'active', null)
  returning * into worker;

  insert into public.worker_salary_history (
    worker_id,
    daily_salary_kurus,
    effective_from
  )
  values (worker.id, worker.daily_salary_kurus, effective_date);

  perform public.write_audit(
    'worker.created',
    'worker',
    worker.id,
    jsonb_build_object(
      'worker_code', worker.worker_code,
      'shift_id', worker.shift_id,
      'daily_salary_kurus', worker.daily_salary_kurus
    )
  );

  return worker;
end;
$$;

revoke all on function public.create_worker(text, uuid, integer) from public, anon;
grant execute on function public.create_worker(text, uuid, integer) to authenticated;
