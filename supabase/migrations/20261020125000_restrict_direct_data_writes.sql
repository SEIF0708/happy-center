revoke insert, update, delete
  on public.shifts, public.workers, public.worker_salary_history,
     public.shift_instances, public.attendance_records
  from authenticated;

grant select
  on public.shifts, public.workers, public.worker_salary_history,
     public.shift_instances, public.attendance_records
  to authenticated;

revoke all on function public.write_audit(text, text, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.next_worker_code()
  from public, anon, authenticated;
revoke all on function public.is_supervisor()
  from public, anon;
revoke all on function public.current_supervisor_id()
  from public, anon;
revoke all on function public.salary_for_date(uuid, date)
  from public, anon;
revoke all on function public.submit_shift_attendance(uuid, jsonb)
  from public, anon;

grant execute on function public.is_supervisor() to authenticated;
grant execute on function public.current_supervisor_id() to authenticated;
grant execute on function public.salary_for_date(uuid, date) to authenticated;
grant execute on function public.submit_shift_attendance(uuid, jsonb) to authenticated;
