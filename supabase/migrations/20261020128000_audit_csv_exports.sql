create or replace function public.log_csv_export(
  p_report_type text,
  p_start_date date,
  p_end_date date,
  p_row_count integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_supervisor_id() is null then
    raise exception 'not authorized';
  end if;
  if p_report_type is null
    or p_report_type not in ('daily', 'weekly')
    or p_start_date is null
    or p_end_date is null
    or p_end_date < p_start_date
    or p_row_count is null
    or p_row_count < 0
  then
    raise exception 'invalid_export_metadata';
  end if;

  perform public.write_audit(
    'report.csv_exported',
    'report',
    null,
    jsonb_build_object(
      'report_type', p_report_type,
      'start_date', p_start_date,
      'end_date', p_end_date,
      'row_count', p_row_count
    )
  );
end;
$$;

revoke all on function public.log_csv_export(text, date, date, integer)
  from public, anon;
grant execute on function public.log_csv_export(text, date, date, integer)
  to authenticated;
