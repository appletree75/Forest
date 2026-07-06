import { ensureDatabaseConnected } from "@/lib/database";
import { applyImportedEventOverrides, importIcsEventsForSources } from "@/lib/ics-calendar";
import { getAllIcsCalendarSources } from "@/lib/ics-calendar-storage";
import { getAllIcsEventOverrides } from "@/lib/ics-event-overrides-storage";
import { getInterviewEvents } from "@/lib/interview-storage";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/lib/types";

type PeriodKey = "today" | "week" | "month" | "total";
type InterviewPeriodKey = "today" | "week" | "month" | "total";

export type PeriodApplicationStats = {
  label: string;
  totalUrls: number;
  appliedUrls: number;
  failedUrls: number;
};

export type CallerInterviewStat = {
  id: string;
  name: string;
  email: string;
  count: number;
};

export type InterviewPeriodStats = {
  label: string;
  totalInterviews: number;
  callers: CallerInterviewStat[];
};

export type DashboardStats = {
  periods: Record<PeriodKey, PeriodApplicationStats>;
  interviewPeriods: Record<InterviewPeriodKey, InterviewPeriodStats>;
  databaseAvailable: boolean;
};

export async function getDashboardStats(options?: {
  visibleProfileIds?: string[];
  currentUserId?: string;
  currentUserRole?: Role;
}): Promise<DashboardStats> {
  const now = new Date();
  const todayKey = toDayKey(now);
  const weekStartKey = toDayKey(getStartOfWeekUtc(now));
  const monthStartKey = toDayKey(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
  );

  try {
    await ensureDatabaseConnected();

    const [rows, callers, interviewEvents, icsCalendarSources, icsEventOverrides] = await Promise.all([
      prisma.jobApplicationRow.findMany({
        select: {
          profileId: true,
          dayKey: true,
          url: true,
          status: true,
        },
      }),
      prisma.user.findMany({
        where: { role: "caller" },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          email: true,
        },
      }),
      getInterviewEvents(),
      getAllIcsCalendarSources(),
      getAllIcsEventOverrides(),
    ]);

    const visibleProfileIdSet = options?.visibleProfileIds?.length
      ? new Set(options.visibleProfileIds)
      : null;
    const scopedRows = visibleProfileIdSet
      ? rows.filter((row) => visibleProfileIdSet.has(row.profileId))
      : rows;

    const applicationPeriodFilters: Record<PeriodKey, (dayKey: string) => boolean> = {
      today: (dayKey) => dayKey === todayKey,
      week: (dayKey) => dayKey >= weekStartKey,
      month: (dayKey) => dayKey >= monthStartKey,
      total: () => true,
    };

    const periods = (Object.keys(applicationPeriodFilters) as PeriodKey[]).reduce<
      Record<PeriodKey, PeriodApplicationStats>
    >((acc, key) => {
      const filteredRows = scopedRows.filter(
        (row) => row.url.trim() !== "" && applicationPeriodFilters[key](row.dayKey),
      );

      acc[key] = {
        label: periodLabel(key),
        totalUrls: filteredRows.length,
        appliedUrls: filteredRows.filter((row) => row.status === "Applied").length,
        failedUrls: filteredRows.filter((row) => row.status === "Failed").length,
      };

      return acc;
    }, {} as Record<PeriodKey, PeriodApplicationStats>);

    const importedCalendarEvents = applyImportedEventOverrides(
      await importIcsEventsForSources(icsCalendarSources),
      icsEventOverrides,
    );

    const normalizedInterviewEvents = interviewEvents.map((event) => ({
      dayKey: event.scheduledDate,
      callerUserId: event.callerUserId,
    }));
    const normalizedImportedEvents = importedCalendarEvents.map((event) => ({
      dayKey: new Date(event.start).toISOString().slice(0, 10),
      callerUserId: event.callerUserId ?? "",
    }));
    const allInterviewEvents = [
      ...normalizedInterviewEvents,
      ...normalizedImportedEvents,
    ];

    const visibleInterviewEvents =
      options?.currentUserRole === "caller" && options.currentUserId
        ? allInterviewEvents.filter(
            (event) => event.callerUserId === options.currentUserId,
          )
        : allInterviewEvents;

    const scopedCallers =
      options?.currentUserRole === "caller" && options.currentUserId
        ? callers.filter((caller) => caller.id === options.currentUserId)
        : callers;

    const interviewPeriodFilters: Record<InterviewPeriodKey, (dayKey: string) => boolean> = {
      today: (dayKey) => dayKey === todayKey,
      week: (dayKey) => dayKey >= weekStartKey,
      month: (dayKey) => dayKey >= monthStartKey,
      total: () => true,
    };

    const interviewPeriods = (Object.keys(interviewPeriodFilters) as InterviewPeriodKey[]).reduce<
      Record<InterviewPeriodKey, InterviewPeriodStats>
    >((acc, key) => {
      const filteredEvents = visibleInterviewEvents.filter((event) =>
        interviewPeriodFilters[key](event.dayKey),
      );

      acc[key] = {
        label: periodLabel(key),
        totalInterviews: filteredEvents.length,
        callers: scopedCallers.map((caller) => ({
          id: caller.id,
          name: caller.name,
          email: caller.email,
          count: filteredEvents.filter((event) => event.callerUserId === caller.id).length,
        })),
      };

      return acc;
    }, {} as Record<InterviewPeriodKey, InterviewPeriodStats>);

    return {
      periods,
      interviewPeriods,
      databaseAvailable: true,
    };
  } catch (error) {
    console.error("Dashboard stats fallback due to database error.", error);
    return createEmptyDashboardStats();
  }
}

function toDayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getStartOfWeekUtc(date: Date) {
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + diff),
  );
}

function periodLabel(key: PeriodKey | InterviewPeriodKey) {
  if (key === "today") {
    return "Today";
  }

  if (key === "week") {
    return "This Week";
  }

  if (key === "month") {
    return "This Month";
  }

  return "Total";
}

function createEmptyDashboardStats(): DashboardStats {
  return {
    periods: {
      today: { label: "Today", totalUrls: 0, appliedUrls: 0, failedUrls: 0 },
      week: { label: "This Week", totalUrls: 0, appliedUrls: 0, failedUrls: 0 },
      month: { label: "This Month", totalUrls: 0, appliedUrls: 0, failedUrls: 0 },
      total: { label: "Total", totalUrls: 0, appliedUrls: 0, failedUrls: 0 },
    },
    interviewPeriods: {
      today: { label: "Today", totalInterviews: 0, callers: [] },
      week: { label: "This Week", totalInterviews: 0, callers: [] },
      month: { label: "This Month", totalInterviews: 0, callers: [] },
      total: { label: "Total", totalInterviews: 0, callers: [] },
    },
    databaseAvailable: false,
  };
}
