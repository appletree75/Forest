import { InterviewCalendar } from "@/components/interview/interview-calendar";
import { getSessionUser } from "@/lib/auth";
import {
  getAllIcsEventOverrides,
  getIcsEventOverrides,
} from "@/lib/ics-event-overrides-storage";
import {
  getAllGoogleCalendarConnections,
  getGoogleCalendarConnections,
} from "@/lib/google-calendar-storage";
import { applyImportedEventOverrides, importIcsEventsForSources } from "@/lib/ics-calendar";
import {
  getAllIcsCalendarSources,
  getIcsCalendarSources,
} from "@/lib/ics-calendar-storage";
import { getInterviewEvents } from "@/lib/interview-storage";
import { getUsersBasic } from "@/lib/user-storage";

export default async function InterviewPage() {
  const sessionUser = await getSessionUser();
  const canManageAllSyncedCalendars =
    sessionUser?.role === "supportor" || sessionUser?.role === "admin";
  const canViewAllSyncedCalendars =
    canManageAllSyncedCalendars || sessionUser?.role === "caller";

  const [events, users, googleCalendarConnections, icsCalendarSources, icsEventOverrides] = await Promise.all([
    getInterviewEvents(),
    getUsersBasic(),
    sessionUser
      ? canViewAllSyncedCalendars
        ? getAllGoogleCalendarConnections()
        : getGoogleCalendarConnections(sessionUser.id)
      : Promise.resolve([]),
    sessionUser
      ? canViewAllSyncedCalendars
        ? getAllIcsCalendarSources()
        : getIcsCalendarSources(sessionUser.id)
      : Promise.resolve([]),
    sessionUser
      ? canViewAllSyncedCalendars
        ? getAllIcsEventOverrides()
        : getIcsEventOverrides(sessionUser.id)
      : Promise.resolve([]),
  ]);
  const bidders = users.filter((user) => user.role === "bidder");
  const callers = users.filter((user) => user.role === "caller");
  const userNameById = new Map(users.map((user) => [user.id, user.name]));
  const normalizedIcsCalendarSources = icsCalendarSources.map((source) => ({
    ...source,
    ownerName:
      source.ownerUserId && source.ownerUserId !== sessionUser?.id
        ? userNameById.get(source.ownerUserId) ?? source.name
        : sessionUser?.name ?? source.name,
  }));
  const importedCalendarEvents = applyImportedEventOverrides(
    await importIcsEventsForSources(normalizedIcsCalendarSources),
    icsEventOverrides,
  );
  const visibleImportedCalendarEvents =
    sessionUser?.role === "caller"
      ? importedCalendarEvents.filter((event) => event.callerUserId === sessionUser.id)
      : importedCalendarEvents;
  const visibleEvents =
    sessionUser?.role === "caller"
      ? events.filter((event) => event.callerUserId === sessionUser.id)
      : events;

  return (
    <InterviewCalendar
      initialEvents={visibleEvents}
      bidders={bidders}
      callers={callers}
      knownUsers={users.map((user) => ({ id: user.id, name: user.name }))}
      googleCalendarConnections={googleCalendarConnections.map((connection) => ({
        id: connection.id,
        email: connection.email,
        ownerUserId: connection.userId,
        ownerName: userNameById.get(connection.userId) ?? connection.email,
      }))}
      icsCalendarSources={normalizedIcsCalendarSources}
      importedCalendarEvents={visibleImportedCalendarEvents}
      currentUserId={sessionUser?.id ?? ""}
      currentUserRole={sessionUser?.role ?? null}
    />
  );
}
