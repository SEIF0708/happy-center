import Link from "next/link";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { LOCALE_COOKIE, DEFAULT_DAILY_SALARY_KURUS } from "@/lib/constants";
import { resolveLocale } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NewWorkerForm } from "./new-worker-form";

export const instant = false;

export default async function NewWorkerPage() {
  await connection();
  const [cookieStore, supabase] = await Promise.all([cookies(), createSupabaseServerClient()]);
  const locale = resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value);
  const arabic = locale === "ar";
  const { data: shifts, error } = await supabase.from("shifts")
    .select("id,name,start_time,end_time")
    .eq("is_active", true)
    .order("start_time");

  if (error) {
    return <div className="notice notice-error" role="alert">{arabic ? "تعذّر تحميل الورديات." : "Vardiyalar yüklenemedi."}</div>;
  }
  if (!shifts?.length) {
    return <div className="notice notice-error" role="alert">{arabic ? "أنشئ وردية نشطة قبل إضافة عامل." : "Çalışan eklemeden önce aktif bir vardiya oluşturun."}</div>;
  }

  return (
    <section className="new-worker-page">
      <Link className="back-link" href="/workers">← {arabic ? "العودة إلى العاملين" : "Çalışanlara dön"}</Link>
      <header className="page-heading">
        <div>
          <p className="eyebrow">{arabic ? "إدارة الفريق" : "Ekip yönetimi"}</p>
          <h1>{arabic ? "إضافة عامل" : "Yeni çalışan"}</h1>
          <p className="muted">{arabic ? "سيتم إنشاء رقم العامل تلقائياً." : "Çalışan numarası güvenli şekilde otomatik oluşturulur."}</p>
        </div>
      </header>
      <NewWorkerForm
        defaultSalary={DEFAULT_DAILY_SALARY_KURUS}
        locale={locale}
        requestId={randomUUID()}
        shifts={shifts.map((shift) => ({ id: shift.id, name: shift.name, startTime: shift.start_time, endTime: shift.end_time }))}
      />
    </section>
  );
}
