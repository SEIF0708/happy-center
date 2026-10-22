import { describe, expect, it } from "vitest";
import { addKurus, earningsForStatus, formatKurusDecimal, formatTryFromKurus, parseLiraInput } from "@/lib/money";

describe("money", () => {
  it("adds integer kuruş without floating point", () => {
    expect(addKurus(135000, 135000, 135000)).toBe(405000);
  });

  it("pays snapshot for present and zero for absent or pending", () => {
    expect(earningsForStatus("present", 135000)).toBe(135000);
    expect(earningsForStatus("absent", 135000)).toBe(0);
    expect(earningsForStatus("pending", 135000)).toBe(0);
  });

  it("formats Turkish lira from kuruş", () => {
    expect(formatTryFromKurus(135000, "tr")).toBe("₺1.350,00");
    expect(formatTryFromKurus(405000, "tr")).toBe("₺4.050,00");
  });

  it("formats CSV lira amounts as stable decimal values", () => {
    expect(formatKurusDecimal(0)).toBe("0.00");
    expect(formatKurusDecimal(135000)).toBe("1350.00");
    expect(formatKurusDecimal(135125)).toBe("1351.25");
    expect(() => formatKurusDecimal(12.5)).toThrow("integer kuruş");
  });

  it("parses lira input into kuruş", () => {
    expect(parseLiraInput("1350")).toBe(135000);
    expect(parseLiraInput("1350,50")).toBe(135050);
  });
});
