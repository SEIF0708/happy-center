import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMessages } from "@/lib/i18n";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { LOCALE_COOKIE } from "@/lib/constants";
import { resolveLocale } from "@/lib/i18n";
import { getClockParts, formatDate } from "@/lib/time";
import { buildShiftInstanceTimes, getShiftUiStatus, type ShiftUiStatus } from "@/lib/shift-window";

export const instant = false;

type ShiftRow = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  attendance_window_minutes: number;
};

export default async function DashboardPage() {
  await connection();
  const cookieStore = await cookies();
  const locale = resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value);
  const t = getMessages(locale);
  const now = new Date();
  const date = getClockParts(now).date;
  const supabase = await createSupabaseServerClient();
  const { data: shifts, error: shiftError } = await supabase
    .from("shifts")
    .select("id,name,start_time,end_time,attendance_window_minutes")
    .eq("is_active", true)
    .order("start_time");

  if (shiftError) {
    return <div className="notice notice-error" role="alert">{t.connectionError} {shiftError.message}</div>;
  }

  const shift = (shifts?.[0] as ShiftRow | undefined) ?? null;
  let summary = {
    present: 0,
    absent: 0,
    pending: 0,
    instanceStatus: "scheduled",
    statusLabel: t.statusUpcoming,
  };

  if (shift) {
    const { data: instance, error: instanceError } = await supabase.rpc("ensure_shift_instance", {
      p_shift_id: shift.id,
    });
    if (instanceError) {
      return <div className="notice notice-error" role="alert">{t.dashboardError} {instanceError.message}</div>;
    }
    if (instance?.id) {
      const [{ count: expected, error: workerError }, { data: records, error: recordError }] = await Promise.all([
        supabase.from("workers").select("id", { count: "exact", head: true })
          .eq("shift_id", shift.id).eq("employment_status", "active"),
        supabase.from("attendance_records").select("status")
          .eq("shift_instance_id", instance.id)
          .not("submitted_at", "is", null),
      ]);
      if (workerError || recordError) {
        return <div className="notice notice-error" role="alert">{t.connectionError}</div>;
      }
      const present = records?.filter((record) => record.status === "present").length ?? 0;
      const absent = records?.filter((record) => record.status === "absent").length ?? 0;
      const schedule = {
        id: shift.id,
        name: shift.name,
        start_time: shift.start_time,
        end_time: shift.end_time,
        attendance_window_minutes: shift.attendance_window_minutes,
        timezone: "Europe/Istanbul",
      };
      const times = buildShiftInstanceTimes(schedule, instance.business_date);
      const uiStatus = getShiftUiStatus({
        now,
        startsAt: times.startsAt,
        endsAt: times.endsAt,
        attendanceDeadlineAt: times.attendanceDeadlineAt,
        status: instance.status,
      });
      const statusLabels: Record<ShiftUiStatus, string> = {
        upcoming: t.statusUpcoming,
        open: t.statusOpen,
        deadline_passed: t.statusDeadlinePassed,
        submitted: t.statusSubmitted,
        closed: t.statusClosed,
      };
      summary = {
        present,
        absent,
        pending: Math.max(0, (expected ?? 0) - present - absent),
        instanceStatus: uiStatus,
        statusLabel: statusLabels[uiStatus],
      };
    } else {
      return <div className="notice notice-error" role="alert">{t.dashboardError}</div>;
    }
  }

  return (
    <section className="dashboard-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">{formatDate(date, locale)}</p>
          <h1>{t.dashboard}</h1>
          <p className="muted">{new Intl.DateTimeFormat(locale === "ar" ? "ar" : "tr-TR", {
            hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Europe/Istanbul",
          }).format(now)} · Europe/Istanbul</p>
        </div>
      </header>

      <section aria-labelledby="shift-heading" className="shift-card">
        <div className="shift-card-heading">
          <div>
            <p className="eyebrow">{t.currentShift}</p>
            <h2 id="shift-heading">{shift?.name ?? t.noShift}</h2>
          </div>
          {shift && <span className={`status-pill status-${summary.instanceStatus}`}>{summary.statusLabel}</span>}
        </div>
        {shift && <p className="shift-time">{shift.start_time.slice(0, 5)} — {shift.end_time.slice(0, 5)} · {shift.attendance_window_minutes} min</p>}
        <div className="summary-grid">
          <SummaryCard label={t.present} value={summary.present} tone="success" />
          <SummaryCard label={t.absent} value={summary.absent} tone="danger" />
          <SummaryCard label={t.pending} value={summary.pending} tone="neutral" />
        </div>
        {shift && (
          <Link className="button button-primary dashboard-action" href="/attendance">
            {t.nextAction}<span aria-hidden="true"> →</span>
          </Link>
        )}
      </section>
      <section className="quick-links" aria-label={locale === "ar" ? "روابط سريعة" : "Hızlı bağlantılar"}>
        <Link className="quick-link-card" href="/workers"><span className="quick-icon">♙</span><span><strong>{t.workers}</strong><small>{locale === "ar" ? "إدارة ملفات العاملين" : "Çalışan kayıtlarını yönetin"}</small></span><span aria-hidden="true">→</span></Link>
        <Link className="quick-link-card" href="/reports"><span className="quick-icon">▤</span><span><strong>{t.reports}</strong><small>{t.reportPrompt}</small></span><span aria-hidden="true">→</span></Link>
      </section>
    </section>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className={`summary-card ${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}
