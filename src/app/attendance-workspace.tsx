"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { saveAttendanceDecision, submitAttendance } from "@/app/actions/attendance";
import { filterAttendance, summarizeDecisions, type AttendanceDecision } from "@/lib/attendance-list";
import { DRAFT_STORAGE_PREFIX } from "@/lib/constants";
import { formatDate } from "@/lib/time";
import { getMessages } from "@/lib/i18n";
import type { Locale } from "@/types/domain";

export type AttendanceWorker = {
  id: string;
  workerCode: string;
  fullName: string;
  decision: AttendanceDecision;
};

type SavedDraft = {
  instanceId: string;
  decisions: Record<string, AttendanceDecision>;
};

const STORAGE_ERROR = "__hc_storage_error__";

function readDraftSnapshot(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    console.error("Could not read local attendance draft:", error);
    return STORAGE_ERROR;
  }
}

export function AttendanceWorkspace({
  instanceId,
  businessDate,
  shiftName,
  startsAt,
  endsAt,
  deadlineAt,
  initialWorkers,
  initialStatus,
  locale,
  demoMode = false,
}: {
  instanceId: string;
  businessDate: string;
  shiftName: string;
  startsAt: string;
  endsAt: string;
  deadlineAt: string;
  initialWorkers: AttendanceWorker[];
  initialStatus: "scheduled" | "open" | "submitted" | "closed";
  locale: Locale;
  demoMode?: boolean;
}) {
  const t = getMessages(locale);
  const arabic = locale === "ar";
  const router = useRouter();
  const storageKey = `${DRAFT_STORAGE_PREFIX}${instanceId}`;
  const [demoSubmitted, setDemoSubmitted] = useState(false);
  const submitted = initialStatus === "submitted" || (demoMode && demoSubmitted);
  const closed = initialStatus === "closed";
  const subscribe = useCallback(() => () => {}, []);
  const getSnapshot = useCallback(
    () => demoMode ? null : readDraftSnapshot(storageKey),
    [demoMode, storageKey],
  );
  const draftSnapshot = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const serverDecisions = useMemo(
    () => Object.fromEntries(initialWorkers.map((worker) => [worker.id, worker.decision])),
    [initialWorkers],
  );
  const restoredDecisions = useMemo(() => {
    if (!draftSnapshot || draftSnapshot === STORAGE_ERROR) return {};
    try {
      const parsed = JSON.parse(draftSnapshot) as SavedDraft;
      if (parsed.instanceId !== instanceId || !parsed.decisions || typeof parsed.decisions !== "object") return {};
      const workerIds = new Set(initialWorkers.map((worker) => worker.id));
      const restored: Record<string, AttendanceDecision> = {};
      for (const [workerId, decision] of Object.entries(parsed.decisions)) {
        if (workerIds.has(workerId) && ["present", "absent", "pending"].includes(decision)) {
          restored[workerId] = decision;
        }
      }
      return restored;
    } catch (error) {
      console.error("Could not parse local attendance draft:", error);
      return {};
    }
  }, [draftSnapshot, initialWorkers, instanceId]);
  const [decisionEdits, setDecisionEdits] = useState<Record<string, AttendanceDecision>>({});
  const decisions = useMemo(
    () => submitted && !demoMode
      ? serverDecisions
      : { ...serverDecisions, ...restoredDecisions, ...decisionEdits },
    [decisionEdits, demoMode, restoredDecisions, serverDecisions, submitted],
  );
  const [savedDecisions, setSavedDecisions] = useState<Record<string, AttendanceDecision>>(
    () => Object.fromEntries(initialWorkers.map((worker) => [worker.id, worker.decision])),
  );
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<AttendanceDecision | "all">("all");
  const [savingWorker, setSavingWorker] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, startSubmission] = useTransition();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const rows = useMemo(() => initialWorkers.map((worker) => ({
    ...worker,
    workerId: worker.id,
    workerCode: worker.workerCode,
    fullName: worker.fullName,
    decision: decisions[worker.id] ?? "pending",
  })), [decisions, initialWorkers]);
  const summary = summarizeDecisions(rows);
  const filtered = filterAttendance(rows, { query, status: statusFilter });
  const canSetPresent = initialStatus === "open" && now >= Date.parse(startsAt) && now < Date.parse(deadlineAt);
  const canSetAbsent = initialStatus === "open" && now >= Date.parse(startsAt) && now < Date.parse(endsAt);
  const allSaved = rows.every((row) => savedDecisions[row.workerId] === row.decision);
  const canSubmit = summary.total > 0 && summary.pending === 0 && allSaved && !submitted && !closed;

  async function updateDecision(workerId: string, decision: AttendanceDecision) {
    const nextDecisions = { ...decisions, [workerId]: decision };
    setDecisionEdits((current) => ({ ...current, [workerId]: decision }));
    if (demoMode) {
      setSavedDecisions((current) => ({ ...current, [workerId]: decision }));
      setMessage(t.demoDecisionSaved);
      setMessageIsError(false);
      return;
    }

    let localSaved = true;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({
        instanceId,
        decisions: nextDecisions,
      } satisfies SavedDraft));
    } catch (error) {
      console.error("Could not persist local attendance draft:", error);
      localSaved = false;
    }
    setMessage(localSaved ? "" : t.localDraftUnavailable);
    setMessageIsError(!localSaved);
    setSavingWorker(workerId);
    let result;
    try {
      result = await saveAttendanceDecision({ instanceId, workerId, status: decision });
    } catch (error) {
      console.error("Attendance draft request failed:", error);
      setSavingWorker(null);
      setMessage(localSaved ? t.decisionFailed : t.decisionFailedNoLocal);
      setMessageIsError(true);
      return;
    }
    setSavingWorker(null);
    if (!result.ok) {
      const errorMessage = result.error === "present_window_closed"
        ? t.presentWindowClosed
        : result.error === "shift_not_open" || result.error === "shift_closed"
          ? t.submitUnavailable
          : localSaved ? t.decisionFailed : t.decisionFailedNoLocal;
      setMessage(errorMessage);
      setMessageIsError(true);
      return;
    }
    setSavedDecisions((current) => ({ ...current, [workerId]: decision }));
    setMessage(t.decisionSaved);
    setMessageIsError(false);
    router.refresh();
  }

  function confirmSubmission() {
    if (!canSubmit) return;
    if (demoMode) {
      setDemoSubmitted(true);
      setConfirmOpen(false);
      setMessage(t.demoSubmissionComplete);
      setMessageIsError(false);
      return;
    }

    const complete = Object.fromEntries(
      rows.map((row) => [row.workerId, row.decision]).filter((entry): entry is [string, "present" | "absent"] =>
        entry[1] === "present" || entry[1] === "absent"
      ),
    );
    startSubmission(async () => {
      let result;
      try {
        result = await submitAttendance({ instanceId, decisions: complete });
      } catch (error) {
        console.error("Attendance submission request failed:", error);
        setMessage(t.submissionFailed);
        setMessageIsError(true);
        setConfirmOpen(false);
        return;
      }
      if (!result.ok) {
        setMessage(result.error === "incomplete" ? `${t.submissionFailed} ${t.pending}: ${summary.pending}` : t.submissionFailed);
        setMessageIsError(true);
        setConfirmOpen(false);
        return;
      }
      window.localStorage.removeItem(storageKey);
      setConfirmOpen(false);
      router.refresh();
    });
  }

  return (
    <section className="attendance-page" dir={arabic ? "rtl" : "ltr"}>
      {demoMode && (
        <div className="attendance-demo-notice" role="status">
          <strong>{t.demoModeTitle}</strong>
          <span>{t.demoModeDescription}</span>
          <Link className="text-button" href="/attendance">{t.exitDemo}</Link>
        </div>
      )}
      <header className="page-heading">
        <div>
          <p className="eyebrow">{t.attendanceTitle}</p>
          <h1>{shiftName}</h1>
          <p className="muted">{t.attendanceDate}: {formatDate(businessDate, locale)}</p>
        </div>
        <span className={`status-pill status-${submitted ? "submitted" : closed ? "closed" : initialStatus}`}>
          {submitted ? t.statusSubmitted : closed ? t.statusClosed : initialStatus === "open" ? t.statusOpen : t.statusUpcoming}
        </span>
      </header>

      {!submitted && !closed && (
        <div className="attendance-toolbar">
          <label className="search-label">
            <span aria-hidden="true">⌕</span>
            <span className="sr-only">{t.searchAttendance}</span>
            <input autoComplete="off" onChange={(event) => setQuery(event.target.value)} placeholder={t.searchAttendance} type="search" value={query} />
          </label>
          <label className="attendance-filter">
            <span className="sr-only">{t.filterAttendance}</span>
            <select className="filter-select" onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} value={statusFilter}>
              <option value="all">{t.allStatuses}</option>
              <option value="pending">{t.pendingFirst}</option>
              <option value="present">{t.present}</option>
              <option value="absent">{t.absent}</option>
            </select>
          </label>
        </div>
      )}

      {filtered.hiddenPending > 0 && (
        <div className="pending-warning" role="status">
          <span>{filtered.hiddenPending} {t.hiddenPending}</span>
          <button className="text-button" onClick={() => { setQuery(""); setStatusFilter("pending"); }} type="button">{t.showPending}</button>
        </div>
      )}

      {draftSnapshot === STORAGE_ERROR && (
        <p className="notice notice-error" role="alert">{t.localDraftUnavailable}</p>
      )}

      {!submitted && rows.some((row) => row.decision !== "pending") && (
        <p className="draft-notice" role="status">{t.draftNotConfirmed}</p>
      )}

      {summary.total === 0 ? (
        <div className="empty-state">
          <strong>{t.noWorkers}</strong>
        </div>
      ) : (
        <div className="attendance-list">
          {filtered.visible.map((worker) => {
            const busy = savingWorker === worker.workerId;
            const saved = savedDecisions[worker.workerId] === worker.decision;
            const decisionText = worker.decision === "pending"
              ? t.pendingFirst
              : worker.decision === "present" ? t.present : t.absent;
            return (
              <article className={`attendance-row${worker.decision === "pending" ? " is-pending" : ""}`} key={worker.workerId}>
                <span aria-hidden="true" className="worker-initial">{worker.fullName.trim().charAt(0).toLocaleUpperCase(arabic ? "ar" : "tr-TR")}</span>
                <div className="attendance-worker">
                  <strong>{worker.fullName}</strong>
                  <span className="worker-code">{worker.workerCode}</span>
                </div>
                <div aria-label={`${worker.fullName}: ${decisionText}`} className="attendance-decisions">
                  <button
                    aria-pressed={worker.decision === "present"}
                    className={`decision-button present${worker.decision === "present" ? " selected" : ""}`}
                    disabled={submitted || closed || busy || !canSetPresent}
                    onClick={() => void updateDecision(worker.workerId, "present")}
                    type="button"
                  >{t.present}</button>
                  <button
                    aria-pressed={worker.decision === "absent"}
                    className={`decision-button absent${worker.decision === "absent" ? " selected" : ""}`}
                    disabled={submitted || closed || busy || !canSetAbsent}
                    onClick={() => void updateDecision(worker.workerId, "absent")}
                    type="button"
                  >{t.absent}</button>
                  {!submitted && !closed && worker.decision !== "pending" && (
                    <button
                      aria-label={arabic ? `إعادة ${worker.fullName} إلى الانتظار` : `${worker.fullName} kararını bekleyene al`}
                      className="clear-decision"
                      disabled={busy}
                      onClick={() => void updateDecision(worker.workerId, "pending")}
                      type="button"
                    >×</button>
                  )}
                </div>
                <span className={`decision-state ${worker.decision}`}>
                  {worker.decision === "pending" ? t.pendingFirst : worker.decision === "present" ? t.present : t.absent}
                </span>
                {!saved && <span className="unsaved-indicator">{t.draftOnDevice}</span>}
                {busy && <span className="saving-label" role="status">{t.saveDecision}</span>}
              </article>
            );
          })}
        </div>
      )}

      {message && <p className={`notice ${messageIsError ? "notice-error" : "notice-success"}`} role={messageIsError ? "alert" : "status"}>{message}</p>}

      <footer className="attendance-summary">
        <div className="attendance-counts">
          <span>{t.totalExpected}: <strong>{summary.total}</strong></span>
          <span className="count-present">{t.present}: <strong>{summary.present}</strong></span>
          <span className="count-absent">{t.absent}: <strong>{summary.absent}</strong></span>
          <span className="count-pending">{t.pendingFirst}: <strong>{summary.pending}</strong></span>
        </div>
        {!submitted && !closed && (
          <button className="button button-primary" disabled={!canSubmit || submitting} onClick={() => setConfirmOpen(true)} type="button">
            {t.reviewAttendance}
          </button>
        )}
        {submitted && <strong className="submitted-label">{t.submitted}</strong>}
      </footer>

      {confirmOpen && (
        <div className="modal-backdrop">
          <section aria-describedby="confirm-description" aria-labelledby="confirm-heading" aria-modal="true" className="confirm-dialog" role="dialog">
            <h2 id="confirm-heading">{t.reviewAttendance}</h2>
            <p id="confirm-description">{t.confirmPrompt}</p>
            <dl>
              <div><dt>{t.totalExpected}</dt><dd>{summary.total}</dd></div>
              <div><dt>{t.present}</dt><dd>{summary.present}</dd></div>
              <div><dt>{t.absent}</dt><dd>{summary.absent}</dd></div>
              <div><dt>{t.pendingFirst}</dt><dd>{summary.pending}</dd></div>
            </dl>
            <div className="form-actions">
              <button className="button button-secondary" onClick={() => setConfirmOpen(false)} type="button">{t.cancel}</button>
              <button className="button button-primary" disabled={submitting || summary.pending > 0 || !allSaved} onClick={confirmSubmission} type="button">
                {submitting ? t.saveDecision : t.confirmAttendance}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
