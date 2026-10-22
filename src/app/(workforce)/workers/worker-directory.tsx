"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { deactivateWorker } from "@/app/actions/workers";
import { formatTryFromKurus } from "@/lib/money";
import { normalizeSearch } from "@/lib/attendance-list";
import { workerIdShareMessage, whatsappShareUrl } from "@/lib/whatsapp";
import type { Locale } from "@/types/domain";

export type WorkerListItem = {
  id: string;
  worker_code: string;
  full_name: string;
  shift_id: string;
  daily_salary_kurus: number;
  employment_status: "active" | "inactive";
  shift_name: string;
};

export function WorkerDirectory({
  workers,
  locale,
  createdCode,
}: {
  workers: WorkerListItem[];
  locale: Locale;
  createdCode?: string;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"active" | "inactive" | "all">("active");
  const [copied, setCopied] = useState(false);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [workerToDeactivate, setWorkerToDeactivate] = useState<WorkerListItem | null>(null);
  const [deactivationMessage, setDeactivationMessage] = useState("");
  const [deactivationError, setDeactivationError] = useState(false);
  const router = useRouter();
  const arabic = locale === "ar";
  const filtered = useMemo(() => {
    const needle = normalizeSearch(query);
    return workers.filter((worker) => {
      if (status !== "all" && worker.employment_status !== status) return false;
      return !needle || normalizeSearch(worker.full_name).includes(needle) ||
        normalizeSearch(worker.worker_code).includes(needle);
    });
  }, [query, status, workers]);
  const activeCount = workers.filter((worker) => worker.employment_status === "active").length;
  const inactiveCount = workers.length - activeCount;

  async function copyCreatedId() {
    if (!createdCode || !navigator.clipboard) return;
    await navigator.clipboard.writeText(createdCode);
    setCopied(true);
  }

  async function runDeactivation() {
    if (!workerToDeactivate || deactivatingId) return;
    const worker = workerToDeactivate;
    setDeactivatingId(worker.id);
    setDeactivationMessage("");
    setDeactivationError(false);
    try {
      const result = await deactivateWorker({ workerId: worker.id });
      if (!result.ok) {
        const messages = {
          invalid: arabic ? "معرّف العامل غير صالح." : "Çalışan kimliği geçersiz.",
          unauthorized: arabic ? "انتهت الجلسة. سجّل الدخول مجدداً." : "Oturum süresi doldu. Tekrar giriş yapın.",
          not_found: arabic ? "لم يتم العثور على العامل." : "Çalışan bulunamadı.",
          permission_denied: arabic
            ? "ليس لهذا الحساب صلاحية المشرف لإيقاف العامل."
            : "Bu hesapta çalışanı devre dışı bırakma yönetici izni yok.",
          database_update_required: arabic
            ? "يلزم تحديث قاعدة البيانات. طبّق ترحيل تعطيل العامل في Supabase."
            : "Veritabanı güncellemesi gerekli. Supabase'te çalışanı devre dışı bırakma migration'ını uygulayın.",
          failed: arabic ? "تعذّر إيقاف العامل. حاول مجدداً." : "Çalışan devre dışı bırakılamadı. Tekrar deneyin.",
        } as const;
        setDeactivationMessage(messages[result.error]);
        setDeactivationError(true);
        return;
      }

      setStatus("active");
      setDeactivationMessage(arabic
        ? "تم إيقاف العامل. تم الاحتفاظ بالرقم والسجلات السابقة."
        : "Çalışan devre dışı bırakıldı. Çalışan numarası ve geçmiş kayıtlar korundu.");
      setWorkerToDeactivate(null);
      router.refresh();
    } catch (error) {
      console.error("Worker deactivation request failed:", error);
      setDeactivationMessage(arabic
        ? "تعذّر الاتصال. لم يتم تأكيد تغيير حالة العامل."
        : "İstek tamamlanamadı. Çalışanın durumunun değiştiği doğrulanamadı.");
      setDeactivationError(true);
    } finally {
      setDeactivatingId(null);
    }
  }

  return (
    <>
      {createdCode && (
        <section className="created-worker-banner" aria-live="polite">
          <div>
            <strong>{arabic ? "تم إنشاء العامل بنجاح" : "Çalışan başarıyla oluşturuldu"}</strong>
            <span className="created-code">{createdCode}</span>
          </div>
          <div className="created-actions">
            <button className="button button-secondary" onClick={copyCreatedId} type="button">
              {copied ? (arabic ? "تم النسخ" : "Kopyalandı") : (arabic ? "نسخ الرقم" : "ID'yi kopyala")}
            </button>
            <a className="button button-secondary" href={whatsappShareUrl(workerIdShareMessage(locale, createdCode))} rel="noreferrer" target="_blank">
              WhatsApp
            </a>
          </div>
        </section>
      )}
      <div className="directory-toolbar">
        <label className="search-label">
          <span className="sr-only">{arabic ? "ابحث بالاسم أو رقم العامل" : "İsim veya çalışan numarasıyla ara"}</span>
          <span aria-hidden="true">⌕</span>
          <input
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={arabic ? "ابحث بالاسم أو الرقم" : "İsim veya çalışan numarası ara"}
            type="search"
            value={query}
          />
        </label>
        <div aria-label={arabic ? "حالة التوظيف" : "Çalışma durumu"} className="worker-status-filter" role="group">
          <button
            aria-pressed={status === "active"}
            className={`worker-status-option${status === "active" ? " selected" : ""}`}
            onClick={() => setStatus("active")}
            type="button"
          >
            {arabic ? "النشطون" : "Aktif"} <span>{activeCount}</span>
          </button>
          <button
            aria-pressed={status === "inactive"}
            className={`worker-status-option${status === "inactive" ? " selected" : ""}`}
            onClick={() => setStatus("inactive")}
            type="button"
          >
            {arabic ? "غير النشطين" : "Pasif"} <span>{inactiveCount}</span>
          </button>
          <button
            aria-pressed={status === "all"}
            className={`worker-status-option${status === "all" ? " selected" : ""}`}
            onClick={() => setStatus("all")}
            type="button"
          >
            {arabic ? "الكل" : "Tümü"} <span>{workers.length}</span>
          </button>
        </div>
      </div>
      {deactivationMessage && !workerToDeactivate && (
        <p className={`notice ${deactivationError ? "notice-error" : "notice-success"}`} role={deactivationError ? "alert" : "status"}>
          {deactivationMessage}
        </p>
      )}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <span aria-hidden="true" className="empty-icon">♙</span>
          <strong>{arabic ? "لا يوجد عاملون مطابقون" : "Eşleşen çalışan bulunamadı"}</strong>
          <p>{arabic ? "غيّر البحث أو المرشح." : "Aramanızı veya seçtiğiniz filtreyi değiştirin."}</p>
        </div>
      ) : (
        <div className="worker-list">
          {filtered.map((worker) => (
            <article className="worker-card" key={worker.id}>
              <span aria-hidden="true" className="worker-initial">
                {worker.full_name.trim().charAt(0).toLocaleUpperCase(arabic ? "ar" : "tr-TR")}
              </span>
              <div className="worker-details">
                <strong className="worker-name">{worker.full_name}</strong>
                <span className="worker-code">{worker.worker_code}</span>
                <span className="worker-meta">{worker.shift_name} · {formatTryFromKurus(worker.daily_salary_kurus, locale)} / {arabic ? "يوم" : "gün"}</span>
              </div>
              <span className={`employment-badge ${worker.employment_status}`}>
                {worker.employment_status === "active"
                  ? (arabic ? "نشط" : "Aktif")
                  : (arabic ? "غير نشط" : "Pasif")}
              </span>
              {worker.employment_status === "active" && (
                <button
                  aria-label={arabic
                    ? `إيقاف ${worker.full_name}، ${worker.worker_code}`
                    : `${worker.full_name}, ${worker.worker_code} çalışanını devre dışı bırak`}
                  className="button worker-deactivate"
                  onClick={() => {
                    setDeactivationMessage("");
                    setDeactivationError(false);
                    setWorkerToDeactivate(worker);
                  }}
                  type="button"
                >
                  {arabic ? "إيقاف العامل" : "Devre dışı bırak"}
                </button>
              )}
            </article>
          ))}
        </div>
      )}
      <p className="directory-result">
        {arabic ? `${filtered.length} من ${workers.length} عامل · ${activeCount} نشط` : `${filtered.length} / ${workers.length} çalışan · ${activeCount} aktif`}
      </p>
      <Link className="floating-add button button-primary" href="/workers/new">
        <span aria-hidden="true">＋</span>{arabic ? "إضافة عامل" : "Çalışan ekle"}
      </Link>
      {workerToDeactivate && (
        <div className="modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !deactivatingId) setWorkerToDeactivate(null);
        }}>
          <section
            aria-describedby="deactivation-description"
            aria-labelledby="deactivation-heading"
            aria-modal="true"
            className="confirm-dialog"
            dir={arabic ? "rtl" : "ltr"}
            role="alertdialog"
          >
            <h2 id="deactivation-heading">{arabic ? "تأكيد إيقاف العامل" : "Çalışanı devre dışı bırakmayı onayla"}</h2>
            <p className="deactivation-worker-name">{workerToDeactivate.full_name} · {workerToDeactivate.worker_code}</p>
            <p id="deactivation-description">
              {arabic
                ? "سيُزال هذا العامل من قائمة النشطين ولن يظهر في الورديات المستقبلية. لن يُحذف نهائياً؛ سيبقى رقم العامل وسجل الحضور والأرباح محفوظاً."
                : "Bu çalışan aktif listesinden kaldırılacak ve gelecekteki vardiyalarda görünmeyecek. Kalıcı olarak silinmeyecek; çalışan numarası, geçmiş devam ve kazanç kayıtları korunacak."}
            </p>
            <div className="deactivation-warning">
              <strong>{arabic ? "تنبيه" : "Önemli"}</strong>
              <span>{arabic
                ? "إيقاف العامل يؤثر على تسجيله في الورديات القادمة، ولا يمحو سجلاته السابقة."
                : "Bu işlem kalıcı silme değildir. Gelecek vardiyalara eklenmesini durdurur; eski kayıtlarını silmez."}</span>
            </div>
            {deactivationMessage && (
              <p className="notice notice-error" role="alert">{deactivationMessage}</p>
            )}
            <div className="form-actions">
              <button
                className="button button-secondary"
                disabled={Boolean(deactivatingId)}
                onClick={() => setWorkerToDeactivate(null)}
                type="button"
              >{arabic ? "إلغاء" : "Vazgeç"}</button>
              <button
                className="button worker-confirm-button"
                disabled={Boolean(deactivatingId)}
                onClick={() => void runDeactivation()}
                type="button"
              >{deactivatingId
                  ? (arabic ? "جارٍ الحفظ…" : "İşleniyor…")
                  : (arabic ? "تأكيد إيقاف العامل" : "Evet, devre dışı bırak")}</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
