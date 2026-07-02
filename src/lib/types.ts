export type Role = "admin" | "bidder" | "caller" | "supportor";

export type PermissionKey =
  | "view_dashboard"
  | "view_job_application"
  | "view_interview"
  | "view_chat"
  | "view_profile"
  | "view_profiles"
  | "view_admin"
  | "manage_permissions"
  | "manage_users";

export type PermissionMatrix = Record<Role, PermissionKey[]>;

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

export type ManagedUser = SessionUser & {
  password: string;
  sessions: ManagedSession[];
  bidderAppliedRate: number;
  bidderFailedRate: number;
  callerHourlyRate: number;
};

export type ManagedSession = {
  id: string;
  ipAddress: string;
  deviceInfo: string;
  createdAt: string;
  expiresAt: string;
};

export type PersonalProfile = {
  id: string;
  fullName: string;
  email: string;
  dob: string;
  address: string;
  phoneNumber: string;
  linkedinUrl: string;
};

export type ProfileAssignmentMap = Record<string, string[]>;

export type Platform = "Linkedin" | "Indeed" | "Jobright" | "Dice";

export type Stack =
  | ""
  | "Python"
  | "Java"
  | "Data"
  | "Ruby"
  | "Rust/Scala"
  | "C#"
  | "PHP/Laravel"
  | "Node.js"
  | "Go/Golang";

export type ApplicationStatus = "" | "Applied" | "Failed";

export type InterviewStatus =
  | "Scheduled"
  | "Confirmed"
  | "Done"
  | "Cancelled";

export type InterviewEvent = {
  id: string;
  ownerUserId: string;
  title: string;
  bidderUserId: string;
  callerUserId: string;
  color: string;
  meetingLink: string;
  resumeLink: string;
  docLink: string;
  step: number;
  scheduledDate: string;
  scheduledTime: string;
  durationMinutes: number;
  status: InterviewStatus;
  notes: string;
};

export type IcsCalendarSource = {
  id: string;
  name: string;
  url: string;
  color: string;
  ownerUserId?: string;
  ownerName?: string;
};

export type ImportedCalendarEvent = {
  id: string;
  sourceId: string;
  sourceName: string;
  ownerUserId?: string;
  ownerName?: string;
  callerUserId?: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  color: string;
  meetingLink?: string;
  resumeLink?: string;
  docLink?: string;
  step?: number;
  notes?: string;
};

export type ImportedCalendarEventOverride = {
  userId?: string;
  id: string;
  title: string;
  start: string;
  end: string;
  hasLocalTitleOverride?: boolean;
  hasLocalScheduleOverride?: boolean;
  callerUserId: string;
  meetingLink: string;
  resumeLink: string;
  docLink: string;
  step: number;
  notes: string;
};

export type JobApplication = {
  id: number;
  platform: Platform;
  company: string;
  description: string;
  url: string;
  stack: Stack;
  status: ApplicationStatus;
};

export type JobApplicationTables = Record<
  string,
  Record<string, JobApplication[]>
>;

export type SalarySettings = {
  bidders: Array<{
    userId: string;
    name: string;
    email: string;
    bidderAppliedRate: number;
    bidderFailedRate: number;
  }>;
  callers: Array<{
    userId: string;
    name: string;
    email: string;
    callerHourlyRate: number;
  }>;
};

export type FinanceTransaction = {
  id: string;
  to: string;
  amount: number;
  date: string;
  note: string;
  createdAt: string;
};
