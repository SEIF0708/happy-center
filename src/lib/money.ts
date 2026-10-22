import { DEFAULT_DAILY_SALARY_KURUS } from "@/lib/constants";

export function liraToKurus(lira: number): number {
  if (!Number.isFinite(lira)) {
    throw new Error("Invalid lira amount");
  }
  return Math.round(lira * 100);
}

export function kurusToLiraNumber(kurus: number): number {
  if (!Number.isInteger(kurus)) {
    throw new Error("Monetary amounts must be integer kuruş");
  }
  return kurus / 100;
}

export function formatKurusDecimal(kurus: number): string {
  if (!Number.isInteger(kurus)) {
    throw new Error("Monetary amounts must be integer kuruş");
  }
  const sign = kurus < 0 ? "-" : "";
  const absolute = Math.abs(kurus);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

export function addKurus(...amounts: number[]): number {
  return amounts.reduce((sum, value) => {
    if (!Number.isInteger(value)) {
      throw new Error("Monetary amounts must be integer kuruş");
    }
    return sum + value;
  }, 0);
}

export function earningsForStatus(
  status: "present" | "absent" | "pending",
  snapshotKurus: number,
): number {
  if (!Number.isInteger(snapshotKurus) || snapshotKurus < 0) {
    throw new Error("Invalid salary snapshot");
  }
  if (status === "present") return snapshotKurus;
  return 0;
}

export function formatTryFromKurus(
  kurus: number,
  locale: "tr" | "ar",
): string {
  if (!Number.isInteger(kurus)) {
    throw new Error("Monetary amounts must be integer kuruş");
  }
  const sign = kurus < 0 ? "-" : "";
  const absolute = Math.abs(kurus);
  const lira = Math.floor(absolute / 100);
  const remainder = absolute % 100;
  const grouped = new Intl.NumberFormat(locale === "ar" ? "ar" : "tr-TR", {
    useGrouping: true,
    maximumFractionDigits: 0,
  }).format(lira);
  const kurusPart = remainder.toString().padStart(2, "0");
  return `${sign}₺${grouped},${kurusPart}`;
}

export function parseLiraInput(raw: string): number {
  const normalized = raw.trim().replace(/\s/g, "").replace("₺", "").replace(",", ".");
  if (!normalized) {
    return DEFAULT_DAILY_SALARY_KURUS;
  }
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new Error("Invalid salary");
  }
  const [whole, fraction = ""] = normalized.split(".");
  const kurus = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isInteger(kurus) || kurus < 0) {
    throw new Error("Invalid salary");
  }
  return kurus;
}
