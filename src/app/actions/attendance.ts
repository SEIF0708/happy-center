"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { attendanceDecisionMapSchema, uuidSchema } from "@/lib/validation/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AttendanceActionResult =
  | { ok: true }
  | {
      ok: false;
      error: "invalid" | "present_window_closed" | "shift_closed" | "shift_not_open" | "incomplete" | "failed";
    };

export async function saveAttendanceDecision(input: unknown): Promise<AttendanceActionResult> {
  const parsed = z.object({
    instanceId: uuidSchema,
    workerId: uuidSchema,
    status: z.enum(["present", "absent", "pending"]),
  }).safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "invalid" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_attendance_decision", {
    p_instance_id: parsed.data.instanceId,
    p_worker_id: parsed.data.workerId,
    p_status: parsed.data.status,
  });
  if (error) {
    console.error("Attendance decision save failed:", error.code, error.message);
    if (error.message.includes("present_window_closed")) return { ok: false, error: "present_window_closed" };
    if (error.message.includes("shift_closed")) return { ok: false, error: "shift_closed" };
    if (error.message.includes("shift_not_open")) return { ok: false, error: "shift_not_open" };
    return { ok: false, error: "failed" };
  }

  revalidatePath("/attendance");
  revalidatePath("/");
  return { ok: true };
}

export async function submitAttendance(input: unknown): Promise<AttendanceActionResult> {
  const parsed = z.object({
    instanceId: uuidSchema,
    decisions: attendanceDecisionMapSchema,
  }).safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "invalid" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("submit_shift_attendance_checked", {
    p_instance_id: parsed.data.instanceId,
    p_decisions: parsed.data.decisions,
  });
  if (error) {
    console.error("Attendance submission failed:", error.code, error.message);
    if (error.message.includes("incomplete_attendance")) return { ok: false, error: "incomplete" };
    if (error.message.includes("present_window_closed")) return { ok: false, error: "present_window_closed" };
    if (error.message.includes("shift_closed")) return { ok: false, error: "shift_closed" };
    if (error.message.includes("shift_not_open")) return { ok: false, error: "shift_not_open" };
    return { ok: false, error: "failed" };
  }

  revalidatePath("/attendance");
  revalidatePath("/");
  revalidatePath("/reports");
  return { ok: true };
}
