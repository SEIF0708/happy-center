-- Restores the shift schedule and removes attendance/audit data created while
-- the temporary test window was open. Run in the Supabase SQL Editor.

begin;

do $restore_test_shift$
declare
  v_backup public.attendance_test_shift_backup%rowtype;
begin
  select * into v_backup
  from public.attendance_test_shift_backup
  where singleton = true
  for update;

  if not found then
    raise exception 'No temporary attendance test is active.';
  end if;

  update public.shifts
  set start_time = v_backup.original_start_time,
      end_time = v_backup.original_end_time,
      attendance_window_minutes = v_backup.original_attendance_window_minutes,
      updated_at = v_backup.original_shift_updated_at
  where id = v_backup.shift_id;

  update public.shift_instances
  set starts_at = v_backup.original_starts_at,
      ends_at = v_backup.original_ends_at,
      attendance_deadline_at = v_backup.original_attendance_deadline_at,
      status = v_backup.original_status,
      submitted_at = v_backup.original_submitted_at,
      submitted_by = v_backup.original_submitted_by
  where id = v_backup.shift_instance_id;

  delete from public.attendance_records
  where shift_instance_id = v_backup.shift_instance_id;

  delete from public.audit_events
  where entity_type = 'shift_instance'
    and entity_id = v_backup.shift_instance_id
    and event_type = 'attendance.submitted'
    and created_at >= v_backup.backed_up_at;

  delete from public.attendance_test_shift_backup
  where singleton = true;
end;
$restore_test_shift$;

commit;

drop table public.attendance_test_shift_backup;
