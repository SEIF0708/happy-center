import { connection, NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { LOCALE_COOKIE } from "@/lib/constants";
import { resolveLocale, getMessages } from "@/lib/i18n";
import { toReportCsv } from "@/lib/csv";
import { endOfWeekSunday, startOfWeekMonday, weekRangeHalfOpen, addCalendarDays, formatDateTime } from "@/lib/time";
import { sumPayable, weeklyByWorker } from "@/lib/payroll";
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

function csvResponse(csv: string, filename: string) {
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function formatCsvDate(date: string, locale: "tr" | "ar"): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Istanbul",
  }).format(new Date(`${date}T12:00:00+03:00`));
}

function formatCsvMoney(kurus: number, locale: "tr" | "ar"): string {
  if (!Number.isInteger(kurus)) {
    throw new Error("Monetary amounts must be integer kuruş");
  }
  return new Intl.NumberFormat(locale === "ar" ? "ar" : "tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(kurus / 100);
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
    console.error("CSV export supervisor check failed:", supervisorError.message);
    return NextResponse.json({ error: "authorization_check_failed" }, { status: 500 });
  }
  if (!supervisor) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const type = params.get("type");
  if (type === "daily") {
    const date = params.get("date");
    if (!isIsoDate(date)) {
      return NextResponse.json({ error: "invalid_date" }, { status: 400 });
    }
    return buildDailyExport(supabase, date, supervisor.display_name, locale);
  }
  if (type === "weekly") {
    const week = params.get("week");
    if (!isIsoDate(week)) {
      return NextResponse.json({ error: "invalid_week" }, { status: 400 });
    }
    return buildWeeklyExport(supabase, startOfWeekMonday(week), supervisor.display_name, locale);
  }
  return NextResponse.json({ error: "invalid_report_type" }, { status: 400 });
}

async function buildDailyExport(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  date: string,
  supervisorName: string,
  locale: "tr" | "ar",
) {
  const range = { start: date, endExclusive: addCalendarDays(date, 1) };
  try {
    const t = getMessages(locale);
    const report = await loadAttendanceReport(supabase, range.start, range.endExclusive);
    const present = report.records.filter((record) => record.status === "present");
    const absent = report.records.filter((record) => record.status === "absent");
    const rows = report.records.map((record) => [
      formatCsvDate(record.businessDate, locale),
      record.shiftName,
      record.workerCode,
      record.fullName,
      record.status === "present" ? t.present : t.absent,
      formatCsvMoney(record.dailySalaryKurusSnapshot, locale),
      formatCsvMoney(record.status === "present" ? record.dailySalaryKurusSnapshot : 0, locale),
      formatDateTime(record.submittedAt, locale),
    ]);
    const total = sumPayable(report.records);
    const { error } = await supabase.rpc("log_csv_export", {
      p_report_type: "daily",
      p_start_date: date,
      p_end_date: date,
      p_row_count: rows.length,
    });
    if (error) {
      console.error("CSV export audit failed:", error.code, error.message);
      return NextResponse.json({ error: "audit_failed" }, { status: 500 });
    }
    const csv = toReportCsv({
      title: `HAPPY CENTER — ${t.attendanceCsvTitle}`,
      metadata: [
        [t.businessDate, formatCsvDate(date, locale)],
        [t.supervisor, supervisorName],
        [t.reportTotalWorkers, rows.length],
        [t.present, present.length],
        [t.absent, absent.length],
        [t.grandTotal, `${formatCsvMoney(total, locale)} TRY`],
      ],
      headers: [
        t.csvDate,
        t.csvShift,
        t.csvWorkerCode,
        t.csvWorkerName,
        t.csvStatus,
        t.csvDailyRate,
        t.csvAmountDue,
        t.csvConfirmedAt,
      ],
      rows,
      totals: [
        t.csvTotal,
        "",
        "",
        `${rows.length} ${t.reportTotalWorkers.toLocaleLowerCase(locale)}`,
        `${present.length} ${t.present.toLocaleLowerCase(locale)}; ${absent.length} ${t.absent.toLocaleLowerCase(locale)}`,
        "",
        `${formatCsvMoney(total, locale)} TRY`,
        "",
      ],
    });
    return csvResponse(csv, `attendance-${date}.csv`);
  } catch (error) {
    if (error instanceof ReportDataError) {
      console.error(error.message);
      return NextResponse.json({ error: "report_load_failed" }, { status: 500 });
    }
    throw error;
  }
}

async function buildWeeklyExport(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  week: string,
  supervisorName: string,
  locale: "tr" | "ar",
) {
  const range = weekRangeHalfOpen(week);
  try {
    const t = getMessages(locale);
    const report = await loadAttendanceReport(supabase, range.start, range.endExclusive);
    const grouped = weeklyByWorker(report.records);
    const weekEnd = endOfWeekSunday(week);
    const rows = grouped.map((worker) => [
      worker.fullName,
      worker.workerCode,
      worker.workDates.map((date) => formatCsvDate(date, locale)).join(", "),
      worker.absentDates.map((date) => formatCsvDate(date, locale)).join(", "),
      worker.present,
      worker.absent,
      worker.present,
      formatCsvMoney(worker.latestSnapshotKurus, locale),
      formatCsvMoney(worker.earningsKurus, locale),
    ]);
    const totalPay = report.records.reduce(
      (total, record) => total + (record.status === "present" ? record.dailySalaryKurusSnapshot : 0),
      0,
    );
    const { error } = await supabase.rpc("log_csv_export", {
      p_report_type: "weekly",
      p_start_date: week,
      p_end_date: weekEnd,
      p_row_count: rows.length,
    });
    if (error) {
      console.error("CSV export audit failed:", error.code, error.message);
      return NextResponse.json({ error: "audit_failed" }, { status: 500 });
    }
    const csv = toReportCsv({
      title: `HAPPY CENTER — ${t.payrollCsvTitle}`,
      metadata: [
        [`${t.weekRange}: ${t.csvWeekStart}`, formatCsvDate(week, locale)],
        [t.csvWeekEnd, formatCsvDate(weekEnd, locale)],
        [t.supervisor, supervisorName],
        [t.reportTotalWorkers, grouped.length],
        [t.totalWorkDays, grouped.reduce((total, worker) => total + worker.present, 0)],
        [t.grandTotal, `${formatCsvMoney(totalPay, locale)} TRY`],
      ],
      headers: [
        t.csvWorkerName,
        t.csvWorkerCode,
        t.csvWorkDates,
        t.csvAbsenceDates,
        t.csvPresentDays,
        t.csvAbsentDays,
        t.workedDays,
        t.csvDailyRate,
        t.csvAmountDue,
      ],
      rows,
      totals: [
        t.csvTotal,
        "",
        "",
        "",
        grouped.reduce((total, worker) => total + worker.present, 0),
        grouped.reduce((total, worker) => total + worker.absent, 0),
        grouped.reduce((total, worker) => total + worker.present, 0),
        "",
        `${formatCsvMoney(totalPay, locale)} TRY`,
      ],
    });
    return csvResponse(csv, `payroll-${week}.csv`);
  } catch (error) {
    if (error instanceof ReportDataError) {
      console.error(error.message);
      return NextResponse.json({ error: "report_load_failed" }, { status: 500 });
    }
    throw error;
  }
}
