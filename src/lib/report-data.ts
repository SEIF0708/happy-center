import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ShiftInstanceStatus, AttendanceStatus } from "@/types/domain";
import type { ConfirmedAttendance } from "@/lib/payroll";

export type ReportInstance = {
  id: string;
  businessDate: string;
  startsAt: string;
  endsAt: string;
  status: ShiftInstanceStatus;
  shiftName: string;
  decisionCount: number;
};

export type ReportRecord = ConfirmedAttendance & {
  shiftName: string;
  shiftStart: string;
  shiftEnd: string;
  submittedAt: string;
};

export type AttendanceReportData = {
  instances: ReportInstance[];
  records: ReportRecord[];
};

export class ReportDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReportDataError";
  }
}

export async function loadAttendanceReport(
  supabase: SupabaseClient,
  startDate: string,
  endDateExclusive: string,
): Promise<AttendanceReportData> {
  const { data: rawInstances, error: instancesError } = await supabase
    .from("shift_instances")
    .select("id,shift_id,business_date,starts_at,ends_at,status")
    .gte("business_date", startDate)
    .lt("business_date", endDateExclusive)
    .order("business_date")
    .order("starts_at");
  if (instancesError) {
    throw new ReportDataError(`Could not load shift instances: ${instancesError.message}`);
  }

  const instancesRows = rawInstances ?? [];
  if (!instancesRows.length) return { instances: [], records: [] };

  const { data: shifts, error: shiftsError } = await supabase
    .from("shifts")
    .select("id,name");
  if (shiftsError) {
    throw new ReportDataError(`Could not load shifts: ${shiftsError.message}`);
  }
  const shiftNames = new Map((shifts ?? []).map((shift) => [shift.id, shift.name]));
  const instanceIds = instancesRows.map((row) => row.id);
  const { data: attendance, error: attendanceError } = await supabase
    .from("attendance_records")
    .select("id,shift_instance_id,worker_id,status,daily_salary_kurus_snapshot,submitted_at")
    .in("shift_instance_id", instanceIds);
  if (attendanceError) {
    throw new ReportDataError(`Could not load confirmed attendance: ${attendanceError.message}`);
  }

  const confirmedAttendance = (attendance ?? []).filter((record) => record.submitted_at !== null);
  const workerIds = [...new Set(confirmedAttendance.map((record) => record.worker_id))];
  const { data: workers, error: workersError } = workerIds.length
    ? await supabase.from("workers").select("id,worker_code,full_name").in("id", workerIds)
    : { data: [], error: null };
  if (workersError) {
    throw new ReportDataError(`Could not load worker names: ${workersError.message}`);
  }

  const instanceById = new Map(instancesRows.map((row) => [row.id, row]));
  const workerById = new Map((workers ?? []).map((worker) => [worker.id, worker]));
  const records: ReportRecord[] = [];
  for (const record of confirmedAttendance) {
    const instance = instanceById.get(record.shift_instance_id);
    const worker = workerById.get(record.worker_id);
    if (!instance || !worker) {
      throw new ReportDataError("Confirmed attendance references missing report data.");
    }
    records.push({
      workerId: worker.id,
      workerCode: worker.worker_code,
      fullName: worker.full_name,
      status: record.status as AttendanceStatus,
      dailySalaryKurusSnapshot: record.daily_salary_kurus_snapshot,
      businessDate: instance.business_date,
      shiftInstanceId: instance.id,
      shiftName: shiftNames.get(instance.shift_id) ?? "",
      shiftStart: instance.starts_at,
      shiftEnd: instance.ends_at,
      submittedAt: record.submitted_at,
    });
  }
  records.sort((a, b) =>
    a.businessDate.localeCompare(b.businessDate) ||
    a.fullName.localeCompare(b.fullName, "tr"),
  );

  const reportInstances: ReportInstance[] = instancesRows.map((instance) => {
    const decisions = (attendance ?? []).filter((record) => record.shift_instance_id === instance.id);
    return {
      id: instance.id,
      businessDate: instance.business_date,
      startsAt: instance.starts_at,
      endsAt: instance.ends_at,
      status: instance.status as ShiftInstanceStatus,
      shiftName: shiftNames.get(instance.shift_id) ?? "",
      decisionCount: decisions.length,
    };
  });

  return { instances: reportInstances, records };
}
