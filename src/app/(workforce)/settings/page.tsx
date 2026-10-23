import { cookies } from "next/headers";
import { connection } from "next/server";
import { LOCALE_COOKIE } from "@/lib/constants";
import { getMessages, resolveLocale } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SettingsWorkspace } from "./settings-workspace";

export const instant = false;

export default async function SettingsPage() {
  await connection();
  const [cookieStore, supabase] = await Promise.all([cookies(), createSupabaseServerClient()]);
  const locale = resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value);
  const t = getMessages(locale);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return <div className="notice notice-error" role="alert">{t.notSupervisor}</div>;
  }
  const [{ data: supervisor, error: supervisorError }, { data: shifts, error: shiftsError }] = await Promise.all([
    supabase.from("supervisors").select("display_name").eq("auth_user_id", user.id).maybeSingle(),
    supabase.from("shifts").select("id,name,start_time,end_time,attendance_window_minutes,is_active").order("start_time"),
  ]);

  if (supervisorError || shiftsError || !supervisor) {
    console.error("Settings data load failed:", {
      supervisor: supervisorError?.message ?? (!supervisor ? "Supervisor profile not found" : null),
      shifts: shiftsError?.message ?? null,
    });
    return <div className="notice notice-error" role="alert">{t.connectionError}</div>;
  }

  return (
    <SettingsWorkspace
      locale={locale}
      shifts={(shifts ?? []).map((shift) => ({
        id: shift.id,
        name: shift.name,
        startTime: shift.start_time.slice(0, 5),
        endTime: shift.end_time.slice(0, 5),
        attendanceWindowMinutes: shift.attendance_window_minutes,
        isActive: shift.is_active,
      }))}
      supervisorName={supervisor.display_name}
    />
  );
}
