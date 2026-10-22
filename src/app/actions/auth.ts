"use server";

import { redirect } from "next/navigation";
import { loginSchema } from "@/lib/validation/schemas";
import {
  createSupabaseServerClient,
  SupabaseConfigurationError,
} from "@/lib/supabase/server";

export type LoginState = {
  error?: "invalid" | "configuration" | "not_supervisor";
};

export async function signIn(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "invalid" };
  }

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    if (error instanceof SupabaseConfigurationError) {
      return { error: "configuration" };
    }
    throw error;
  }

  const { error: authError } = await supabase.auth.signInWithPassword(parsed.data);
  if (authError) {
    return { error: "invalid" };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    await supabase.auth.signOut();
    return { error: "invalid" };
  }

  const { data: supervisor, error: supervisorError } = await supabase
    .from("supervisors")
    .select("id")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();

  if (supervisorError) {
    await supabase.auth.signOut();
    throw new Error(`Could not verify supervisor access: ${supervisorError.message}`);
  }
  if (!supervisor) {
    await supabase.auth.signOut();
    return { error: "not_supervisor" };
  }

  redirect("/");
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new Error(`Could not sign out: ${error.message}`);
  }
  redirect("/login");
}
