import Link from "next/link";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { LOCALE_COOKIE } from "@/lib/constants";
import { getMessages, resolveLocale } from "@/lib/i18n";
import { AttendanceWorkspace, type AttendanceWorker } from "@/app/attendance-workspace";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getClockParts } from "@/lib/time";

export const instant = false;

type SearchParams = Promise<{ demo?: string | string[] }>;

type ShiftRow = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  attendance_window_minutes: number;
};

type InstanceRow = {
  id: string;
  business_date: string;
  starts_at: string;
  ends_at: string;
  attendance_deadline_at: string;
  status: "scheduled" | "open" | "submitted" | "closed";
};

export default async function AttendancePage({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const [{ demo }, cookieStore] = await Promise.all([searchParams, cookies()]);
  const locale = resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value);
  const t = getMessages(locale);
  const arabic = locale === "ar";

  if (process.env.NODE_ENV !== "production" && demo === "1") {
    const now = new Date();
    const workers: AttendanceWorker[] = arabic
      ? [
          { id: "demo-worker-1", workerCode: "DEMO-001", fullName: "سمير أحمد", decision: "pending" },
          { id: "demo-worker-2", workerCode: "DEMO-002", fullName: "ليلى حسن", decision: "pending" },
          { id: "demo-worker-3", workerCode: "DEMO-003", fullName: "مروان يسري", decision: "pending" },
          { id: "demo-worker-4", workerCode: "DEMO-004", fullName: "سليمان", decision: "pending" },
        ]
      : [
          { id: "demo-worker-1", workerCode: "DEMO-001", fullName: "Çiğdem Yılmaz", decision: "pending" },
          { id: "demo-worker-2", workerCode: "DEMO-002", fullName: "Çağrı Şahin", decision: "pending" },
          { id: "demo-worker-3", workerCode: "DEMO-003", fullName: "Özge Işık", decision: "pending" },
          { id: "demo-worker-4", workerCode: "DEMO-004", fullName: "Deniz Aksoy", decision: "pending" },
        ];

    return (
      <AttendanceWorkspace
        businessDate={getClockParts(now).date}
        deadlineAt={new Date(now.getTime() + 60 * 60_000).toISOString()}
        demoMode
        endsAt={new Date(now.getTime() + 8 * 60 * 60_000).toISOString()}
        initialStatus="open"
        initialWorkers={workers}
        instanceId="demo-attendance-session"
        locale={locale}
        shiftName={arabic ? "وردية تجريبية" : "Deneme vardiyası"}
        startsAt={new Date(now.getTime() - 60_000).toISOString()}
      />
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: shifts, error: shiftsError } = await supabase.from("shifts")
    .select("id,name,start_time,end_time,attendance_window_minutes")
    .eq("is_active", true)
    .order("start_time")
    .limit(1);

  if (shiftsError) {
    return <div className="notice notice-error" role="alert">{t.connectionError}</div>;
  }
  const shift = (shifts?.[0] as ShiftRow | undefined) ?? null;
  if (!shift) {
    return <div className="notice notice-error" role="status">{t.noShift}</div>;
  }

  const { data: instanceData, error: instanceError } = await supabase.rpc("ensure_shift_instance", {
    p_shift_id: shift.id,
  });
  if (instanceError || !instanceData) {
    return <div className="notice notice-error" role="alert">{t.dashboardError} {instanceError?.message}</div>;
  }
  const instance = instanceData as InstanceRow;

  const [{ data: workers, error: workersError }, { data: records, error: recordsError }] = await Promise.all([
    supabase.from("workers")
      .select("id,worker_code,full_name")
      .eq("shift_id", shift.id)
      .eq("employment_status", "active")
      .order("full_name"),
    supabase.from("attendance_records")
      .select("worker_id,status")
      .eq("shift_instance_id", instance.id),
  ]);
  if (workersError || recordsError) {
    return <div className="notice notice-error" role="alert">{t.connectionError}</div>;
  }

  const decisionByWorker = new Map((records ?? []).map((record) => [record.worker_id, record.status]));
  const attendanceWorkers: AttendanceWorker[] = (workers ?? []).map((worker) => ({
    id: worker.id,
    workerCode: worker.worker_code,
    fullName: worker.full_name,
    decision: decisionByWorker.get(worker.id) ?? "pending",
  }));

  return (
    <>
      {process.env.NODE_ENV !== "production" && (
        <div className="attendance-demo-link">
          <Link className="button button-secondary" href="/attendance?demo=1">{t.demoAttendance}</Link>
        </div>
      )}
      <AttendanceWorkspace
        businessDate={instance.business_date}
        deadlineAt={instance.attendance_deadline_at}
        initialStatus={instance.status}
        initialWorkers={attendanceWorkers}
        instanceId={instance.id}
        locale={locale}
        endsAt={instance.ends_at}
        shiftName={shift.name}
        startsAt={instance.starts_at}
      />
    </>
  );
}
