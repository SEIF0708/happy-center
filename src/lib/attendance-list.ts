export type AttendanceDecision = "present" | "absent" | "pending";

export type AttendanceRow<T> = T & {
  workerId: string;
  fullName: string;
  workerCode: string;
  decision: AttendanceDecision;
};

export function normalizeSearch(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll("ı", "i");
}

export function matchesWorkerSearch(
  row: { fullName: string; workerCode: string },
  query: string,
): boolean {
  const needle = normalizeSearch(query);
  if (!needle) return true;
  return (
    normalizeSearch(row.fullName).includes(needle) ||
    normalizeSearch(row.workerCode).includes(needle)
  );
}

export function sortPendingFirst<T>(rows: AttendanceRow<T>[]): AttendanceRow<T>[] {
  return [...rows].sort((a, b) => {
    const pendingDelta = Number(a.decision !== "pending") - Number(b.decision !== "pending");
    if (pendingDelta !== 0) return pendingDelta;
    return a.fullName.localeCompare(b.fullName, "tr", { sensitivity: "base" });
  });
}

export function filterAttendance<T>(
  rows: AttendanceRow<T>[],
  options: { query?: string; status?: AttendanceDecision | "all" },
): { visible: AttendanceRow<T>[]; hiddenPending: number; pendingTotal: number } {
  const pendingTotal = rows.filter((row) => row.decision === "pending").length;
  const searched = rows.filter((row) => matchesWorkerSearch(row, options.query ?? ""));
  const filtered =
    !options.status || options.status === "all"
      ? searched
      : searched.filter((row) => row.decision === options.status);
  const visible = sortPendingFirst(filtered);
  const hiddenPending = rows.filter(
    (row) => row.decision === "pending" && !visible.some((item) => item.workerId === row.workerId),
  ).length;
  return { visible, hiddenPending, pendingTotal };
}

export function summarizeDecisions(rows: Array<{ decision: AttendanceDecision }>) {
  return rows.reduce(
    (acc, row) => {
      acc[row.decision] += 1;
      acc.total += 1;
      return acc;
    },
    { present: 0, absent: 0, pending: 0, total: 0 },
  );
}
