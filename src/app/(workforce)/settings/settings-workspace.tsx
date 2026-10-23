"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { activateShift, saveShift, updateSupervisorName, type SettingsActionResult } from "@/app/actions/settings";
import { getMessages } from "@/lib/i18n";
import type { Locale } from "@/types/domain";

type ShiftSetting = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  attendanceWindowMinutes: number;
  isActive: boolean;
};

type ShiftDraft = {
  id: string | null;
  name: string;
  startTime: string;
  endTime: string;
  attendanceWindowMinutes: number;
};

function newShiftDraft(): ShiftDraft {
  return {
    id: null,
    name: "",
    startTime: "09:00",
    endTime: "17:00",
    attendanceWindowMinutes: 60,
  };
}

export function SettingsWorkspace({
  locale,
  supervisorName,
  shifts,
}: {
  locale: Locale;
  supervisorName: string;
  shifts: ShiftSetting[];
}) {
  const t = getMessages(locale);
  const arabic = locale === "ar";
  const router = useRouter();
  const [name, setName] = useState(supervisorName);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState(false);
  const [profilePending, startProfileTransition] = useTransition();
  const [draft, setDraft] = useState<ShiftDraft>(newShiftDraft);
  const [shiftMessage, setShiftMessage] = useState("");
  const [shiftError, setShiftError] = useState(false);
  const [shiftPending, startShiftTransition] = useTransition();
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [activationMessage, setActivationMessage] = useState("");
  const [activationError, setActivationError] = useState(false);
  const isRtl = arabic ? "rtl" : "ltr";

  function actionError(
    result: Extract<SettingsActionResult, { ok: false }>,
    invalidMessage = t.invalidName,
    failedMessage = arabic ? "تعذّر حفظ التغييرات. حاول مجدداً." : "Değişiklikler kaydedilemedi. Tekrar deneyin.",
  ): string {
    if (result.error === "invalid") return invalidMessage;
    if (result.error === "unauthorized") return arabic
      ? "انتهت الجلسة. سجّل الدخول مجدداً."
      : "Oturum süresi doldu. Tekrar giriş yapın.";
    if (result.error === "database_update_required") return arabic
      ? "يلزم تطبيق ترحيل إعدادات المشرف والورديات في Supabase."
      : "Supabase'te 20261023120000_supervisor_settings_and_shifts.sql migration'ını uygulayın.";
    if (result.error === "shift_in_progress") return t.shiftInProgress;
    return failedMessage;
  }

  function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileMessage("");
    setProfileError(false);
    startProfileTransition(async () => {
      try {
        const result = await updateSupervisorName(name);
        if (!result.ok) {
          setProfileMessage(actionError(result, t.invalidName, t.profileSaveFailed));
          setProfileError(true);
          return;
        }
        setProfileMessage(t.profileSaved);
        router.refresh();
      } catch (error) {
        console.error("Supervisor profile update request failed:", error);
        setProfileMessage(t.profileSaveFailed);
        setProfileError(true);
      }
    });
  }

  function handleShiftSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setShiftMessage("");
    setShiftError(false);
    startShiftTransition(async () => {
      try {
        const result = await saveShift(draft);
        if (!result.ok) {
          setShiftMessage(actionError(result, t.shiftInvalid, t.shiftSaveFailed));
          setShiftError(true);
          return;
        }
        setShiftMessage(t.shiftSaved);
        setDraft(newShiftDraft());
        router.refresh();
      } catch (error) {
        console.error("Shift save request failed:", error);
        setShiftMessage(t.shiftSaveFailed);
        setShiftError(true);
      }
    });
  }

  async function handleActivateShift(shift: ShiftSetting) {
    if (shift.isActive || activatingId) return;
    const confirmed = window.confirm(t.shiftActivationWarning);
    if (!confirmed) return;

    setActivatingId(shift.id);
    setActivationMessage("");
    setActivationError(false);
    try {
      const result = await activateShift(shift.id);
      if (!result.ok) {
        setActivationMessage(actionError(result, t.invalidName, t.shiftSaveFailed));
        setActivationError(true);
        return;
      }
      setActivationMessage(t.shiftActivated);
      router.refresh();
    } catch (error) {
      console.error("Shift activation request failed:", error);
      setActivationMessage(actionError({ ok: false, error: "failed" }, t.invalidName, t.shiftSaveFailed));
      setActivationError(true);
    } finally {
      setActivatingId(null);
    }
  }

  return (
    <section className="settings-page" dir={isRtl}>
      <header className="page-heading">
        <div>
          <p className="eyebrow">{arabic ? "النظام" : "Sistem"}</p>
          <h1>{t.settings}</h1>
          <p className="muted">{t.settingsDescription}</p>
        </div>
      </header>

      <section aria-labelledby="profile-settings-heading" className="settings-section">
        <h2 id="profile-settings-heading">{t.profileSettings}</h2>
        <form className="settings-form" onSubmit={handleProfileSubmit}>
          <label className="field-label" htmlFor="supervisor-name">{t.supervisorName}</label>
          <input
            autoComplete="name"
            className="text-input"
            id="supervisor-name"
            maxLength={120}
            minLength={2}
            onChange={(event) => setName(event.target.value)}
            required
            value={name}
          />
          <div className="settings-form-actions">
            <button className="button button-primary" disabled={profilePending} type="submit">
              {profilePending ? t.saving : t.saveChanges}
            </button>
          </div>
          {profileMessage && (
            <p className={`notice ${profileError ? "notice-error" : "notice-success"}`} role={profileError ? "alert" : "status"}>
              {profileMessage}
            </p>
          )}
        </form>
      </section>

      <section aria-labelledby="shift-settings-heading" className="settings-section">
        <div className="settings-section-heading">
          <div>
            <h2 id="shift-settings-heading">{t.shiftSettings}</h2>
            <p className="muted">{t.shiftActivationWarning}</p>
          </div>
        </div>

        {activationMessage && (
          <p className={`notice ${activationError ? "notice-error" : "notice-success"}`} role={activationError ? "alert" : "status"}>
            {activationMessage}
          </p>
        )}

        {shifts.length ? (
          <div className="settings-shift-list">
            {shifts.map((shift) => (
              <article className="settings-shift-card" key={shift.id}>
                <div className="settings-shift-details">
                  <div className="settings-shift-title">
                    <h3>{shift.name}</h3>
                    <span className={`shift-state${shift.isActive ? " active" : ""}`}>
                      {shift.isActive ? t.activeShift : t.inactiveShift}
                    </span>
                  </div>
                  <p>{shift.startTime}–{shift.endTime} · {shift.attendanceWindowMinutes} {arabic ? "دقيقة للحضور" : "dk yoklama süresi"}</p>
                </div>
                <div className="settings-shift-actions">
                  <button
                    className="button button-secondary"
                    onClick={() => {
                      setDraft({
                        id: shift.id,
                        name: shift.name,
                        startTime: shift.startTime,
                        endTime: shift.endTime,
                        attendanceWindowMinutes: shift.attendanceWindowMinutes,
                      });
                      setShiftMessage("");
                      document.getElementById("shift-name")?.focus();
                    }}
                    type="button"
                  >
                    {t.editShift}
                  </button>
                  {!shift.isActive && (
                    <button
                      className="button button-secondary"
                      disabled={activatingId !== null}
                      onClick={() => void handleActivateShift(shift)}
                      type="button"
                    >
                      {activatingId === shift.id ? t.saving : t.activateShift}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state"><strong>{t.noShifts}</strong></div>
        )}

        <form className="settings-form shift-editor" onSubmit={handleShiftSubmit}>
          <h3>{draft.id ? t.editShift : t.addShift}</h3>
          <label className="field-label" htmlFor="shift-name">{t.shiftName}</label>
          <input
            className="text-input"
            id="shift-name"
            maxLength={80}
            minLength={2}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            required
            value={draft.name}
          />
          <div className="settings-shift-fields">
            <div>
              <label className="field-label" htmlFor="shift-start">{t.shiftStart}</label>
              <input
                className="text-input"
                id="shift-start"
                onChange={(event) => setDraft({ ...draft, startTime: event.target.value })}
                required
                type="time"
                value={draft.startTime}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="shift-end">{t.shiftEnd}</label>
              <input
                className="text-input"
                id="shift-end"
                onChange={(event) => setDraft({ ...draft, endTime: event.target.value })}
                required
                type="time"
                value={draft.endTime}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="shift-attendance-window">{t.attendanceWindow}</label>
              <input
                className="text-input"
                id="shift-attendance-window"
                max={720}
                min={1}
                onChange={(event) => setDraft({ ...draft, attendanceWindowMinutes: Number(event.target.value) })}
                required
                type="number"
                value={draft.attendanceWindowMinutes}
              />
            </div>
          </div>
          {shiftMessage && (
            <p className={`notice ${shiftError ? "notice-error" : "notice-success"}`} role={shiftError ? "alert" : "status"}>
              {shiftMessage}
            </p>
          )}
          <div className="settings-form-actions">
            {draft.id && (
              <button
                className="button button-secondary"
                onClick={() => {
                  setDraft(newShiftDraft());
                  setShiftMessage("");
                }}
                type="button"
              >
                {arabic ? "إلغاء التعديل" : "Düzenlemeyi iptal et"}
              </button>
            )}
            <button className="button button-primary" disabled={shiftPending} type="submit">
              {shiftPending ? t.saving : draft.id ? t.saveShift : t.addShift}
            </button>
          </div>
        </form>
      </section>
    </section>
  );
}
