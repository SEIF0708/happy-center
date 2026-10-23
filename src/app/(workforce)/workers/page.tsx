import Link from "next/link";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { LOCALE_COOKIE } from "@/lib/constants";
import { resolveLocale } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { WorkerDirectory, type WorkerListItem } from "./worker-directory";

export const instant = false;

type SearchParams = Promise<{ created?: string }>;

export default async function WorkersPage({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const [{ created }, cookieStore, supabase] = await Promise.all([
    searchParams,
    cookies(),
    createSupabaseServerClient(),
  ]);
  const locale = resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value);
  const arabic = locale === "ar";
  const [{ data: rows, error }, { count: activeCount, error: countError }] = await Promise.all([
    supabase.from("workers")
      .select("id,worker_code,full_name,shift_id,daily_salary_kurus,employment_status")
      .order("full_name"),
    supabase.from("workers").select("id", { count: "exact", head: true }).eq("employment_status", "active"),
  ]);

  if (error || countError) {
    console.error("Worker directory query failed:", {
      workers: error ? { code: error.code, message: error.message } : null,
      activeCount: countError ? { code: countError.code, message: countError.message } : null,
    });
    return <div className="notice notice-error" role="alert">{arabic ? "تعذّر تحميل العاملين." : "Çalışan listesi yüklenemedi."}</div>;
  }

  const { data: shifts, error: shiftsError } = await supabase.from("shifts")
    .select("id,name,start_time,end_time,is_active")
    .order("start_time");
  if (shiftsError) {
    return <div className="notice notice-error" role="alert">{arabic ? "تعذّر تحميل الورديات." : "Vardiyalar yüklenemedi."}</div>;
  }
  const shiftNames = new Map((shifts ?? []).map((shift) => [shift.id, shift.name]));
  const workers: WorkerListItem[] = (rows ?? []).map((worker) => ({
    ...worker,
    shift_name: shiftNames.get(worker.shift_id) ?? (arabic ? "وردية غير معروفة" : "Bilinmeyen vardiya"),
  }));

  return (
    <section className="workers-page">
      <Link className="back-link" href="/">
        <span aria-hidden="true">⌂</span>
        {arabic ? "الرئيسية" : "Ana sayfa"}
      </Link>
      <header className="page-heading">
        <div>
          <p className="eyebrow">{arabic ? "إدارة الفريق" : "Ekip yönetimi"}</p>
          <h1>{arabic ? "العاملون" : "Çalışanlar"}</h1>
          <p className="muted">{arabic ? `${activeCount ?? 0} عامل نشط` : `${activeCount ?? 0} aktif çalışan`}</p>
        </div>
        <Link className="button button-primary desktop-add" href="/workers/new">
          <span aria-hidden="true">＋</span>{arabic ? "إضافة عامل" : "Çalışan ekle"}
        </Link>
      </header>
      <WorkerDirectory
        createdCode={rows?.some((worker) => worker.worker_code === created) ? created : undefined}
        locale={locale}
        shifts={(shifts ?? []).map((shift) => ({
          id: shift.id,
          name: shift.name,
          startTime: shift.start_time.slice(0, 5),
          endTime: shift.end_time.slice(0, 5),
          isActive: shift.is_active,
        }))}
        workers={workers}
      />
    </section>
  );
}
