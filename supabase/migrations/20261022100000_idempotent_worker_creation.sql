create table public.worker_creation_requests (
  supervisor_id uuid not null references public.supervisors (id) on delete cascade,
  request_id uuid not null,
  worker_id uuid not null unique references public.workers (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (supervisor_id, request_id)
);

alter table public.worker_creation_requests enable row level security;
revoke all on public.worker_creation_requests from public, anon, authenticated;

revoke all on function public.create_worker(text, uuid, integer)
  from public, anon, authenticated;
drop function public.create_worker(text, uuid, integer);

create function public.create_worker(
  p_full_name text,
  p_shift_id uuid,
  p_daily_salary_kurus integer,
  p_request_id uuid
)
returns public.workers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supervisor_id uuid;
  existing_worker public.workers%rowtype;
  shift_exists boolean;
  worker public.workers%rowtype;
  effective_date date;
begin
  v_supervisor_id := public.current_supervisor_id();
  if v_supervisor_id is null then
    raise exception 'not authorized';
  end if;
  if p_request_id is null then
    raise exception 'invalid_request_id';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_supervisor_id::text || ':' || p_request_id::text, 0)
  );

  select w.* into existing_worker
  from public.worker_creation_requests r
  join public.workers w on w.id = r.worker_id
  where r.supervisor_id = v_supervisor_id
    and r.request_id = p_request_id;
  if found then
    return existing_worker;
  end if;

  if p_full_name is null or char_length(trim(p_full_name)) < 2 or char_length(trim(p_full_name)) > 120 then
    raise exception 'invalid_worker_name';
  end if;
  if p_daily_salary_kurus is null or p_daily_salary_kurus < 0 or p_daily_salary_kurus > 50000000 then
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

  insert into public.worker_creation_requests (supervisor_id, request_id, worker_id)
  values (v_supervisor_id, p_request_id, worker.id);

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

revoke all on function public.create_worker(text, uuid, integer, uuid)
  from public, anon;
grant execute on function public.create_worker(text, uuid, integer, uuid)
  to authenticated;
