import { describe, expect, it } from "vitest";
import { salaryForBusinessDate, sumPayable, weeklyByWorker } from "@/lib/payroll";
import type { ConfirmedAttendance } from "@/lib/payroll";

function record(
  overrides: Partial<ConfirmedAttendance> & Pick<ConfirmedAttendance, "status" | "businessDate" | "shiftInstanceId">,
): ConfirmedAttendance {
  return {
    workerId: "w1",
    workerCode: "HC000001",
    fullName: "Test Worker",
    dailySalaryKurusSnapshot: 135000,
    ...overrides,
  };
}

describe("payroll", () => {
  it("accrues ₺4,050 for three present shifts", () => {
    const records = [
      record({ status: "present", businessDate: "2026-10-19", shiftInstanceId: "s1" }),
      record({ status: "present", businessDate: "2026-10-20", shiftInstanceId: "s2" }),
      record({ status: "present", businessDate: "2026-10-21", shiftInstanceId: "s3" }),
    ];
    expect(sumPayable(records)).toBe(405000);
  });

  it("does not pay absent shifts", () => {
    const records = [
      record({ status: "present", businessDate: "2026-10-19", shiftInstanceId: "s1" }),
      record({ status: "present", businessDate: "2026-10-20", shiftInstanceId: "s2" }),
      record({ status: "present", businessDate: "2026-10-21", shiftInstanceId: "s3" }),
      record({ status: "absent", businessDate: "2026-10-22", shiftInstanceId: "s4" }),
    ];
    expect(sumPayable(records)).toBe(405000);
  });

  it("uses salary snapshots rather than the current salary", () => {
    const records = [
      record({
        status: "present",
        businessDate: "2026-10-19",
        shiftInstanceId: "s1",
        dailySalaryKurusSnapshot: 135000,
      }),
      record({
        status: "present",
        businessDate: "2026-10-22",
        shiftInstanceId: "s2",
        dailySalaryKurusSnapshot: 150000,
      }),
    ];
    expect(sumPayable(records)).toBe(285000);
  });

  it("selects the salary effective on the business date", () => {
    const history = [
      { effective_from: "2026-10-01", daily_salary_kurus: 135000 },
      { effective_from: "2026-10-22", daily_salary_kurus: 150000 },
    ];
    expect(salaryForBusinessDate(history, "2026-10-21", 0)).toBe(135000);
    expect(salaryForBusinessDate(history, "2026-10-22", 0)).toBe(150000);
  });

  it("groups weekly worker totals without double counting", () => {
    const rows = weeklyByWorker([
      record({ status: "present", businessDate: "2026-10-19", shiftInstanceId: "s1" }),
      record({ status: "absent", businessDate: "2026-10-20", shiftInstanceId: "s2" }),
    ]);
    expect(rows[0]).toMatchObject({
      present: 1,
      absent: 1,
      workDates: ["2026-10-19"],
      absentDates: ["2026-10-20"],
      earningsKurus: 135000,
    });
  });
});
