"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fullNameSchema, shiftCreateSchema, uuidSchema } from "@/lib/validation/schemas";

export type SettingsActionResult =
  | { ok: true }
  | { ok: false; error: "invalid" | "unauthorized" | "database_update_required" | "shift_in_progress" | "failed" };

type SettingsActionError = Extract<SettingsActionResult, { ok: false }>["error"];

function databaseUpdateRequired(code?: string): boolean {
  return ["42883", "PGRST202", "42P01"].includes(code ?? "");
}

function rpcActionError(error: { code?: string; message: string }): SettingsActionError {
  if (databaseUpdateRequired(error.code)) return "database_update_required";
  if (error.code === "42501" || error.message.toLowerCase().includes("not authorized")) return "unauthorized";
  if (error.message.includes("shift_in_progress")) return "shift_in_progress";
  return "failed";
}

async function isAuthenticated(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return !error && Boolean(user);
}

export async function updateSupervisorName(name: unknown): Promise<SettingsActionResult> {
  const parsed = fullNameSchema.safeParse(name);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (!(await isAuthenticated())) return { ok: false, error: "unauthorized" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_supervisor_display_name", {
    p_display_name: parsed.data,
  });
  if (error) {
    console.error("Supervisor name update failed:", error.code, error.message);
    return { ok: false, error: rpcActionError(error) };
  }

  revalidatePath("/");
  revalidatePath("/settings");
  revalidatePath("/api/reports/export");
  revalidatePath("/api/reports/payroll-pdf");
  return { ok: true };
}

const shiftInputSchema = shiftCreateSchema
  .extend({ id: uuidSchema.nullable() })
  .refine((shift) => shift.startTime !== shift.endTime);

export async function saveShift(input: unknown): Promise<SettingsActionResult> {
  const parsed = shiftInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (!(await isAuthenticated())) return { ok: false, error: "unauthorized" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_shift", {
    p_shift_id: parsed.data.id,
    p_name: parsed.data.name,
    p_start_time: parsed.data.startTime,
    p_end_time: parsed.data.endTime,
    p_attendance_window_minutes: parsed.data.attendanceWindowMinutes,
  });
  if (error) {
    console.error("Shift save failed:", error.code, error.message);
    return { ok: false, error: rpcActionError(error) };
  }

  revalidatePath("/settings");
  revalidatePath("/workers");
  revalidatePath("/attendance");
  revalidatePath("/");
  return { ok: true };
}

export async function activateShift(shiftId: unknown): Promise<SettingsActionResult> {
  const parsed = uuidSchema.safeParse(shiftId);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (!(await isAuthenticated())) return { ok: false, error: "unauthorized" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_active_shift", { p_shift_id: parsed.data });
  if (error) {
    console.error("Shift activation failed:", error.code, error.message);
    return { ok: false, error: rpcActionError(error) };
  }

  revalidatePath("/settings");
  revalidatePath("/workers");
  revalidatePath("/attendance");
  revalidatePath("/");
  return { ok: true };
}

export async function assignWorkerShift(
  workerId: unknown,
  shiftId: unknown,
): Promise<SettingsActionResult> {
  const parsed = z.object({ workerId: uuidSchema, shiftId: uuidSchema }).safeParse({ workerId, shiftId });
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (!(await isAuthenticated())) return { ok: false, error: "unauthorized" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("assign_worker_shift", {
    p_worker_id: parsed.data.workerId,
    p_shift_id: parsed.data.shiftId,
  });
  if (error) {
    console.error("Worker shift assignment failed:", error.code, error.message);
    return { ok: false, error: rpcActionError(error) };
  }

  revalidatePath("/workers");
  revalidatePath("/attendance");
  revalidatePath("/");
  return { ok: true };
}
