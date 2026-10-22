import { describe, expect, it } from "vitest";
import { escapeCsvField, toCsv, toReportCsv } from "@/lib/csv";

describe("csv", () => {
  it("escapes commas, quotes, and line breaks", () => {
    expect(escapeCsvField('Ali, "Veli"')).toBe('"Ali, ""Veli"""');
    expect(escapeCsvField("Çalışan; yönetici", ";")).toBe('"Çalışan; yönetici"');
    expect(escapeCsvField("satır\n2")).toBe('"satır\n2"');
  });

  it("guards spreadsheet formula injection and keeps Arabic names", () => {
    expect(escapeCsvField("=1+1")).toBe("'=1+1");
    expect(escapeCsvField("+cmd")).toBe("'+cmd");
    expect(escapeCsvField("محمد علي")).toBe("محمد علي");
  });

  it("includes a UTF-8 BOM", () => {
    const csv = toCsv(["worker_id"], [["HC000001"]]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("HC000001");
  });

  it("creates a titled report with metadata, padded rows, and totals", () => {
    const csv = toReportCsv({
      title: "HAPPY CENTER — Haftalık ödeme özeti",
      metadata: [["Sorumlu yönetici", "Çiğdem Yılmaz"], ["Genel toplam", "2700.00"]],
      headers: ["Çalışan adı", "Gün", "Tutar"],
      rows: [["Çağrı Şahin", "22.10.2026"]],
      totals: ["TOPLAM", 1, "2700.00"],
    });
    const rows = csv.replace(/^\uFEFF/, "").trimEnd().split("\r\n");
    expect(rows[0]).toBe("sep=;");
    expect(rows[1]).toBe("HAPPY CENTER — Haftalık ödeme özeti;;");
    expect(rows[2]).toContain("Sorumlu yönetici;Çiğdem Yılmaz");
    expect(rows[5]).toBe("Çalışan adı;Gün;Tutar");
    expect(rows[6]).toBe("Çağrı Şahin;22.10.2026;");
    expect(rows[8]).toBe("TOPLAM;1;2700.00");
  });
});
