import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createWeeklyPayrollPdf } from "@/lib/payroll-pdf";
import type { ConfirmedAttendance } from "@/lib/payroll";

function record(overrides: Partial<ConfirmedAttendance> = {}): ConfirmedAttendance {
  return {
    workerId: "worker-1",
    workerCode: "HC000001",
    fullName: "Çağrı Şahin",
    status: "present",
    dailySalaryKurusSnapshot: 135000,
    businessDate: "2026-10-19",
    shiftInstanceId: "shift-1",
    ...overrides,
  };
}

describe("weekly payroll PDF", { timeout: 15_000 }, () => {
  it("generates a downloadable Turkish PDF with the payroll data", async () => {
    const pdf = await createWeeklyPayrollPdf({
      records: [
        record({
          fullName: "I\u0307pek Çağrı Şahin",
          dailySalaryKurusSnapshot: 123456789,
        }),
        record({ status: "absent", businessDate: "2026-10-20", shiftInstanceId: "shift-2" }),
      ],
      weekStart: "2026-10-19",
      weekEnd: "2026-10-25",
      supervisorName: "Çiğdem Yılmaz",
      locale: "tr",
    });

    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(10_000);
  });

  it("embeds Arabic text fonts and renders an empty payroll period", async () => {
    const pdf = await createWeeklyPayrollPdf({
      records: [],
      weekStart: "2026-10-19",
      weekEnd: "2026-10-25",
      supervisorName: "المشرف",
      locale: "ar",
    });

    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(10_000);
  });

  it("renders Arabic payroll rows with right-to-left text and mixed numbers", async () => {
    const pdf = await createWeeklyPayrollPdf({
      records: [
        record({
          fullName: "أحمد محمد",
          dailySalaryKurusSnapshot: 123456789,
        }),
      ],
      weekStart: "2026-10-19",
      weekEnd: "2026-10-25",
      supervisorName: "المشرف 123",
      locale: "ar",
    });

    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(10_000);
  });
});
