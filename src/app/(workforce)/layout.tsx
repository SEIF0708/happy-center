import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { LOCALE_COOKIE } from "@/lib/constants";
import { resolveLocale } from "@/lib/i18n";
import {
  createSupabaseServerClient,
  SupabaseConfigurationError,
} from "@/lib/supabase/server";
import { WorkforceShell } from "@/app/workforce-shell";

export const instant = false;

export default async function WorkforceLayout({
  children,
}: LayoutProps<"/">) {
  await connection();
  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    if (error instanceof SupabaseConfigurationError) {
      redirect("/login");
    }
    throw error;
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    redirect("/login");
  }

  const { data: supervisor, error } = await supabase
    .from("supervisors")
    .select("display_name")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (error) {
    throw new Error(`Could not verify supervisor access: ${error.message}`);
  }
  if (!supervisor) {
    redirect("/login");
  }

  const cookieStore = await cookies();
  const locale = resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value);
  return (
    <WorkforceShell locale={locale} supervisorName={supervisor.display_name}>
      {children}
    </WorkforceShell>
  );
}
