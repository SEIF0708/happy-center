create or replace function public.log_pdf_export(
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
  if p_start_date is null
    or p_end_date is null
    or p_end_date < p_start_date
    or p_row_count is null
    or p_row_count < 0
  then
    raise exception 'invalid_export_metadata';
  end if;

  perform public.write_audit(
    'report.pdf_exported',
    'report',
    null,
    jsonb_build_object(
      'report_type', 'weekly_payroll',
      'start_date', p_start_date,
      'end_date', p_end_date,
      'row_count', p_row_count
    )
  );
end;
$$;

revoke all on function public.log_pdf_export(date, date, integer)
  from public, anon;
grant execute on function public.log_pdf_export(date, date, integer)
  to authenticated;
