import { z } from "zod";
import { MAX_DAILY_SALARY_KURUS } from "@/lib/constants";

export const localeSchema = z.enum(["tr", "ar"]);

export const fullNameSchema = z
  .string()
  .trim()
  .min(2, "name_too_short")
  .max(120, "name_too_long")
  .regex(/^[\p{L}\p{M} .'\-]+$/u, "name_invalid");

export const salaryKurusSchema = z
  .number()
  .int("salary_integer")
  .min(0, "salary_negative")
  .max(MAX_DAILY_SALARY_KURUS, "salary_too_high");

export const uuidSchema = z.string().uuid("invalid_id");

export const attendanceStatusSchema = z.enum(["present", "absent"]);

export const workerCreateSchema = z.object({
  fullName: fullNameSchema,
  shiftId: uuidSchema,
  dailySalaryKurus: salaryKurusSchema,
});

export const workerUpdateSchema = z.object({
  id: uuidSchema,
  fullName: fullNameSchema,
  shiftId: uuidSchema,
  dailySalaryKurus: salaryKurusSchema,
  salaryEffectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalid_date"),
});

export const employmentStatusSchema = z.enum(["active", "inactive"]);

export const loginSchema = z.object({
  email: z.string().trim().email("invalid_email"),
  password: z.string().min(8, "password_too_short"),
});

export const attendanceDecisionMapSchema = z.record(z.string().uuid(), attendanceStatusSchema);

export const shiftCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  attendanceWindowMinutes: z.number().int().min(1).max(720),
});
