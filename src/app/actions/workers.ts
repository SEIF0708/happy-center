"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuidSchema } from "@/lib/validation/schemas";
import { parseLiraInput } from "@/lib/money";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { workerCreateSchema } from "@/lib/validation/schemas";

export type CreateWorkerState = {
  error?: "invalid" | "unauthorized" | "save_failed" | "database_update_required";
};

export async function createWorker(
  _previousState: CreateWorkerState,
  formData: FormData,
): Promise<CreateWorkerState> {
  const salaryInput = formData.get("dailySalary");
  if (typeof salaryInput !== "string") {
    return { error: "invalid" };
  }

  let dailySalaryKurus: number;
  try {
    dailySalaryKurus = parseLiraInput(salaryInput);
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid salary") {
      return { error: "invalid" };
    }
    throw error;
  }

  const parsed = workerCreateSchema.safeParse({
    fullName: formData.get("fullName"),
    shiftId: formData.get("shiftId"),
    dailySalaryKurus,
  });
  if (!parsed.success) {
    return { error: "invalid" };
  }

  const requestId = uuidSchema.safeParse(formData.get("requestId"));
  if (!requestId.success) {
    return { error: "invalid" };
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: "unauthorized" };
  }

  const { data: result, error } = await supabase.rpc("create_worker", {
    p_full_name: parsed.data.fullName,
    p_shift_id: parsed.data.shiftId,
    p_daily_salary_kurus: parsed.data.dailySalaryKurus,
    p_request_id: requestId.data,
  });
  if (error || !result?.worker_code) {
    if (error) {
      console.error("Worker creation failed:", error.code, error.message);
      if (["42702", "42883", "PGRST202"].includes(error.code ?? "")) {
        return { error: "database_update_required" };
      }
    }
    return { error: "save_failed" };
  }

  redirect(`/workers?created=${encodeURIComponent(result.worker_code)}`);
}

export type DeactivateWorkerResult =
  | { ok: true }
  | {
      ok: false;
      error: "invalid" | "unauthorized" | "not_found" | "database_update_required" | "permission_denied" | "failed";
    };

export async function deactivateWorker(input: unknown): Promise<DeactivateWorkerResult> {
  const parsed = z.object({ workerId: uuidSchema }).safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "invalid" };
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: "unauthorized" };
  }

  const { data, error } = await supabase.rpc("deactivate_worker", {
    p_worker_id: parsed.data.workerId,
  });
  if (error) {
    console.error("Worker deactivation failed:", error.code, error.message);
    const message = error.message.toLowerCase();
    if (message.includes("worker_not_found")) return { ok: false, error: "not_found" };
    if (["42883", "PGRST202", "42P01"].includes(error.code ?? "")) {
      return { ok: false, error: "database_update_required" };
    }
    if (error.code === "42501" || message.includes("not authorized") || message.includes("permission denied")) {
      return { ok: false, error: "permission_denied" };
    }
    return { ok: false, error: "failed" };
  }
  if (data !== true && data !== false) {
    console.error("Worker deactivation returned an unexpected result.");
    return { ok: false, error: "failed" };
  }

  revalidatePath("/workers");
  revalidatePath("/attendance");
  revalidatePath("/");
  return { ok: true };
}
