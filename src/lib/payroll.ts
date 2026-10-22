import { addKurus, earningsForStatus } from "@/lib/money";

export type ConfirmedAttendance = {
  workerId: string;
  workerCode: string;
  fullName: string;
  status: "present" | "absent";
  dailySalaryKurusSnapshot: number;
  businessDate: string;
  shiftInstanceId: string;
};

export function payableKurus(record: Pick<ConfirmedAttendance, "status" | "dailySalaryKurusSnapshot">): number {
  return earningsForStatus(record.status, record.dailySalaryKurusSnapshot);
}

export function sumPayable(records: ConfirmedAttendance[]): number {
  return addKurus(...records.map(payableKurus));
}

export function weeklyByWorker(records: ConfirmedAttendance[]) {
  const map = new Map<
    string,
    {
      workerId: string;
      workerCode: string;
      fullName: string;
      present: number;
      absent: number;
      workDates: string[];
      absentDates: string[];
      earningsKurus: number;
      latestSnapshotKurus: number;
    }
  >();
  for (const record of records) {
    const current = map.get(record.workerId) ?? {
      workerId: record.workerId,
      workerCode: record.workerCode,
      fullName: record.fullName,
      present: 0,
      absent: 0,
      workDates: [],
      absentDates: [],
      earningsKurus: 0,
      latestSnapshotKurus: record.dailySalaryKurusSnapshot,
    };
    if (record.status === "present") {
      current.present += 1;
      current.workDates.push(record.businessDate);
    }
    if (record.status === "absent") {
      current.absent += 1;
      current.absentDates.push(record.businessDate);
    }
    current.earningsKurus = addKurus(current.earningsKurus, payableKurus(record));
    current.latestSnapshotKurus = record.dailySalaryKurusSnapshot;
    map.set(record.workerId, current);
  }
  return [...map.values()].sort((a, b) => a.fullName.localeCompare(b.fullName, "tr"));
}

export function countUniqueShifts(records: ConfirmedAttendance[]): number {
  return new Set(records.map((record) => record.shiftInstanceId)).size;
}

export function salaryForBusinessDate(
  history: Array<{ effective_from: string; daily_salary_kurus: number }>,
  businessDate: string,
  fallbackKurus: number,
): number {
  const applicable = history
    .filter((row) => row.effective_from <= businessDate)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from));
  return applicable[0]?.daily_salary_kurus ?? fallbackKurus;
}
