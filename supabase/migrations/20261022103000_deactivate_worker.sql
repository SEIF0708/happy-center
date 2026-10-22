create or replace function public.deactivate_worker(p_worker_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supervisor_id uuid;
  worker public.workers%rowtype;
begin
  v_supervisor_id := public.current_supervisor_id();
  if v_supervisor_id is null then
    raise exception 'not authorized';
  end if;

  select * into worker
  from public.workers
  where id = p_worker_id
  for update;
  if not found then
    raise exception 'worker_not_found';
  end if;
  if worker.employment_status = 'inactive' then
    return false;
  end if;

  update public.workers
  set employment_status = 'inactive',
      deactivated_at = now(),
      updated_at = now()
  where id = worker.id;

  perform public.write_audit(
    'worker.deactivated',
    'worker',
    worker.id,
    jsonb_build_object(
      'worker_code', worker.worker_code,
      'full_name', worker.full_name,
      'previous_status', worker.employment_status,
      'new_status', 'inactive'
    )
  );

  return true;
end;
$$;

revoke all on function public.deactivate_worker(uuid) from public, anon;
grant execute on function public.deactivate_worker(uuid) to authenticated;
