# Happy Center Workforce

Mobile-first workforce attendance and earnings application for the Happy Center Istanbul team.

## Current implementation

- Supervisor-only Supabase sign-in, server-side supervisor checks, session refresh, and RLS-backed reads.
- Turkish default UI with Turkish/Arabic switching, RTL support, and a responsive mobile/desktop shell.
- Istanbul-time dashboard populated from Supabase shift and confirmed-attendance data.
- Worker directory, search by name or worker ID, active/inactive filter, and worker creation.
- Worker creation runs as one database transaction: unique worker code generation, salary-history initialization, audit event, and idempotency protection against double submissions/retries.
- Workers can be deactivated after explicit confirmation. This removes them from future active attendance but preserves their worker ID and historical records; this app does not permanently delete workers.
- If a worker save reports a database update is required, apply the latest worker-creation fix migration from `supabase/migrations` in Supabase SQL Editor.
- Attendance drafts are timestamped and validated by server-side database functions. Submission requires a decision for every active worker and is idempotent.
- Attendance drafts have a local recovery copy; the UI distinguishes unsubmitted draft decisions from confirmed records.
- Daily and Monday–Sunday weekly reports use confirmed records and stored salary snapshots.
- Daily attendance and weekly payroll CSV downloads include a title, supervisor, period, summary, human-readable localized headers, and totals; CSV formula values are escaped and exports are audited.
- Weekly payroll statements are downloadable PDFs with the Happy Center logo, supervisor, period, per-worker work/absence dates, payable days, daily rates, and total payable amount. Apply `20261022110000_audit_payroll_pdf_exports.sql` before enabling PDF downloads in a deployed database.
- Reusable time, attendance ordering, payroll, money, CSV, and WhatsApp helpers have unit tests.

Worker editing/deactivation, profiles and historical salary changes, worker photos, shift management UI, audit-history UI, and advanced report filters remain incomplete. Settings is explicitly marked as in progress. The interface uses the Happy Center logo and red-and-neutral visual palette.

## Local development

1. Install dependencies:

   ```bash
   npm ci
   ```

2. Copy `.env.example` to `.env.local` and set:

   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

   The anon/publishable key is intended for browser use with RLS. Never put the service-role key in a `NEXT_PUBLIC_*` variable or client-side code.

3. Apply every migration in `supabase/migrations` in filename order. The migrations create the workforce schema, seed the Istanbul night shift, and add the authenticated worker/attendance/report functions.

4. Provision the supervisor securely:

   - Create the supervisor Auth account from the Supabase Dashboard or a trusted administrative environment. Public sign-up is not part of this app.
   - Insert the corresponding `auth.users.id` and approved display name into `public.supervisors` from the Supabase SQL Editor or another trusted admin-only process.
   - Never expose or commit the service-role key. The app requires a matching supervisor record after password sign-in.

5. Start the app:

   ```bash
   npm run dev
   ```

   Open <http://localhost:3000>.

Without Supabase environment variables, applied migrations, and a provisioned supervisor, the sign-in screen is available but the authenticated workflows cannot run. Database migrations have not been applied or verified against a configured Supabase project in this workspace.

## Checks

```bash
npm run lint
npx vitest run
npm run build
```

## Routes

- `/login` — supervisor sign-in.
- `/` — dashboard and current shift summary.
- `/workers` — searchable directory.
- `/workers/new` — database-backed worker registration.
- `/attendance` — draft decisions, server-side deadline enforcement, review, and submission.
- `/reports` — daily and weekly confirmed attendance / earnings views.
- `/api/reports/export` — authenticated, audited daily and weekly CSV exports.
- `/api/reports/payroll-pdf` — authenticated weekly payroll PDF download.
- `/settings` — placeholder while shift, account, and audit settings are built.

Payroll amounts are calculated from confirmed attendance and the stored daily salary snapshots.
