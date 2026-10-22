create or replace function public.submit_shift_attendance_checked(
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
begin
  if public.current_supervisor_id() is null then
    raise exception 'not authorized';
  end if;

  select * into instance
  from public.shift_instances
  where id = p_instance_id
  for update;
  if not found then
    raise exception 'instance_not_found';
  end if;

  if instance.status = 'submitted' then
    return instance;
  end if;
  if instance.status = 'closed' or now() >= instance.ends_at then
    raise exception 'shift_closed';
  end if;

  return public.submit_shift_attendance(p_instance_id, p_decisions);
end;
$$;

revoke all on function public.submit_shift_attendance_checked(uuid, jsonb)
  from public, anon;
grant execute on function public.submit_shift_attendance_checked(uuid, jsonb)
  to authenticated;

revoke all on function public.submit_shift_attendance(uuid, jsonb)
  from authenticated;
