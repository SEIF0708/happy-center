"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { createWorker, type CreateWorkerState } from "@/app/actions/workers";
import { formatTryFromKurus } from "@/lib/money";
import type { Locale } from "@/types/domain";

type ShiftChoice = { id: string; name: string; startTime: string; endTime: string };

export function NewWorkerForm({
  shifts,
  defaultSalary,
  locale,
  requestId,
}: {
  shifts: ShiftChoice[];
  defaultSalary: number;
  locale: Locale;
  requestId: string;
}) {
  const arabic = locale === "ar";
  const [state, action, pending] = useActionState<CreateWorkerState, FormData>(createWorker, {});
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!pending) {
      submittingRef.current = false;
    }
  }, [pending]);

  return (
    <form
      action={action}
      className="worker-form"
      dir={arabic ? "rtl" : "ltr"}
      onSubmit={(event) => {
        if (submittingRef.current) {
          event.preventDefault();
          return;
        }
        submittingRef.current = true;
      }}
    >
      <input name="requestId" type="hidden" value={requestId} />
      <label className="field-label" htmlFor="fullName">{arabic ? "الاسم الكامل" : "Ad soyad"}</label>
      <input
        autoComplete="name"
        className="text-input"
        id="fullName"
        maxLength={120}
        name="fullName"
        placeholder={arabic ? "اكتب الاسم كما هو" : "Çalışanın adını yazın"}
        required
      />
      <label className="field-label" htmlFor="shiftId">{arabic ? "الوردية" : "Vardiya"}</label>
      <select className="text-input" defaultValue={shifts[0]?.id} id="shiftId" name="shiftId" required>
        {shifts.map((shift) => (
          <option key={shift.id} value={shift.id}>
            {shift.name} · {shift.startTime.slice(0, 5)}–{shift.endTime.slice(0, 5)}
          </option>
        ))}
      </select>
      <label className="field-label" htmlFor="dailySalary">{arabic ? "الأجر اليومي (ليرة تركية)" : "Günlük ücret (₺)"}</label>
      <input
        className="text-input"
        defaultValue={(defaultSalary / 100).toFixed(2)}
        id="dailySalary"
        inputMode="decimal"
        max="500000"
        min="0"
        name="dailySalary"
        required
        step="0.01"
        type="number"
      />
      <p className="form-hint">{arabic ? `الافتراضي: ${formatTryFromKurus(defaultSalary, locale)} لكل وردية مؤكدة.` : `Varsayılan: ${formatTryFromKurus(defaultSalary, locale)} / onaylanan vardiya.`}</p>
      {state.error && (
        <p className="form-error" role="alert">
          {state.error === "unauthorized"
            ? (arabic ? "انتهت الجلسة. سجّل الدخول مجدداً." : "Oturum süresi doldu. Tekrar giriş yapın.")
            : state.error === "invalid"
              ? (arabic ? "تحقق من الاسم والوردية والأجر." : "Ad, vardiya ve ücret bilgilerini kontrol edin.")
              : state.error === "database_update_required"
                ? (arabic
                  ? "يلزم تحديث قاعدة البيانات. طبّق ترحيل 20261022101500_fix_idempotent_worker_creation.sql في Supabase."
                  : "Veritabanı güncellemesi gerekli. Supabase SQL Editor'da 20261022101500_fix_idempotent_worker_creation.sql dosyasını çalıştırın.")
              : (arabic ? "تعذّر حفظ العامل. حاول مجدداً." : "Çalışan kaydedilemedi. Tekrar deneyin.")}
        </p>
      )}
      <div className="form-actions">
        <Link className="button button-secondary" href="/workers">{arabic ? "إلغاء" : "İptal"}</Link>
        <button className="button button-primary" disabled={pending} type="submit">
          {pending ? (arabic ? "جارٍ الحفظ…" : "Kaydediliyor…") : (arabic ? "حفظ العامل" : "Çalışanı kaydet")}
        </button>
      </div>
    </form>
  );
}
