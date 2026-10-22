import { describe, expect, it } from "vitest";
import { fromZonedTime } from "date-fns-tz";
import {
  buildShiftInstanceTimes,
  canMarkPresent,
  getShiftUiStatus,
  resolveBusinessDate,
} from "@/lib/shift-window";

const nightShift = {
  id: "shift-1",
  name: "Night Shift",
  start_time: "22:00",
  end_time: "06:00",
  attendance_window_minutes: 60,
  timezone: "Europe/Istanbul",
};

function istanbul(isoLocal: string) {
  return fromZonedTime(isoLocal, "Europe/Istanbul");
}

describe("night shift window", () => {
  it("uses tonight as the business date after 22:00", () => {
    expect(resolveBusinessDate(istanbul("2026-10-20T22:00:00"), nightShift)).toBe("2026-10-20");
  });

  it("keeps the previous evening's business date after midnight", () => {
    expect(resolveBusinessDate(istanbul("2026-10-21T01:30:00"), nightShift)).toBe("2026-10-20");
  });

  it("treats Monday 22:00 as Monday even though it ends Tuesday", () => {
    const times = buildShiftInstanceTimes(nightShift, "2026-10-19");
    expect(times.businessDate).toBe("2026-10-19");
    expect(times.endsAt.toISOString()).toBe(istanbul("2026-10-20T06:00:00").toISOString());
  });

  it("opens present marking at 22:00 and blocks it at 23:00", () => {
    const times = buildShiftInstanceTimes(nightShift, "2026-10-20");
    expect(canMarkPresent(istanbul("2026-10-20T21:59:59"), times.startsAt, times.attendanceDeadlineAt, false)).toBe(false);
    expect(canMarkPresent(istanbul("2026-10-20T22:00:00"), times.startsAt, times.attendanceDeadlineAt, false)).toBe(true);
    expect(canMarkPresent(istanbul("2026-10-20T22:59:59"), times.startsAt, times.attendanceDeadlineAt, false)).toBe(true);
    expect(canMarkPresent(istanbul("2026-10-20T23:00:00"), times.startsAt, times.attendanceDeadlineAt, false)).toBe(false);
  });

  it("maps UI statuses across the overnight boundary", () => {
    const times = buildShiftInstanceTimes(nightShift, "2026-10-20");
    expect(
      getShiftUiStatus({
        now: istanbul("2026-10-20T21:00:00"),
        ...times,
        status: "scheduled",
      }),
    ).toBe("upcoming");
    expect(
      getShiftUiStatus({
        now: istanbul("2026-10-20T22:15:00"),
        ...times,
        status: "open",
      }),
    ).toBe("open");
    expect(
      getShiftUiStatus({
        now: istanbul("2026-10-20T23:05:00"),
        ...times,
        status: "open",
      }),
    ).toBe("deadline_passed");
    expect(
      getShiftUiStatus({
        now: istanbul("2026-10-21T06:00:00"),
        ...times,
        status: "open",
      }),
    ).toBe("closed");
  });
});
