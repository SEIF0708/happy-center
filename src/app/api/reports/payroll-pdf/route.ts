import { connection, NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { LOCALE_COOKIE } from "@/lib/constants";
import { resolveLocale } from "@/lib/i18n";
import { endOfWeekSunday, startOfWeekMonday, weekRangeHalfOpen } from "@/lib/time";
import { createWeeklyPayrollPdf } from "@/lib/payroll-pdf";
import { loadAttendanceReport, ReportDataError } from "@/lib/report-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function isIsoDate(value: string | null): value is string {
  return Boolean(
    value &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  );
}

function pdfResponse(pdf: Buffer, filename: string) {
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(request: NextRequest) {
  await connection();
  const [supabase, cookieStore] = await Promise.all([
    createSupabaseServerClient(),
    cookies(),
  ]);
  const locale = resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: supervisor, error: supervisorError } = await supabase
    .from("supervisors")
    .select("id,display_name")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (supervisorError) {
    console.error("Payroll PDF supervisor check failed:", supervisorError.message);
    return NextResponse.json({ error: "authorization_check_failed" }, { status: 500 });
  }
  if (!supervisor) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const requestedWeek = request.nextUrl.searchParams.get("week");
  if (!isIsoDate(requestedWeek)) {
    return NextResponse.json({ error: "invalid_week" }, { status: 400 });
  }
  const weekStart = startOfWeekMonday(requestedWeek);
  const weekEnd = endOfWeekSunday(weekStart);
  const range = weekRangeHalfOpen(weekStart);

  try {
    const report = await loadAttendanceReport(supabase, range.start, range.endExclusive);
    const pdf = await createWeeklyPayrollPdf({
      records: report.records,
      weekStart,
      weekEnd,
      supervisorName: supervisor.display_name,
      locale,
    });
    const { error: auditError } = await supabase.rpc("log_pdf_export", {
      p_start_date: weekStart,
      p_end_date: weekEnd,
      p_row_count: report.records.length,
    });
    if (auditError) {
      console.error("Payroll PDF export audit failed:", auditError.code, auditError.message);
      return NextResponse.json({ error: "audit_failed" }, { status: 500 });
    }
    return pdfResponse(pdf, `happy-center-payroll-${weekStart}.pdf`);
  } catch (error) {
    if (error instanceof ReportDataError) {
      console.error(error.message);
      return NextResponse.json({ error: "report_load_failed" }, { status: 500 });
    }
    throw error;
  }
}
