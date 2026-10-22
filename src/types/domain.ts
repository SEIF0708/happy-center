export type Locale = "tr" | "ar";

export type EmploymentStatus = "active" | "inactive";
export type ShiftInstanceStatus = "scheduled" | "open" | "submitted" | "closed";
export type AttendanceStatus = "present" | "absent";

export type Supervisor = {
  id: string;
  auth_user_id: string;
  display_name: string;
};

export type Shift = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  attendance_window_minutes: number;
  timezone: string;
  is_active: boolean;
};

export type Worker = {
  id: string;
  worker_code: string;
  full_name: string;
  photo_path: string | null;
  shift_id: string;
  daily_salary_kurus: number;
  employment_status: EmploymentStatus;
  created_at: string;
  updated_at: string;
  deactivated_at: string | null;
  photo_url?: string | null;
  shift?: Shift | null;
};

export type ShiftInstance = {
  id: string;
  shift_id: string;
  business_date: string;
  starts_at: string;
  ends_at: string;
  attendance_deadline_at: string;
  status: ShiftInstanceStatus;
  submitted_at: string | null;
  submitted_by: string | null;
  created_at: string;
  shift?: Shift | null;
};

export type AttendanceRecord = {
  id: string;
  shift_instance_id: string;
  worker_id: string;
  status: AttendanceStatus;
  daily_salary_kurus_snapshot: number;
  marked_at: string;
  marked_by: string;
  submitted_at: string | null;
  submitted_by: string | null;
};

export type AuditEvent = {
  id: string;
  actor_id: string | null;
  event_type: string;
  entity_type: string;
  entity_id: string | null;
  event_details: Record<string, unknown>;
  created_at: string;
};

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; details?: Record<string, unknown> };
