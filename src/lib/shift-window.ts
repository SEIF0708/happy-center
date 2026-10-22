import { TIMEZONE } from "@/lib/constants";
import {
  addCalendarDays,
  getClockParts,
  zonedDateTime,
} from "@/lib/time";

export type ShiftSchedule = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  attendance_window_minutes: number;
  timezone: string;
};

export type ShiftInstanceTimes = {
  businessDate: string;
  startsAt: Date;
  endsAt: Date;
  attendanceDeadlineAt: Date;
};

export type ShiftUiStatus =
  | "upcoming"
  | "open"
  | "deadline_passed"
  | "submitted"
  | "closed";

export function isOvernightShift(startTime: string, endTime: string): boolean {
  return normalizeTime(startTime) > normalizeTime(endTime);
}

export function normalizeTime(value: string): string {
  return value.slice(0, 5);
}

export function validateShiftDefinition(input: {
  start_time: string;
  end_time: string;
  attendance_window_minutes: number;
  timezone?: string;
}): string | null {
  const start = normalizeTime(input.start_time);
  const end = normalizeTime(input.end_time);
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) {
    return "invalid_time";
  }
  if (start === end) {
    return "shift_zero_length";
  }
  if (input.attendance_window_minutes <= 0 || input.attendance_window_minutes > 12 * 60) {
    return "invalid_window";
  }
  if (input.timezone && input.timezone !== TIMEZONE) {
    return "unsupported_timezone";
  }
  return null;
}

export function resolveBusinessDate(now: Date, shift: ShiftSchedule): string {
  const timezone = shift.timezone || TIMEZONE;
  const { date, time } = getClockParts(now, timezone);
  const start = normalizeTime(shift.start_time);
  const end = normalizeTime(shift.end_time);
  if (isOvernightShift(start, end) && time < end) {
    return addCalendarDays(date, -1);
  }
  return date;
}

export function buildShiftInstanceTimes(
  shift: ShiftSchedule,
  businessDate: string,
): ShiftInstanceTimes {
  const timezone = shift.timezone || TIMEZONE;
  const start = normalizeTime(shift.start_time);
  const end = normalizeTime(shift.end_time);
  const startsAt = zonedDateTime(businessDate, start, timezone);
  const endDate = isOvernightShift(start, end)
    ? addCalendarDays(businessDate, 1)
    : businessDate;
  const endsAt = zonedDateTime(endDate, end, timezone);
  const attendanceDeadlineAt = new Date(
    startsAt.getTime() + shift.attendance_window_minutes * 60_000,
  );
  return { businessDate, startsAt, endsAt, attendanceDeadlineAt };
}

export function getShiftUiStatus(input: {
  now: Date;
  startsAt: Date;
  endsAt: Date;
  attendanceDeadlineAt: Date;
  status: "scheduled" | "open" | "submitted" | "closed";
}): ShiftUiStatus {
  if (input.status === "submitted") return "submitted";
  if (input.status === "closed" || input.now >= input.endsAt) return "closed";
  if (input.now < input.startsAt) return "upcoming";
  if (input.now < input.attendanceDeadlineAt) return "open";
  return "deadline_passed";
}

export function canMarkPresent(now: Date, startsAt: Date, deadlineAt: Date, submitted: boolean): boolean {
  return !submitted && now >= startsAt && now < deadlineAt;
}

export function canMarkAbsent(now: Date, startsAt: Date, submitted: boolean): boolean {
  return !submitted && now >= startsAt;
}

export function isAttendanceWindowOpen(now: Date, startsAt: Date, deadlineAt: Date): boolean {
  return now >= startsAt && now < deadlineAt;
}
