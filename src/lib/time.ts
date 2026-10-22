import { addDays, parseISO } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { TIMEZONE, WEEK_STARTS_ON } from "@/lib/constants";

export type ClockParts = {
  date: string;
  time: string;
  hour: number;
  minute: number;
};

export function getClockParts(now: Date, timezone = TIMEZONE): ClockParts {
  const date = formatInTimeZone(now, timezone, "yyyy-MM-dd");
  const time = formatInTimeZone(now, timezone, "HH:mm");
  const [hour, minute] = time.split(":").map(Number);
  return { date, time, hour, minute };
}

export function formatDate(date: string, locale: "tr" | "ar"): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "tr-TR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: TIMEZONE,
  }).format(parseISO(`${date}T12:00:00`));
}

export function formatDateTime(iso: string, locale: "tr" | "ar"): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: TIMEZONE,
  }).format(new Date(iso));
}

export function formatClock(now: Date, locale: "tr" | "ar"): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "tr-TR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZone: TIMEZONE,
  }).format(now);
}

export function zonedDateTime(date: string, time: string, timezone = TIMEZONE): Date {
  const normalized = time.length === 5 ? `${time}:00` : time;
  return fromZonedTime(`${date}T${normalized}`, timezone);
}

export function addCalendarDays(date: string, amount: number): string {
  return formatInTimeZone(addDays(parseISO(`${date}T12:00:00Z`), amount), "UTC", "yyyy-MM-dd");
}

export function startOfWeekMonday(date: string): string {
  const asUtc = parseISO(`${date}T12:00:00Z`);
  const day = asUtc.getUTCDay();
  const delta = (day - WEEK_STARTS_ON + 7) % 7;
  return addCalendarDays(date, -delta);
}

export function endOfWeekSunday(date: string): string {
  return addCalendarDays(startOfWeekMonday(date), 6);
}

/** Half-open [start, endExclusive) date interval for SQL filters. */
export function weekRangeHalfOpen(weekStart: string): { start: string; endExclusive: string } {
  return { start: weekStart, endExclusive: addCalendarDays(weekStart, 7) };
}
