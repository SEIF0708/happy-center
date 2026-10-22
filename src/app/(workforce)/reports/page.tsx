import Link from "next/link";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { LOCALE_COOKIE } from "@/lib/constants";
import { resolveLocale, getMessages } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ReportDataError, loadAttendanceReport } from "@/lib/report-data";
import { endOfWeekSunday, formatDate, formatDateTime, getClockParts, startOfWeekMonday, weekRangeHalfOpen, addCalendarDays } from "@/lib/time";
import { formatTryFromKurus } from "@/lib/money";
import { sumPayable, weeklyByWorker } from "@/lib/payroll";

export const instant = false;

type SearchParams = Promise<{ view?: string; date?: string; week?: string }>;

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const [{ view, date: requestedDate, week: requestedWeek }, cookieStore, supabase] = await Promise.all([
    searchParams,
    cookies(),
    createSupabaseServerClient(),
  ]);
  const locale = resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value);
  const arabic = locale === "ar";
  const t = getMessages(locale);
  const today = getClockParts(new Date()).date;
  const date = requestedDate ?? today;
  const week = startOfWeekMonday(requestedWeek ?? date);
  const weekly = view === "weekly";
  const selectedDate = weekly ? week : date;

  if (!isIsoDate(selectedDate)) {
    return <div className="notice notice-error" role="alert">{t.selectDate}: invalid</div>;
  }

  const range = weekly ? weekRangeHalfOpen(week) : { start: date, endExclusive: addCalendarDays(date, 1) };
  let report;
  try {
    report = await loadAttendanceReport(supabase, range.start, range.endExclusive);
  } catch (error) {
    if (error instanceof ReportDataError) {
      console.error(error.message);
      return <div className="notice notice-error" role="alert">{t.reportLoadError}</div>;
    }
    throw error;
  }

  const confirmedInstances = report.instances.filter((instance) => instance.status === "submitted");
  const incompleteInstances = report.instances.filter((instance) => instance.status !== "submitted");
  const presentRecords = report.records.filter((record) => record.status === "present");
  const absentRecords = report.records.filter((record) => record.status === "absent");
  const totalEarnings = sumPayable(report.records);
  const byWorker = weeklyByWorker(report.records);
  const byDay = Array.from({ length: weekly ? 7 : 1 }, (_, index) => {
    const businessDate = weekly ? addCalendarDays(week, index) : date;
    const dayRecords = report.records.filter((record) => record.businessDate === businessDate);
    return {
      businessDate,
      present: dayRecords.filter((record) => record.status === "present").length,
      absent: dayRecords.filter((record) => record.status === "absent").length,
      earningsKurus: sumPayable(dayRecords),
    };
  });
  const exportUrl = weekly
    ? `/api/reports/export?type=weekly&week=${encodeURIComponent(week)}`
    : `/api/reports/export?type=daily&date=${encodeURIComponent(date)}`;
  const title = weekly ? t.weeklyReport : t.dailyReport;

  return (
    <section className="reports-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">{arabic ? "التحليلات" : "Analiz"}</p>
          <h1>{title}</h1>
          <p className="muted">
            {weekly
              ? `${t.weekRange}: ${formatDate(week, locale)} — ${formatDate(endOfWeekSunday(week), locale)}`
              : `${t.businessDate}: ${formatDate(date, locale)}`}
          </p>
        </div>
        <div className="report-export-actions">
          <a className="button button-secondary report-export" href={exportUrl}>{t.exportCsv}</a>
          {weekly && (
            <a
              className="button button-primary report-export"
              href={`/api/reports/payroll-pdf?week=${encodeURIComponent(week)}`}
            >
              {t.downloadPayrollPdf}
            </a>
          )}
        </div>
      </header>

      <nav aria-label={arabic ? "نوع التقرير" : "Rapor türü"} className="report-tabs">
        <Link aria-current={!weekly ? "page" : undefined} className={!weekly ? "active" : ""} href={`/reports?view=daily&date=${date}`}>{t.dailyReport}</Link>
        <Link aria-current={weekly ? "page" : undefined} className={weekly ? "active" : ""} href={`/reports?view=weekly&week=${week}`}>{t.weeklyReport}</Link>
      </nav>

      <form action="/reports" className="report-filter" method="get">
        <input name="view" type="hidden" value={weekly ? "weekly" : "daily"} />
        <label className="field-label" htmlFor={weekly ? "week" : "date"}>{weekly ? t.selectWeek : t.selectDate}</label>
        {weekly
          ? <input className="text-input" id="week" name="week" type="date" defaultValue={week} />
          : <input className="text-input" id="date" name="date" type="date" defaultValue={date} />}
        <button className="button button-primary" type="submit">{arabic ? "عرض" : "Göster"}</button>
      </form>

      <div className="report-metrics">
        <Metric label={t.workedShifts} value={String(confirmedInstances.length)} />
        <Metric label={t.weekPresent} value={String(presentRecords.length)} />
        <Metric label={t.weekAbsent} value={String(absentRecords.length)} />
        <Metric label={t.totalEarnings} value={formatTryFromKurus(totalEarnings, locale)} />
      </div>

      <p className="payroll-notice">{t.payrollNotice}</p>

      {incompleteInstances.length > 0 && (
        <section aria-labelledby="incomplete-heading" className="report-section">
          <h2 id="incomplete-heading">{t.incompleteShifts}</h2>
          <div className="report-table-wrap">
            <table className="report-table">
              <thead><tr><th>{t.businessDate}</th><th>{t.shiftLabel}</th><th>{t.statusLabel}</th><th>{t.decisionCount}</th></tr></thead>
              <tbody>
                {incompleteInstances.map((instance) => (
                  <tr key={instance.id}>
                    <td>{instance.businessDate}</td>
                    <td>{instance.shiftName}</td>
                    <td><span className={`report-status ${instance.status}`}>{instance.status === "closed" ? t.statusClosed : t.unfinished}</span></td>
                    <td>{instance.decisionCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {weekly && (
        <section aria-labelledby="days-heading" className="report-section">
          <h2 id="days-heading">{t.dayBreakdown}</h2>
          <div className="report-table-wrap">
            <table className="report-table">
              <thead><tr><th>{t.businessDate}</th><th>{t.present}</th><th>{t.absent}</th><th>{t.earnings}</th></tr></thead>
              <tbody>
                {byDay.map((day) => (
                  <tr key={day.businessDate}>
                    <td>{formatDate(day.businessDate, locale)}</td>
                    <td>{day.present}</td>
                    <td>{day.absent}</td>
                    <td>{formatTryFromKurus(day.earningsKurus, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section aria-labelledby="records-heading" className="report-section">
        <h2 id="records-heading">{weekly ? t.workerBreakdown : t.dailyReport}</h2>
        {report.records.length === 0 ? (
          <div className="empty-state"><strong>{t.noConfirmedRecords}</strong></div>
        ) : (
          <div className="report-table-wrap">
            <table className="report-table">
              {weekly ? (
                <>
                  <thead><tr><th>{t.worker}</th><th>ID</th><th>{t.workDates}</th><th>{t.absenceDates}</th><th>{t.weekPresent}</th><th>{t.weekAbsent}</th><th>{t.workedDays}</th><th>{t.earnings}</th><th>{arabic ? "آخر أجر" : "Son ücret"}</th></tr></thead>
                  <tbody>
                    {byWorker.map((worker) => (
                      <tr key={worker.workerId}>
                        <td>{worker.fullName}</td><td>{worker.workerCode}</td>
                        <td>{worker.workDates.map((businessDate) => formatDate(businessDate, locale)).join(", ")}</td>
                        <td>{worker.absentDates.map((businessDate) => formatDate(businessDate, locale)).join(", ")}</td>
                        <td>{worker.present}</td><td>{worker.absent}</td><td>{worker.present}</td>
                        <td>{formatTryFromKurus(worker.earningsKurus, locale)}</td>
                        <td>{formatTryFromKurus(worker.latestSnapshotKurus, locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </>
              ) : (
                <>
                  <thead><tr><th>{t.shiftLabel}</th><th>ID</th><th>{t.worker}</th><th>{t.statusLabel}</th><th>{arabic ? "الأجر اليومي" : "Günlük ücret"}</th><th>{t.earnings}</th><th>{t.submissionTime}</th></tr></thead>
                  <tbody>
                    {report.records.map((record) => (
                      <tr key={`${record.shiftInstanceId}:${record.workerId}`}>
                        <td>{record.shiftName}</td><td>{record.workerCode}</td><td>{record.fullName}</td>
                        <td><span className={`report-status ${record.status}`}>{record.status === "present" ? t.present : t.absent}</span></td>
                        <td>{formatTryFromKurus(record.dailySalaryKurusSnapshot, locale)}</td>
                        <td>{formatTryFromKurus(record.status === "present" ? record.dailySalaryKurusSnapshot : 0, locale)}</td>
                        <td>{formatDateTime(record.submittedAt, locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </>
              )}
            </table>
          </div>
        )}
      </section>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="summary-card"><span>{label}</span><strong>{value}</strong></div>;
}
