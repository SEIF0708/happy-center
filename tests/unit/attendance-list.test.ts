import { describe, expect, it } from "vitest";
import { filterAttendance, matchesWorkerSearch, sortPendingFirst } from "@/lib/attendance-list";

const rows = [
  { workerId: "1", fullName: "Ahmet Yılmaz", workerCode: "HC000002", decision: "present" as const },
  { workerId: "2", fullName: "محمد علي", workerCode: "HC000001", decision: "pending" as const },
  { workerId: "3", fullName: "José María", workerCode: "HC000003", decision: "absent" as const },
  { workerId: "4", fullName: "Ahmet Yılmaz", workerCode: "HC000004", decision: "pending" as const },
];

describe("attendance list", () => {
  it("keeps pending workers first", () => {
    expect(sortPendingFirst(rows).map((row) => row.workerId)).toEqual(["4", "2", "1", "3"]);
  });

  it("matches names and IDs with extra spaces and case differences", () => {
    expect(matchesWorkerSearch(rows[0], "  ahmet  yilmaz ")).toBe(true);
    expect(matchesWorkerSearch(rows[1], "hc000001")).toBe(true);
  });

  it("does not let filters hide remaining pending work", () => {
    const result = filterAttendance(rows, { status: "present" });
    expect(result.visible.every((row) => row.decision === "present")).toBe(true);
    expect(result.hiddenPending).toBe(2);
    expect(result.pendingTotal).toBe(2);
  });

  it("distinguishes duplicate names by worker ID", () => {
    const result = filterAttendance(rows, { query: "HC000004" });
    expect(result.visible).toHaveLength(1);
    expect(result.visible[0].workerId).toBe("4");
  });
});
