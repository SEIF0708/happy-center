import { describe, expect, it } from "vitest";
import { shiftCreateSchema } from "@/lib/validation/schemas";

describe("shiftCreateSchema", () => {
  it("accepts valid same-day and overnight shifts", () => {
    const shift = {
      name: "Akşam vardiyası",
      startTime: "22:00",
      endTime: "06:00",
      attendanceWindowMinutes: 60,
    };

    expect(shiftCreateSchema.safeParse(shift).success).toBe(true);
    expect(shiftCreateSchema.safeParse({ ...shift, startTime: "09:00", endTime: "17:00" }).success).toBe(true);
  });

  it("rejects times outside the 24-hour clock", () => {
    const shift = {
      name: "Sabah vardiyası",
      startTime: "25:00",
      endTime: "17:00",
      attendanceWindowMinutes: 60,
    };

    expect(shiftCreateSchema.safeParse(shift).success).toBe(false);
    expect(shiftCreateSchema.safeParse({ ...shift, startTime: "09:00", endTime: "17:60" }).success).toBe(false);
  });
});
