import { describe, expect, it } from "vitest";
import { endOfWeekSunday, startOfWeekMonday, weekRangeHalfOpen } from "@/lib/time";

describe("week boundaries", () => {
  it("uses Monday through Sunday in Istanbul business dates", () => {
    expect(startOfWeekMonday("2026-10-21")).toBe("2026-10-19");
    expect(endOfWeekSunday("2026-10-21")).toBe("2026-10-25");
    expect(weekRangeHalfOpen("2026-10-19")).toEqual({
      start: "2026-10-19",
      endExclusive: "2026-10-26",
    });
  });
});
