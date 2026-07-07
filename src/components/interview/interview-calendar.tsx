"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import luxon3Plugin from "@fullcalendar/luxon3";
import timeGridPlugin from "@fullcalendar/timegrid";
import type {
  DateSelectArg,
  DatesSetArg,
  EventClickArg,
  EventContentArg,
  EventDropArg,
  EventInput,
} from "@fullcalendar/core";
import type {
  DateClickArg,
  EventResizeDoneArg,
} from "@fullcalendar/interaction";

import type {
  IcsCalendarSource,
  ImportedCalendarEvent,
  ImportedCalendarEventOverride,
  InterviewEvent,
  InterviewStatus,
  ManagedUser,
} from "@/lib/types";
import { extractMeetingLinkFromText } from "@/lib/meeting-link";

const CALENDAR_SETTINGS_KEY = "forest-interview-calendar-settings";
const ICS_SOURCE_PREFERENCES_KEY = "forest-interview-ics-source-preferences";
const SYNCED_OWNER_PREFERENCES_KEY = "forest-interview-synced-owner-preferences";

const timezoneOptions = [
  { label: "Local", timeZone: "local" },
  { label: "JST", timeZone: "Asia/Tokyo" },
  { label: "CET", timeZone: "Europe/Paris" },
  { label: "CST", timeZone: "America/Chicago" },
  { label: "EST", timeZone: "America/New_York" },
  { label: "PST", timeZone: "America/Los_Angeles" },
  { label: "GMT", timeZone: "Etc/UTC" },
] as const;

const statusStyles: Record<
  InterviewStatus,
  {
    badge: string;
    eventClass: string;
  }
> = {
  Scheduled: {
    badge: "border-amber-200 bg-amber-50 text-amber-800",
    eventClass: "forest-event-scheduled",
  },
  Confirmed: {
    badge: "border-sky-200 bg-sky-50 text-sky-800",
    eventClass: "forest-event-confirmed",
  },
  Done: {
    badge: "border-emerald-200 bg-emerald-50 text-emerald-800",
    eventClass: "forest-event-done",
  },
  Cancelled: {
    badge: "border-rose-200 bg-rose-50 text-rose-800",
    eventClass: "forest-event-cancelled",
  },
};

type InterviewCalendarProps = {
  initialEvents: InterviewEvent[];
  bidders: ManagedUser[];
  callers: ManagedUser[];
  knownUsers: Array<{
    id: string;
    name: string;
  }>;
  googleCalendarConnections: Array<{
    id: string;
    email: string;
    ownerUserId?: string;
    ownerName?: string;
  }>;
  icsCalendarSources: IcsCalendarSource[];
  importedCalendarEvents: ImportedCalendarEvent[];
  currentUserId: string;
  currentUserRole: "admin" | "bidder" | "caller" | "supportor" | null;
};

type CalendarSettings = {
  calendarTimezoneLabel: string;
  comparisonTimezoneLabels: string[];
};

type IcsSourcePreferences = Record<
  string,
  {
    visible: boolean;
    color: string;
  }
>;

type SyncedOwnerPreferences = Record<
  string,
  {
    visible: boolean;
    color: string;
  }
>;

const defaultCalendarSettings: CalendarSettings = {
  calendarTimezoneLabel: "CET",
  comparisonTimezoneLabels: ["EST"],
};

const statusDefaultColors: Record<InterviewStatus, string> = {
  Scheduled: "#ffd86f",
  Confirmed: "#7dd3fc",
  Done: "#86efac",
  Cancelled: "#fda4af",
};

const emptyDraft = (
  date: string,
  time = "09:00",
): Omit<InterviewEvent, "id"> => ({
  ownerUserId: "",
  title: "",
  bidderUserId: "",
  callerUserId: "",
  color: statusDefaultColors.Scheduled,
  meetingLink: "",
  jdLink: "",
  resumeLink: "",
  docLink: "",
  step: 1,
  scheduledDate: date,
  scheduledTime: time,
  durationMinutes: 60,
  status: "Scheduled",
  notes: "",
});

const emptyImportedDraft = (
  event: ImportedCalendarEvent,
): ImportedCalendarEventOverride => ({
  id: event.id,
  title: event.title,
  start: event.start,
  end: event.end,
  color: event.color,
  callerUserId: event.callerUserId ?? "",
  meetingLink: event.meetingLink ?? "",
  jdLink: event.jdLink ?? "",
  resumeLink: event.resumeLink ?? "",
  docLink: event.docLink ?? "",
  step: event.step ?? 1,
  notes: event.notes ?? "",
});

export function InterviewCalendar({
  initialEvents,
  bidders,
  callers,
  knownUsers,
  googleCalendarConnections,
  icsCalendarSources,
  importedCalendarEvents,
  currentUserId,
  currentUserRole,
}: InterviewCalendarProps) {
  const router = useRouter();
  const canManageAllSyncedCalendars =
    currentUserRole === "supportor" || currentUserRole === "admin";
  const [isRefreshing, startRefreshTransition] = useTransition();
  const calendarRef = useRef<FullCalendar | null>(null);
  const calendarShellRef = useRef<HTMLDivElement | null>(null);
  const now = new Date();
  const [events, setEvents] = useState(initialEvents);
  const [importedEvents, setImportedEvents] = useState(importedCalendarEvents);
  const [draft, setDraft] = useState<Omit<InterviewEvent, "id">>(
    emptyDraft(toDateKey(now)),
  );
  const [editingId, setEditingId] = useState("");
  const [editingImportedId, setEditingImportedId] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [isLocalModalReadOnly, setIsLocalModalReadOnly] = useState(false);
  const [importedModalOpen, setImportedModalOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [selectedDate, setSelectedDate] = useState(toDateKey(now));
  const [selectedView, setSelectedView] = useState("timeGridWeek");
  const [currentRangeLabel, setCurrentRangeLabel] = useState("");
  const [icsModalOpen, setIcsModalOpen] = useState(false);
  const [isToolsSidebarOpen, setIsToolsSidebarOpen] = useState(false);
  const [removingIcsSourceId, setRemovingIcsSourceId] = useState("");
  const [addingIcsCalendar, setAddingIcsCalendar] = useState(false);
  const [calendarTimezoneLabel, setCalendarTimezoneLabel] = useState(
    defaultCalendarSettings.calendarTimezoneLabel,
  );
  const [selectedTimezoneLabel, setSelectedTimezoneLabel] = useState("CET");
  const [comparisonTimezoneLabels, setComparisonTimezoneLabels] = useState<
    string[]
  >(defaultCalendarSettings.comparisonTimezoneLabels);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [hasLoadedCalendarSettings, setHasLoadedCalendarSettings] = useState(false);
  const [timeGridMetrics, setTimeGridMetrics] = useState({
    headerHeight: 58,
    slotHeight: 5,
  });
  const [icsName, setIcsName] = useState("");
  const [icsUrl, setIcsUrl] = useState("");
  const [icsColor, setIcsColor] = useState("#7c9b7b");
  const [icsSourcePreferences, setIcsSourcePreferences] = useState<IcsSourcePreferences>({});
  const [syncedOwnerPreferences, setSyncedOwnerPreferences] = useState<SyncedOwnerPreferences>(
    {},
  );
  const [importedDraft, setImportedDraft] = useState<ImportedCalendarEventOverride | null>(
    null,
  );
  const [isImportedModalReadOnly, setIsImportedModalReadOnly] = useState(false);
  const [originalImportedEvent, setOriginalImportedEvent] = useState<ImportedCalendarEvent | null>(
    null,
  );
  const autoRefreshBlocked =
    pending || modalOpen || importedModalOpen || icsModalOpen || addingIcsCalendar;

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setEvents(initialEvents);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [initialEvents]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setImportedEvents(importedCalendarEvents);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [importedCalendarEvents]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const storedSettings = getStoredCalendarSettings();
      setCalendarTimezoneLabel(storedSettings.calendarTimezoneLabel);
      setComparisonTimezoneLabels(storedSettings.comparisonTimezoneLabels);
      setIcsSourcePreferences(getStoredIcsSourcePreferences());
      setSyncedOwnerPreferences(getStoredSyncedOwnerPreferences());
      setHasLoadedCalendarSettings(true);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (autoRefreshBlocked) {
      return;
    }

    const refresh = () => {
      startRefreshTransition(() => {
        router.refresh();
      });
    };

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    }, 30000);

    const handleFocus = () => refresh();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [autoRefreshBlocked, router, startRefreshTransition]);

  useEffect(() => {
    if (!hasLoadedCalendarSettings) {
      return;
    }

    const payload: CalendarSettings = {
      calendarTimezoneLabel,
      comparisonTimezoneLabels,
    };

    window.localStorage.setItem(CALENDAR_SETTINGS_KEY, JSON.stringify(payload));
  }, [calendarTimezoneLabel, comparisonTimezoneLabels, hasLoadedCalendarSettings]);

  useEffect(() => {
    if (!hasLoadedCalendarSettings) {
      return;
    }

    window.localStorage.setItem(
      ICS_SOURCE_PREFERENCES_KEY,
      JSON.stringify(icsSourcePreferences),
    );
  }, [hasLoadedCalendarSettings, icsSourcePreferences]);

  useEffect(() => {
    if (!hasLoadedCalendarSettings) {
      return;
    }

    window.localStorage.setItem(
      SYNCED_OWNER_PREFERENCES_KEY,
      JSON.stringify(syncedOwnerPreferences),
    );
  }, [hasLoadedCalendarSettings, syncedOwnerPreferences]);

  const comparisonTimezones = comparisonTimezoneLabels
    .map((label) => timezoneOptions.find((option) => option.label === label))
    .filter((option) => option !== undefined);

  const calendarTimeZone =
    timezoneOptions.find((option) => option.label === calendarTimezoneLabel)
      ?.timeZone ?? "local";
  const isTimeGridView = selectedView === "timeGridWeek" || selectedView === "timeGridDay";

  useEffect(() => {
    if (!isTimeGridView) {
      return;
    }

    const measure = () => {
      const shell = calendarShellRef.current;

      if (!shell) {
        return;
      }

      const header = shell.querySelector(".fc-col-header") as HTMLElement | null;
      const slot = shell.querySelector(".fc-timegrid-slot") as HTMLElement | null;

      if (!header || !slot) {
        return;
      }

      const nextHeaderHeight = Math.round(header.getBoundingClientRect().height);
      const nextSlotHeight = Math.round(slot.getBoundingClientRect().height);

      setTimeGridMetrics((current) =>
        current.headerHeight === nextHeaderHeight &&
        current.slotHeight === nextSlotHeight
          ? current
          : {
              headerHeight: nextHeaderHeight,
              slotHeight: nextSlotHeight,
            },
      );
    };

    const animationFrameId = window.requestAnimationFrame(measure);
    const resizeObserver = new ResizeObserver(() => measure());

    if (calendarShellRef.current) {
      resizeObserver.observe(calendarShellRef.current);
    }

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
    };
  }, [isTimeGridView, selectedView, currentRangeLabel, calendarTimezoneLabel]);

  const timezoneColumns = [
    ...comparisonTimezones,
    {
      label: calendarTimezoneLabel,
      timeZone: calendarTimeZone,
    },
  ].filter(
    (option, index, array) =>
      array.findIndex((candidate) => candidate.label === option.label) === index,
  );

  const effectiveIcsSourcePreferences = useMemo(
    () =>
      Object.fromEntries(
        icsCalendarSources.map((source) => [
          source.id,
          icsSourcePreferences[source.id] ?? {
            visible: true,
            color: source.color,
          },
        ]),
      ) as IcsSourcePreferences,
    [icsCalendarSources, icsSourcePreferences],
  );
  const ownIcsCalendarSources = useMemo(
    () =>
      icsCalendarSources.filter(
        (source) => !source.ownerUserId || source.ownerUserId === currentUserId,
      ),
    [currentUserId, icsCalendarSources],
  );
  const syncedOwnerGroups = useMemo(() => {
    if (!canManageAllSyncedCalendars) {
      return [];
    }

    const groups = new Map<
      string,
      {
        ownerUserId: string;
        ownerName: string;
        icsSourceCount: number;
        googleConnectionCount: number;
        localEventCount: number;
      }
    >();

    for (const source of icsCalendarSources) {
      if (!source.ownerUserId || source.ownerUserId === currentUserId) {
        continue;
      }

      const current =
        groups.get(source.ownerUserId) ?? {
          ownerUserId: source.ownerUserId,
          ownerName: source.ownerName ?? source.name,
          icsSourceCount: 0,
          googleConnectionCount: 0,
          localEventCount: 0,
        };
      current.icsSourceCount += 1;
      groups.set(source.ownerUserId, current);
    }

    for (const connection of googleCalendarConnections) {
      if (!connection.ownerUserId || connection.ownerUserId === currentUserId) {
        continue;
      }

      const current =
        groups.get(connection.ownerUserId) ?? {
          ownerUserId: connection.ownerUserId,
          ownerName: connection.ownerName ?? connection.email,
          icsSourceCount: 0,
          googleConnectionCount: 0,
          localEventCount: 0,
        };
      current.googleConnectionCount += 1;
      groups.set(connection.ownerUserId, current);
    }

    for (const event of events) {
      if (!event.ownerUserId || event.ownerUserId === currentUserId) {
        continue;
      }

      const current =
        groups.get(event.ownerUserId) ?? {
          ownerUserId: event.ownerUserId,
          ownerName:
            knownUsers.find((user) => user.id === event.ownerUserId)?.name ?? "Unknown user",
          icsSourceCount: 0,
          googleConnectionCount: 0,
          localEventCount: 0,
        };
      current.localEventCount += 1;
      groups.set(event.ownerUserId, current);
    }

    return Array.from(groups.values()).sort((a, b) =>
      a.ownerName.localeCompare(b.ownerName),
    );
  }, [
    canManageAllSyncedCalendars,
    currentUserId,
    events,
    googleCalendarConnections,
    icsCalendarSources,
    knownUsers,
  ]);
  const effectiveSyncedOwnerPreferences = useMemo(
    () =>
      Object.fromEntries(
        syncedOwnerGroups.map((owner) => {
          const sourceDefaultColor =
            icsCalendarSources.find((source) => source.ownerUserId === owner.ownerUserId)?.color ??
            events.find((event) => event.ownerUserId === owner.ownerUserId)?.color ??
            "#5aa9e6";

          return [
            owner.ownerUserId,
            syncedOwnerPreferences[owner.ownerUserId] ?? {
              visible: true,
              color: sourceDefaultColor,
            },
          ];
        }),
      ) as SyncedOwnerPreferences,
    [events, icsCalendarSources, syncedOwnerGroups, syncedOwnerPreferences],
  );
  const slotsPerHour = 2;
  const hourBandHeight = timeGridMetrics.slotHeight * slotsPerHour;
  const timezoneSlotRows = Array.from({ length: 24 * slotsPerHour }, (_, slotIndex) => {
    const hour = Math.floor(slotIndex / slotsPerHour);
    const rowInstant = getInstantForTimeZoneHour(now, hour, calendarTimeZone);

    return {
      slotIndex,
      showLabel: slotIndex % slotsPerHour === 0,
      labels: timezoneColumns.map((option) => ({
        label: option.label,
        value: formatHourInTimezone(rowInstant, option.timeZone),
      })),
    };
  });

  const calendarEvents = useMemo<EventInput[]>(
    () => {
      const localEvents: EventInput[] = events.flatMap((event) => {
          const canEditLocalEvent =
            !event.ownerUserId || event.ownerUserId === currentUserId;
          const isForeignOwner =
            canManageAllSyncedCalendars &&
            Boolean(event.ownerUserId) &&
            event.ownerUserId !== currentUserId;
          const ownerPreference =
            isForeignOwner && event.ownerUserId
              ? effectiveSyncedOwnerPreferences[event.ownerUserId]
              : null;
          const visible = ownerPreference?.visible ?? true;
          const displayColor = ownerPreference?.color ?? event.color;

          if (!visible) {
            return [];
          }

          return [{
            editable: canEditLocalEvent,
            id: event.id,
            title: event.title,
            start: new Date(combineDateTime(event.scheduledDate, event.scheduledTime)),
            end: addMinutesToDateTime(
              event.scheduledDate,
              event.scheduledTime,
              event.durationMinutes,
            ),
            classNames: [
              displayColor
                ? "forest-event-local-colored"
                : statusStyles[event.status].eventClass,
              canEditLocalEvent ? "" : "forest-event-readonly",
            ],
            extendedProps: {
              rawEvent: event,
              callerName: getUserName(callers, event.callerUserId),
              bidderName: getUserName(bidders, event.bidderUserId),
              ownerUserId: event.ownerUserId,
              canEditLocalEvent,
              color: displayColor,
              step: event.step,
              isImported: false,
            },
          }];
        });

      const syncedEvents: EventInput[] = importedEvents.flatMap((event) => {
          const canEditImportedEvent =
            !event.ownerUserId || event.ownerUserId === currentUserId;
          const isForeignOwner =
            canManageAllSyncedCalendars &&
            Boolean(event.ownerUserId) &&
            event.ownerUserId !== currentUserId;
          const ownerPreference =
            isForeignOwner && event.ownerUserId
              ? effectiveSyncedOwnerPreferences[event.ownerUserId]
              : null;
          const sourcePreference = effectiveIcsSourcePreferences[event.sourceId];
          const preference = ownerPreference
            ? ownerPreference
            : {
                visible: sourcePreference?.visible ?? true,
                color: event.color,
              };

          if (!preference.visible) {
            return [];
          }

          return [{
            id: `imported:${event.id}`,
            title: event.title,
            start: event.start,
            end: event.end,
            allDay: event.allDay,
            editable: canEditImportedEvent,
            overlap: false,
            classNames: [
              "forest-event-imported",
              canEditImportedEvent ? "" : "forest-event-readonly",
            ],
            backgroundColor: preference.color,
            borderColor: preference.color,
            extendedProps: {
              sourceId: event.sourceId,
              sourceName: event.sourceName,
              ownerUserId: event.ownerUserId,
              ownerName: event.ownerName,
              callerName: getUserName(callers, event.callerUserId ?? ""),
              isImported: true,
              canEditImportedEvent,
              color: preference.color,
              step: event.step ?? 1,
            },
          }];
        });

      return [
        ...localEvents,
        ...syncedEvents,
      ];
    },
    [
      bidders,
      canManageAllSyncedCalendars,
      callers,
      currentUserId,
      events,
      importedEvents,
      effectiveIcsSourcePreferences,
      effectiveSyncedOwnerPreferences,
    ],
  );

  const openCreateModal = (date: string, time = "09:00") => {
    setDraft(emptyDraft(date, time));
    setEditingId("");
    setIsLocalModalReadOnly(false);
    setModalOpen(true);
  };

  const openEditModal = (event: InterviewEvent, options?: { readOnly?: boolean }) => {
    const { id: _, ...nextDraft } = event;
    void _;
    setDraft(nextDraft);
    setEditingId(event.id);
    setIsLocalModalReadOnly(Boolean(options?.readOnly));
    setModalOpen(true);
  };

  const openImportedEditModal = (
    event: ImportedCalendarEvent,
    options?: { readOnly?: boolean },
  ) => {
    setOriginalImportedEvent(event);
    setImportedDraft(emptyImportedDraft(event));
    setEditingImportedId(event.id);
    setIsImportedModalReadOnly(Boolean(options?.readOnly));
    setImportedModalOpen(true);
  };

  const saveEvent = async () => {
    setPending(true);

    try {
      const method = editingId ? "PUT" : "POST";
      const body = editingId ? { id: editingId, ...draft } : draft;
      const response = await fetch("/api/interviews", {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { event?: InterviewEvent };

      if (!response.ok || !payload.event) {
        return;
      }

      setEvents((current) =>
        editingId
          ? current
              .map((event) => (event.id === editingId ? payload.event! : event))
              .sort(compareEvents)
          : [...current, payload.event!].sort(compareEvents),
      );
      setSelectedDate(payload.event.scheduledDate);
      setModalOpen(false);
      setEditingId("");
    } finally {
      setPending(false);
    }
  };

  const removeEvent = async () => {
    if (!editingId) {
      return;
    }

    if (!window.confirm("Delete this interview event?")) {
      return;
    }

    setPending(true);

    try {
      const response = await fetch("/api/interviews", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: editingId }),
      });

      if (!response.ok) {
        return;
      }

      setEvents((current) => current.filter((event) => event.id !== editingId));
      setModalOpen(false);
      setEditingId("");
    } finally {
      setPending(false);
    }
  };

  const saveImportedEvent = async () => {
    if (!importedDraft || !originalImportedEvent) {
      return;
    }

    const hasLocalTitleOverride = importedDraft.title !== originalImportedEvent.title;
    const hasLocalScheduleOverride =
      importedDraft.start !== originalImportedEvent.start ||
      importedDraft.end !== originalImportedEvent.end;

    setPending(true);

    try {
      const response = await fetch("/api/ics-calendars/events", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...importedDraft,
          hasLocalTitleOverride,
          hasLocalScheduleOverride,
        }),
      });

      if (!response.ok) {
        return;
      }

      setImportedEvents((current) =>
        current.map((event) =>
          event.id === importedDraft.id
            ? {
                ...event,
                title: hasLocalTitleOverride ? importedDraft.title : event.title,
                start: hasLocalScheduleOverride ? importedDraft.start : event.start,
                end: hasLocalScheduleOverride ? importedDraft.end : event.end,
                color: importedDraft.color,
                callerUserId: importedDraft.callerUserId,
                meetingLink: importedDraft.meetingLink,
                jdLink: importedDraft.jdLink,
                resumeLink: importedDraft.resumeLink,
                docLink: importedDraft.docLink,
                step: importedDraft.step,
                notes: importedDraft.notes,
              }
            : event,
        ),
      );
      setImportedModalOpen(false);
      setEditingImportedId("");
      setImportedDraft(null);
      setOriginalImportedEvent(null);
    } finally {
      setPending(false);
    }
  };

  const resetImportedEvent = async () => {
    if (!editingImportedId) {
      return;
    }

    if (!window.confirm("Reset this imported event back to the original calendar data?")) {
      return;
    }

    setPending(true);

    try {
      const response = await fetch("/api/ics-calendars/events", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: editingImportedId }),
      });

      if (!response.ok) {
        return;
      }

      const originalEvent = importedCalendarEvents.find(
        (event) => event.id === editingImportedId,
      );

      if (originalEvent) {
        setImportedEvents((current) =>
          current.map((event) =>
            event.id === editingImportedId ? originalEvent : event,
          ),
        );
      }

      setImportedModalOpen(false);
      setEditingImportedId("");
      setImportedDraft(null);
      setOriginalImportedEvent(null);
    } finally {
      setPending(false);
    }
  };

  const extractImportedMeetingLink = () => {
    if (!originalImportedEvent || isImportedModalReadOnly) {
      return;
    }

    const nextLink = extractMeetingLinkFromText(
      originalImportedEvent.title,
      originalImportedEvent.description,
      originalImportedEvent.location,
      originalImportedEvent.externalUrl,
      originalImportedEvent.htmlDescription,
      importedDraft?.notes,
    );

    if (!nextLink) {
      return;
    }

    setImportedDraft((current) =>
      current
        ? {
            ...current,
            meetingLink: nextLink,
          }
        : current,
    );
  };

  const moveCalendar = (direction: "prev" | "next" | "today") => {
    const api = calendarRef.current?.getApi();

    if (!api) {
      return;
    }

    if (direction === "prev") {
      api.prev();
      return;
    }

    if (direction === "next") {
      api.next();
      return;
    }

    api.today();
  };

  const changeView = (nextView: string) => {
    const api = calendarRef.current?.getApi();

    if (!api) {
      return;
    }

    api.changeView(nextView);
    setSelectedView(nextView);
  };

  const handleSelect = (selection: DateSelectArg) => {
    const dateKey = toDateKey(selection.start);
    setSelectedDate(dateKey);
    openCreateModal(
      dateKey,
      selection.allDay ? "09:00" : formatTimeInputValue(selection.start),
    );
  };

  const handleDateClick = (arg: DateClickArg) => {
    setSelectedDate(toDateKey(arg.date));
  };

  const handleEventClick = (arg: EventClickArg) => {
    const isImported = Boolean(arg.event.extendedProps.isImported);

    if (isImported) {
      const canEditImportedEvent = Boolean(
        arg.event.extendedProps.canEditImportedEvent,
      );

      const importedEvent = importedEvents.find(
        (event) => `imported:${event.id}` === arg.event.id,
      );

      if (importedEvent) {
        openImportedEditModal(importedEvent, {
          readOnly: !canEditImportedEvent,
        });
      }

      return;
    }

    const rawEvent = arg.event.extendedProps.rawEvent as InterviewEvent | undefined;
    const canEditLocalEvent = Boolean(arg.event.extendedProps.canEditLocalEvent);

    if (!rawEvent) {
      return;
    }

    setSelectedDate(rawEvent.scheduledDate);
    openEditModal(rawEvent, {
      readOnly: !canEditLocalEvent,
    });
  };

  const handleDatesSet = (arg: DatesSetArg) => {
    setSelectedView(arg.view.type);
    setCurrentRangeLabel(formatViewRange(arg.start, arg.end, arg.view.type));
  };

  const handleEventMove = async (
    arg: EventDropArg | EventResizeDoneArg,
  ) => {
    const isImported = Boolean(arg.event.extendedProps.isImported);

    if (isImported) {
      const canEditImportedEvent = Boolean(
        arg.event.extendedProps.canEditImportedEvent,
      );

      if (!canEditImportedEvent) {
        arg.revert();
        return;
      }

      const importedId = arg.event.id.replace(/^imported:/, "");
      const nextStart = arg.event.start;
      const nextEnd = arg.event.end;

      if (!importedId || !nextStart || !nextEnd) {
        arg.revert();
        return;
      }

      const currentImportedEvent = importedEvents.find(
        (event) => event.id === importedId,
      );

      try {
        const response = await fetch("/api/ics-calendars/events", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: importedId,
            title: arg.event.title,
            start: nextStart.toISOString(),
            end: nextEnd.toISOString(),
            hasLocalTitleOverride:
              currentImportedEvent ? arg.event.title !== currentImportedEvent.title : false,
            hasLocalScheduleOverride: true,
            callerUserId: currentImportedEvent?.callerUserId ?? "",
            color: currentImportedEvent?.color ?? "#7c9b7b",
            meetingLink: currentImportedEvent?.meetingLink ?? "",
            jdLink: currentImportedEvent?.jdLink ?? "",
            resumeLink: currentImportedEvent?.resumeLink ?? "",
            docLink: currentImportedEvent?.docLink ?? "",
            step: currentImportedEvent?.step ?? 1,
            notes: currentImportedEvent?.notes ?? "",
          }),
        });

        if (!response.ok) {
          arg.revert();
          return;
        }

        setImportedEvents((current) =>
          current.map((event) =>
            event.id === importedId
              ? {
                  ...event,
                  title: arg.event.title,
                  start: nextStart.toISOString(),
                  end: nextEnd.toISOString(),
                }
              : event,
          ),
        );
      } catch {
        arg.revert();
      }

      return;
    }

    const rawEvent = arg.event.extendedProps.rawEvent as InterviewEvent | undefined;
    const canEditLocalEvent = Boolean(arg.event.extendedProps.canEditLocalEvent);

    if (!rawEvent) {
      return;
    }

    if (!canEditLocalEvent) {
      arg.revert();
      return;
    }

    const nextStart = arg.event.start;
    const nextEnd = arg.event.end;

    if (!nextStart || !nextEnd) {
      arg.revert();
      return;
    }

    const nextEvent: InterviewEvent = {
      ...rawEvent,
      scheduledDate: toDateKey(nextStart),
      scheduledTime: formatTimeInputValue(nextStart),
      durationMinutes: Math.max(
        15,
        Math.round((nextEnd.getTime() - nextStart.getTime()) / 60000),
      ),
    };

    try {
      const response = await fetch("/api/interviews", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(nextEvent),
      });
      const payload = (await response.json()) as { event?: InterviewEvent };

      if (!response.ok || !payload.event) {
        arg.revert();
        return;
      }

      setEvents((current) =>
        current
          .map((event) => (event.id === payload.event!.id ? payload.event! : event))
          .sort(compareEvents),
      );
      setSelectedDate(payload.event.scheduledDate);
    } catch {
      arg.revert();
    }
  };

  const addComparisonTimezone = () => {
    if (
      selectedTimezoneLabel === "Local" ||
      comparisonTimezoneLabels.includes(selectedTimezoneLabel)
    ) {
      return;
    }

    setComparisonTimezoneLabels((current) => [...current, selectedTimezoneLabel]);
  };

  const removeComparisonTimezone = (label: string) => {
    setComparisonTimezoneLabels((current) =>
      current.filter((currentLabel) => currentLabel !== label),
    );
  };

  const addIcsCalendar = async () => {
    if (!icsName.trim() || !icsUrl.trim()) {
      return;
    }

    setAddingIcsCalendar(true);

    try {
      const response = await fetch("/api/ics-calendars", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: icsName,
          url: icsUrl,
          color: icsColor,
        }),
      });

      if (!response.ok) {
        return;
      }

      setIcsModalOpen(false);
      setIcsName("");
      setIcsUrl("");
      setIcsColor("#7c9b7b");
      window.location.reload();
    } finally {
      setAddingIcsCalendar(false);
    }
  };

  const removeIcsCalendar = async (sourceId: string, sourceName: string) => {
    if (!window.confirm(`Remove ICS calendar "${sourceName}"?`)) {
      return;
    }

    setRemovingIcsSourceId(sourceId);

    try {
      const response = await fetch("/api/ics-calendars", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sourceId }),
      });

      if (!response.ok) {
        return;
      }

      setIcsSourcePreferences((current) => {
        const next = { ...current };
        delete next[sourceId];
        return next;
      });
      window.location.reload();
    } finally {
      setRemovingIcsSourceId("");
    }
  };

  const toggleIcsSourceVisibility = (sourceId: string, fallbackColor: string) => {
    setIcsSourcePreferences((current) => {
      const preference = effectiveIcsSourcePreferences[sourceId] ?? {
        visible: true,
        color: fallbackColor,
      };

      return {
        ...current,
        [sourceId]: {
          ...preference,
          visible: !preference.visible,
        },
      };
    });
  };

  const updateIcsSourceColor = (sourceId: string, color: string) => {
    setIcsSourcePreferences((current) => {
      const preference = effectiveIcsSourcePreferences[sourceId] ?? {
        visible: true,
        color,
      };

      return {
        ...current,
        [sourceId]: {
          ...preference,
          color,
        },
      };
    });
  };

  const toggleSyncedOwnerVisibility = (ownerUserId: string, fallbackColor: string) => {
    setSyncedOwnerPreferences((current) => {
      const preference = effectiveSyncedOwnerPreferences[ownerUserId] ?? {
        visible: true,
        color: fallbackColor,
      };

      return {
        ...current,
        [ownerUserId]: {
          ...preference,
          visible: !preference.visible,
        },
      };
    });
  };

  const updateSyncedOwnerColor = (ownerUserId: string, color: string) => {
    setSyncedOwnerPreferences((current) => {
      const preference = effectiveSyncedOwnerPreferences[ownerUserId] ?? {
        visible: true,
        color,
      };

      return {
        ...current,
        [ownerUserId]: {
          ...preference,
          color,
        },
      };
    });
  };

  return (
    <>
      <div
        className={`forest-interview relative xl:grid xl:gap-5 ${
          isToolsSidebarOpen
            ? "xl:grid-cols-[minmax(0,1fr)_360px]"
            : "xl:grid-cols-[minmax(0,1fr)]"
        }`}
      >
        <section className="overflow-visible rounded-[32px] border border-[rgba(28,82,54,0.12)] bg-[linear-gradient(180deg,rgba(251,252,248,0.98),rgba(244,248,241,0.98))] shadow-[0_18px_56px_rgba(24,34,24,0.08)]">
          <div className="sticky top-4 z-30 border-b border-[rgba(28,82,54,0.1)] bg-[linear-gradient(135deg,rgba(30,82,52,0.96),rgba(60,104,74,0.92))] px-6 py-5 text-white shadow-[0_16px_36px_rgba(17,38,25,0.16)]">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <h2 className="text-2xl font-semibold">
                  {currentRangeLabel || "Interview schedule"}
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => moveCalendar("prev")}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/8 text-base font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all hover:bg-white/14"
                >
                  {"<"}
                </button>
                <button
                  type="button"
                  onClick={() => moveCalendar("today")}
                  className="h-11 rounded-full border border-white/15 bg-white/8 px-5 text-sm font-semibold tracking-[0.01em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all hover:bg-white/14"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => moveCalendar("next")}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/8 text-base font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all hover:bg-white/14"
                >
                  {">"}
                </button>
                <div className="inline-flex h-11 items-center rounded-full border border-white/15 bg-white/8 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                  {[
                    { label: "Month", value: "dayGridMonth" },
                    { label: "Week", value: "timeGridWeek" },
                    { label: "Day", value: "timeGridDay" },
                  ].map((view) => (
                    <button
                      key={view.value}
                      type="button"
                      onClick={() => changeView(view.value)}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition-all ${
                        selectedView === view.value
                          ? "bg-[color:var(--accent)] text-white shadow-[0_8px_18px_rgba(18,26,19,0.22)]"
                          : "text-white/72 hover:text-white"
                      }`}
                    >
                      {view.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    startRefreshTransition(() => {
                      router.refresh();
                    })
                  }
                  disabled={isRefreshing}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/8 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all hover:bg-white/14 disabled:opacity-60"
                  aria-label="Refresh interview calendar"
                  title={isRefreshing ? "Refreshing..." : "Refresh"}
                >
                  <RefreshIcon className={isRefreshing ? "animate-spin" : ""} />
                </button>
              </div>
            </div>
          </div>

          <div className="p-5">
            <div className="rounded-[28px] border border-[var(--border)] bg-white p-4">
              <div
                ref={calendarShellRef}
                className="forest-calendar-shell overflow-visible rounded-[24px] border border-[var(--border)]"
              >
                <div className={isTimeGridView ? "grid grid-cols-[auto_minmax(0,1fr)]" : ""}>
                  {isTimeGridView ? (
                    <div className="sticky left-0 z-20 self-start border-r border-[var(--border)] bg-white">
                      <div
                        className="sticky top-[104px] z-30 grid items-end border-b border-[var(--border)] bg-white px-3 pb-3 pt-4"
                        style={{
                          gridTemplateColumns: `repeat(${timezoneColumns.length}, minmax(0, 48px))`,
                          columnGap: "0px",
                          height: `${timeGridMetrics.headerHeight}px`,
                        }}
                      >
                        {timezoneColumns.map((option) => (
                          <div
                            key={option.label}
                            className="text-center text-[10px] font-semibold uppercase tracking-[0.24em] text-[#1f3426]"
                          >
                            {option.label}
                          </div>
                        ))}
                      </div>
                      <div
                        style={{
                          backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent calc(${hourBandHeight}px - 1px), rgba(198, 209, 198, 0.95) calc(${hourBandHeight}px - 1px), rgba(198, 209, 198, 0.95) ${hourBandHeight}px)`,
                        }}
                      >
                        {timezoneSlotRows.map((row) => (
                          <div
                            key={row.slotIndex}
                            className="grid px-2 text-[11px] font-medium text-[#33463a]"
                            style={{
                              gridTemplateColumns: `repeat(${row.labels.length}, minmax(0, 48px))`,
                              columnGap: "0px",
                              height: `${timeGridMetrics.slotHeight}px`,
                              boxSizing: "border-box",
                            }}
                          >
                            {row.labels.map((entry) => (
                              <div
                                key={`${row.slotIndex}-${entry.label}`}
                                className="relative h-full text-center"
                              >
                                {row.showLabel ? (
                                  <div className="absolute left-0 right-0 top-0 -translate-y-1/2">
                                    <span className="inline-block bg-white px-[3px] leading-none">
                                      {entry.value}
                                    </span>
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <FullCalendar
                    ref={calendarRef}
                    plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, luxon3Plugin]}
                    initialView="timeGridWeek"
                    headerToolbar={false}
                    height="auto"
                    firstDay={1}
                    timeZone={calendarTimeZone}
                    nowIndicator
                    editable
                    selectable
                    selectMirror
                    select={handleSelect}
                    dateClick={handleDateClick}
                    eventClick={handleEventClick}
                    eventDrop={handleEventMove}
                    eventResize={handleEventMove}
                    datesSet={handleDatesSet}
                    events={calendarEvents}
                    allDaySlot={false}
                    weekends
                    slotMinTime="00:00:00"
                    slotMaxTime="24:00:00"
                    slotDuration="00:30:00"
                    snapDuration="00:15:00"
                    slotLabelInterval="01:00"
                    expandRows
                    dayHeaderFormat={{ weekday: "short", day: "numeric" }}
                    eventContent={renderCalendarEvent}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {isToolsSidebarOpen ? (
          <aside
            id="interview-tools-sidebar"
            className="hidden rounded-[32px] border border-[rgba(28,82,54,0.12)] bg-white p-5 shadow-[0_16px_50px_rgba(24,34,24,0.06)] xl:block"
          >
            <div className="sticky top-5 grid gap-4">
                    <button
                      type="button"
                      onClick={() => openCreateModal(selectedDate)}
                      className="flex h-11 items-center justify-center rounded-full bg-[color:var(--accent)] px-5 text-sm font-semibold tracking-[0.01em] text-white shadow-[0_12px_24px_rgba(18,26,19,0.14)] transition-all hover:-translate-y-[1px] hover:shadow-[0_16px_28px_rgba(18,26,19,0.18)]"
                    >
                      + New event
                    </button>
                    <div className="rounded-[20px] border border-[var(--border)] bg-white px-4 py-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="text-xs uppercase tracking-[0.22em] text-[color:var(--muted)]">
                          Calendar Sources
                        </div>
                        <button
                          type="button"
                          onClick={() => setIcsModalOpen(true)}
                          className="h-9 rounded-full bg-[color:var(--accent)] px-4 text-sm font-semibold text-white"
                        >
                          Add ICS
                        </button>
                      </div>

                      <div className="space-y-3">
                        {ownIcsCalendarSources.length === 0 ? (
                          <div className="rounded-[18px] border border-dashed border-[var(--border)] bg-[color:var(--background)] px-4 py-4 text-sm text-[color:var(--muted)]">
                            No ICS calendars connected.
                          </div>
                        ) : (
                          ownIcsCalendarSources.map((source) => {
                            const preference = effectiveIcsSourcePreferences[source.id] ?? {
                              visible: true,
                              color: source.color,
                            };

                            return (
                              <div
                                key={source.id}
                                className="rounded-[18px] border border-[var(--border)] bg-[color:var(--background)] px-4 py-4"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span
                                        className="h-2.5 w-2.5 rounded-full shrink-0"
                                        style={{ backgroundColor: preference.color }}
                                      />
                                      <div className="truncate text-sm font-semibold text-[color:var(--foreground)]">
                                        {source.name}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <label className="relative flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[color:var(--muted)]">
                                      <input
                                        type="color"
                                        value={preference.color}
                                        onChange={(event) =>
                                          updateIcsSourceColor(source.id, event.target.value)
                                        }
                                        className="absolute inset-0 cursor-pointer opacity-0"
                                        aria-label={`Change color for ${source.name}`}
                                      />
                                      <PaletteIcon />
                                    </label>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        toggleIcsSourceVisibility(source.id, source.color)
                                      }
                                      className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[color:var(--muted)]"
                                      aria-label={
                                        preference.visible
                                          ? `Hide ${source.name}`
                                          : `Show ${source.name}`
                                      }
                                    >
                                      {preference.visible ? <EyeIcon /> : <EyeOffIcon />}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => removeIcsCalendar(source.id, source.name)}
                                      disabled={removingIcsSourceId === source.id}
                                      className="flex h-9 w-9 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 disabled:opacity-60"
                                      aria-label={`Remove ${source.name}`}
                                    >
                                      <TrashIcon />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {canManageAllSyncedCalendars ? (
                      <div className="rounded-[20px] border border-[var(--border)] bg-white px-4 py-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div className="text-xs uppercase tracking-[0.22em] text-[color:var(--muted)]">
                            Synced Users
                          </div>
                        </div>

                        {syncedOwnerGroups.length === 0 ? (
                          <div className="rounded-[18px] border border-dashed border-[var(--border)] bg-[color:var(--background)] px-4 py-4 text-sm text-[color:var(--muted)]">
                            No synced users yet.
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {syncedOwnerGroups.map((owner) => {
                              const preference =
                                effectiveSyncedOwnerPreferences[owner.ownerUserId] ?? {
                                  visible: true,
                                  color: "#5aa9e6",
                                };

                              return (
                                <div
                                  key={owner.ownerUserId}
                                  className="rounded-[18px] border border-[var(--border)] bg-[color:var(--background)] px-4 py-4"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span
                                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                                          style={{ backgroundColor: preference.color }}
                                        />
                                        <div className="truncate text-sm font-semibold text-[color:var(--foreground)]">
                                          {owner.ownerName}
                                        </div>
                                      </div>
                                      <div className="mt-1 text-xs text-[color:var(--muted)]">
                                        {owner.icsSourceCount > 0
                                          ? `${owner.icsSourceCount} calendar source${owner.icsSourceCount === 1 ? "" : "s"}`
                                          : "No ICS sources"}
                                        {owner.googleConnectionCount > 0
                                          ? ` · ${owner.googleConnectionCount} Google sync${owner.googleConnectionCount === 1 ? "" : "s"}`
                                          : ""}
                                        {owner.localEventCount > 0
                                          ? ` · ${owner.localEventCount} manual event${owner.localEventCount === 1 ? "" : "s"}`
                                          : ""}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <label className="relative flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[color:var(--muted)]">
                                        <input
                                          type="color"
                                          value={preference.color}
                                          onChange={(event) =>
                                            updateSyncedOwnerColor(
                                              owner.ownerUserId,
                                              event.target.value,
                                            )
                                          }
                                          className="absolute inset-0 cursor-pointer opacity-0"
                                          aria-label={`Change color for ${owner.ownerName}`}
                                        />
                                        <PaletteIcon />
                                      </label>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          toggleSyncedOwnerVisibility(
                                            owner.ownerUserId,
                                            preference.color,
                                          )
                                        }
                                        className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[color:var(--muted)]"
                                        aria-label={
                                          preference.visible
                                            ? `Hide ${owner.ownerName}`
                                            : `Show ${owner.ownerName}`
                                        }
                                      >
                                        {preference.visible ? <EyeIcon /> : <EyeOffIcon />}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ) : null}

                    <div className="rounded-[20px] border border-[var(--border)] bg-white px-4 py-4">
                      <div className="mb-4 text-xs uppercase tracking-[0.22em] text-[color:var(--muted)]">
                        Timezones
                      </div>

                      <div className="space-y-4">
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--muted)]">
                            Calendar timezone
                          </div>
                          <select
                            value={calendarTimezoneLabel}
                            onChange={(event) => setCalendarTimezoneLabel(event.target.value)}
                            className="mt-2 h-10 w-full rounded-xl border border-[var(--border)] bg-[color:var(--background)] px-3 text-sm outline-none"
                          >
                            {timezoneOptions.map((option) => (
                              <option key={option.label} value={option.label}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--muted)]">
                            Comparison timezones
                          </div>
                          <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                            <select
                              value={selectedTimezoneLabel}
                              onChange={(event) => setSelectedTimezoneLabel(event.target.value)}
                              className="h-10 min-w-0 w-full rounded-xl border border-[var(--border)] bg-[color:var(--background)] px-3 text-sm outline-none"
                            >
                              {timezoneOptions
                                .filter((option) => option.label !== "Local")
                                .map((option) => (
                                  <option key={option.label} value={option.label}>
                                    {option.label}
                                  </option>
                                ))}
                            </select>
                            <button
                              type="button"
                              onClick={addComparisonTimezone}
                              className="h-10 rounded-xl bg-[color:var(--accent)] px-4 text-sm font-semibold text-white whitespace-nowrap"
                            >
                              Add
                            </button>
                          </div>
                          {comparisonTimezones.length === 0 ? (
                            <div className="mt-2 rounded-xl border border-dashed border-[var(--border)] px-3 py-2 text-xs text-[color:var(--muted)]">
                              No comparison timezones.
                            </div>
                          ) : (
                            comparisonTimezones.map((option) => (
                              <div
                                key={option.label}
                                className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[color:var(--background)] px-3 py-3 text-sm"
                              >
                                <div className="min-w-0">
                                  <div className="font-semibold">{option.label}</div>
                                  <div className="mt-0.5 text-xs text-[color:var(--muted)]">
                                    {formatTimeInTimezone(currentTime, option.timeZone)}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeComparisonTimezone(option.label)}
                                  className="shrink-0 text-xs font-semibold text-rose-600"
                                >
                                  Remove
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
          </div>
          </aside>
        ) : null}
      </div>

      <aside className="pointer-events-none fixed right-6 top-1/2 z-40 hidden -translate-y-1/2 xl:block">
        <button
          type="button"
          onClick={() => setIsToolsSidebarOpen((current) => !current)}
          className={`pointer-events-auto flex h-[56px] w-[56px] items-center justify-center text-[color:var(--accent)] transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            isToolsSidebarOpen ? "translate-x-0" : "hover:-translate-x-1"
          }`}
          aria-expanded={isToolsSidebarOpen}
          aria-controls="interview-tools-sidebar"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-[color:var(--accent)] shadow-[0_10px_24px_rgba(31,93,61,0.16)]">
            {isToolsSidebarOpen ? (
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 6l12 12" />
                <path d="M18 6L6 18" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 12h16" />
                <path d="M12 4v16" />
              </svg>
            )}
          </span>
        </button>
      </aside>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(18,26,19,0.38)] p-4">
          <div className="w-full max-w-2xl rounded-[30px] border border-[rgba(28,82,54,0.12)] bg-white p-5 shadow-[0_24px_80px_rgba(18,26,19,0.18)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--muted)]">
                  {editingId
                    ? isLocalModalReadOnly
                      ? "Event Details"
                      : "Edit Interview"
                    : "New Interview"}
                </div>
                <h3 className="mt-2 text-2xl font-semibold">
                  {editingId
                    ? isLocalModalReadOnly
                      ? "View in Forest"
                      : "Update scheduled interview"
                    : "Schedule interview"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  setIsLocalModalReadOnly(false);
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[color:var(--background)] text-[color:var(--muted)]"
              >
                x
              </button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="Title" className={isLocalModalReadOnly ? "md:col-span-2" : ""}>
                <input
                  value={draft.title}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  readOnly={isLocalModalReadOnly}
                  className="h-10 w-full rounded-xl border border-[var(--border)] bg-[color:var(--background)] px-3 text-sm outline-none"
                />
              </Field>
              {!isLocalModalReadOnly ? (
              <Field label="Status">
                <select
                  value={draft.status}
                  onChange={(event) =>
                    setDraft((current) => {
                      const nextStatus = event.target.value as InterviewStatus;
                      const currentDefaultColor = statusDefaultColors[current.status];

                      return {
                        ...current,
                        status: nextStatus,
                        color:
                          current.color === currentDefaultColor
                            ? statusDefaultColors[nextStatus]
                            : current.color,
                      };
                    })
                  }
                  disabled={isLocalModalReadOnly}
                  className="h-10 w-full rounded-xl border border-[var(--border)] bg-[color:var(--background)] px-3 text-sm outline-none"
                >
                  {["Scheduled", "Confirmed", "Done", "Cancelled"].map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </Field>
              ) : null}
              {!isLocalModalReadOnly ? (
              <Field label="Color">
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={draft.color}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        color: event.target.value,
                      }))
                    }
                    disabled={isLocalModalReadOnly}
                    className="h-10 w-14 rounded-xl border border-[var(--border)] bg-[color:var(--background)] p-1"
                  />
                  <input
                    value={draft.color}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        color: event.target.value,
                      }))
                    }
                    readOnly={isLocalModalReadOnly}
                    className="h-10 flex-1 rounded-xl border border-[var(--border)] bg-[color:var(--background)] px-3 text-sm outline-none"
                  />
                </div>
              </Field>
              ) : null}
              {editingId ? (
              <Field label="Bidder">
                <select
                  value={draft.bidderUserId}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      bidderUserId: event.target.value,
                    }))
                  }
                  disabled={isLocalModalReadOnly}
                  className="h-10 w-full rounded-xl border border-[var(--border)] bg-[color:var(--background)] px-3 text-sm outline-none"
                >
                  <option value="">Select bidder</option>
                  {bidders.map((bidder) => (
                    <option key={bidder.id} value={bidder.id}>
                      {bidder.name}
                    </option>
                  ))}
                </select>
              </Field>
              ) : null}
              {!isLocalModalReadOnly ? (
              <Field label="Caller">
                <select
                  value={draft.callerUserId}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      callerUserId: event.target.value,
                    }))
                  }
                  disabled={isLocalModalReadOnly}
                  className="h-10 w-full rounded-xl border border-[var(--border)] bg-[color:var(--background)] px-3 text-sm outline-none"
                >
                  <option value="">Select caller</option>
                  {callers.map((caller) => (
                    <option key={caller.id} value={caller.id}>
                      {caller.name}
                    </option>
                  ))}
                </select>
              </Field>
              ) : null}
              <Field label="Date">
                <PickerInput
                  type="date"
                  value={draft.scheduledDate}
                  disabled={isLocalModalReadOnly}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      scheduledDate: value,
                    }))
                  }
                />
              </Field>
              <Field label="Time">
                <PickerInput
                  type="time"
                  value={draft.scheduledTime}
                  disabled={isLocalModalReadOnly}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      scheduledTime: value,
                    }))
                  }
                />
              </Field>
              <Field label="Duration (minutes)">
                <input
                  type="number"
                  min="15"
                  step="15"
                  value={draft.durationMinutes}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      durationMinutes: Number(event.target.value) || 60,
                    }))
                  }
                  readOnly={isLocalModalReadOnly}
                  className="h-10 w-full rounded-xl border border-[var(--border)] bg-[color:var(--background)] px-3 text-sm outline-none"
                />
              </Field>
              <Field label="Step">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={draft.step}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      step: Number(event.target.value) || 1,
                    }))
                  }
                  readOnly={isLocalModalReadOnly}
                  className="h-10 w-full rounded-xl border border-[var(--border)] bg-[color:var(--background)] px-3 text-sm outline-none"
                />
              </Field>
              <Field label="Meeting link">
                <LinkInput
                  value={draft.meetingLink}
                  readOnly={isLocalModalReadOnly}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      meetingLink: value,
                    }))
                  }
                />
              </Field>
              <Field label="JD">
                <LinkInput
                  value={draft.jdLink}
                  readOnly={isLocalModalReadOnly}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      jdLink: value,
                    }))
                  }
                />
              </Field>
              <Field label="Resume">
                <LinkInput
                  value={draft.resumeLink}
                  readOnly={isLocalModalReadOnly}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      resumeLink: value,
                    }))
                  }
                />
              </Field>
              <Field label="Doc" className={isLocalModalReadOnly ? "" : "md:col-span-2"}>
                <LinkInput
                  value={draft.docLink}
                  readOnly={isLocalModalReadOnly}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      docLink: value,
                    }))
                  }
                />
              </Field>
              <Field label="Note" className="md:col-span-2">
                <textarea
                  value={draft.notes}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  readOnly={isLocalModalReadOnly}
                  className="min-h-28 w-full rounded-2xl border border-[var(--border)] bg-[color:var(--background)] px-3 py-3 text-sm outline-none"
                />
              </Field>
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <div>
                {editingId && !isLocalModalReadOnly ? (
                  <button
                    type="button"
                    onClick={removeEvent}
                    disabled={pending || isLocalModalReadOnly}
                    className="h-10 rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-700 disabled:opacity-60"
                  >
                    Delete
                  </button>
                ) : null}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setModalOpen(false);
                    setIsLocalModalReadOnly(false);
                  }}
                  className="h-10 rounded-xl border border-[var(--border)] bg-[color:var(--background)] px-4 text-sm font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveEvent}
                  disabled={
                    pending ||
                    !draft.title ||
                    !draft.scheduledDate ||
                    !draft.scheduledTime ||
                    isLocalModalReadOnly
                  }
                  className="h-10 rounded-xl bg-[color:var(--accent)] px-4 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {isLocalModalReadOnly
                    ? "Read only"
                    : pending
                    ? "Saving..."
                    : editingId
                      ? "Save changes"
                      : "Create interview"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {icsModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(18,26,19,0.38)] p-4">
          <div className="w-full max-w-lg rounded-[30px] border border-[rgba(28,82,54,0.12)] bg-white p-5 shadow-[0_24px_80px_rgba(18,26,19,0.18)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--muted)]">
                  ICS Calendar
                </div>
                <h3 className="mt-2 text-2xl font-semibold">
                  Add read-only calendar
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIcsModalOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[color:var(--background)] text-[color:var(--muted)]"
              >
                x
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              <Field label="Calendar name">
                <input
                  value={icsName}
                  onChange={(event) => setIcsName(event.target.value)}
                  className="h-10 w-full rounded-xl border border-[var(--border)] bg-[color:var(--background)] px-3 text-sm outline-none"
                />
              </Field>
              <Field label="ICS URL">
                <input
                  value={icsUrl}
                  onChange={(event) => setIcsUrl(event.target.value)}
                  placeholder="https://.../private-....ics"
                  className="h-10 w-full rounded-xl border border-[var(--border)] bg-[color:var(--background)] px-3 text-sm outline-none"
                />
              </Field>
              <Field label="Color">
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={icsColor}
                    onChange={(event) => setIcsColor(event.target.value)}
                    className="h-10 w-14 rounded-xl border border-[var(--border)] bg-[color:var(--background)] p-1"
                  />
                  <input
                    value={icsColor}
                    onChange={(event) => setIcsColor(event.target.value)}
                    className="h-10 flex-1 rounded-xl border border-[var(--border)] bg-[color:var(--background)] px-3 text-sm outline-none"
                  />
                </div>
              </Field>
            </div>

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIcsModalOpen(false)}
                className="h-10 rounded-xl border border-[var(--border)] bg-[color:var(--background)] px-4 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={addIcsCalendar}
                disabled={addingIcsCalendar || !icsName.trim() || !icsUrl.trim()}
                className="h-10 rounded-xl bg-[color:var(--accent)] px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                {addingIcsCalendar ? "Saving..." : "Add calendar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {importedModalOpen && importedDraft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(18,26,19,0.38)] p-4">
          <div className="w-full max-w-2xl rounded-[30px] border border-[rgba(28,82,54,0.12)] bg-white p-5 shadow-[0_24px_80px_rgba(18,26,19,0.18)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--muted)]">
                  {isImportedModalReadOnly ? "Event Details" : "Imported Event"}
                </div>
                <h3 className="mt-2 text-2xl font-semibold">
                  {isImportedModalReadOnly ? "View in Forest" : "Edit locally in Forest"}
                </h3>
              </div>
              <button
                type="button"
                    onClick={() => {
                      setImportedModalOpen(false);
                      setEditingImportedId("");
                      setOriginalImportedEvent(null);
                      setImportedDraft(null);
                      setIsImportedModalReadOnly(false);
                    }}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[color:var(--background)] text-[color:var(--muted)]"
              >
                x
              </button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="Title" className="md:col-span-2">
                <input
                  value={importedDraft.title}
                  onChange={(event) =>
                    setImportedDraft((current) =>
                      current
                        ? {
                            ...current,
                            title: event.target.value,
                          }
                        : current,
                    )
                  }
                  readOnly={isImportedModalReadOnly}
                  className="h-10 w-full rounded-xl border border-[var(--border)] bg-[color:var(--background)] px-3 text-sm outline-none"
                />
              </Field>
              <Field label="Date">
                <PickerInput
                  type="date"
                  value={toDateKey(new Date(importedDraft.start))}
                  disabled={isImportedModalReadOnly}
                  onChange={(value) =>
                    setImportedDraft((current) =>
                      current
                        ? {
                            ...current,
                            start: mergeDateAndTime(current.start, value),
                            end: shiftEndToMatchDate(current.start, current.end, value),
                          }
                        : current,
                    )
                  }
                />
              </Field>
              <Field label="Time">
                <PickerInput
                  type="time"
                  value={formatTimeInputValue(new Date(importedDraft.start))}
                  disabled={isImportedModalReadOnly}
                  onChange={(value) =>
                    setImportedDraft((current) =>
                      current
                        ? {
                            ...current,
                            start: mergeTimeIntoIso(current.start, value),
                            end: shiftEndToMatchStart(current.start, current.end, value),
                          }
                        : current,
                    )
                  }
                />
              </Field>
              <Field label="Duration (minutes)">
                <input
                  type="number"
                  min="15"
                  step="15"
                  value={Math.max(
                    15,
                    Math.round(
                      (new Date(importedDraft.end).getTime() -
                        new Date(importedDraft.start).getTime()) /
                        60000,
                    ),
                  )}
                  onChange={(event) =>
                    setImportedDraft((current) =>
                      current
                        ? {
                            ...current,
                            end: addMinutesToIso(current.start, Number(event.target.value) || 60),
                          }
                        : current,
                    )
                  }
                  readOnly={isImportedModalReadOnly}
                  className="h-10 w-full rounded-xl border border-[var(--border)] bg-[color:var(--background)] px-3 text-sm outline-none"
                />
              </Field>
              <Field label="Step">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={importedDraft.step}
                  onChange={(event) =>
                    setImportedDraft((current) =>
                      current
                        ? {
                            ...current,
                            step: Number(event.target.value) || 1,
                          }
                        : current,
                    )
                  }
                  readOnly={isImportedModalReadOnly}
                  className="h-10 w-full rounded-xl border border-[var(--border)] bg-[color:var(--background)] px-3 text-sm outline-none"
                />
              </Field>
              <Field label="Color">
                <div className="flex gap-3">
                  <input
                    type="color"
                    value={importedDraft.color}
                    disabled={isImportedModalReadOnly}
                    onChange={(event) =>
                      setImportedDraft((current) =>
                        current
                          ? {
                              ...current,
                              color: event.target.value,
                            }
                          : current,
                      )
                    }
                    className="h-10 w-14 rounded-xl border border-[var(--border)] bg-[color:var(--background)] p-1"
                  />
                  <input
                    value={importedDraft.color}
                    readOnly={isImportedModalReadOnly}
                    onChange={(event) =>
                      setImportedDraft((current) =>
                        current
                          ? {
                              ...current,
                              color: event.target.value,
                            }
                          : current,
                      )
                    }
                    className="h-10 flex-1 rounded-xl border border-[var(--border)] bg-[color:var(--background)] px-3 text-sm outline-none"
                  />
                </div>
              </Field>
              <Field label="Caller">
                <select
                  value={importedDraft.callerUserId}
                  onChange={(event) =>
                    setImportedDraft((current) =>
                      current
                        ? {
                            ...current,
                            callerUserId: event.target.value,
                          }
                        : current,
                    )
                  }
                  disabled={isImportedModalReadOnly}
                  className="h-10 w-full rounded-xl border border-[var(--border)] bg-[color:var(--background)] px-3 text-sm outline-none"
                >
                  <option value="">Select caller</option>
                  {callers.map((caller) => (
                    <option key={caller.id} value={caller.id}>
                      {caller.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Meeting link" className="md:col-span-2">
                <LinkInput
                  value={importedDraft.meetingLink}
                  readOnly={isImportedModalReadOnly}
                  onExtract={
                    isImportedModalReadOnly ? null : extractImportedMeetingLink
                  }
                  onChange={(value) =>
                    setImportedDraft((current) =>
                      current
                        ? {
                            ...current,
                            meetingLink: value,
                          }
                        : current,
                    )
                  }
                />
              </Field>
              <Field label="JD">
                <LinkInput
                  value={importedDraft.jdLink}
                  readOnly={isImportedModalReadOnly}
                  onChange={(value) =>
                    setImportedDraft((current) =>
                      current
                        ? {
                            ...current,
                            jdLink: value,
                          }
                        : current,
                    )
                  }
                />
              </Field>
              <Field label="Resume">
                <LinkInput
                  value={importedDraft.resumeLink}
                  readOnly={isImportedModalReadOnly}
                  onChange={(value) =>
                    setImportedDraft((current) =>
                      current
                        ? {
                            ...current,
                            resumeLink: value,
                          }
                        : current,
                    )
                  }
                />
              </Field>
              <Field label="Doc">
                <LinkInput
                  value={importedDraft.docLink}
                  readOnly={isImportedModalReadOnly}
                  onChange={(value) =>
                    setImportedDraft((current) =>
                      current
                        ? {
                            ...current,
                            docLink: value,
                          }
                        : current,
                    )
                  }
                />
              </Field>
              <Field label="Note" className="md:col-span-2">
                <textarea
                  value={importedDraft.notes}
                  onChange={(event) =>
                    setImportedDraft((current) =>
                      current
                        ? {
                            ...current,
                            notes: event.target.value,
                          }
                        : current,
                    )
                  }
                  readOnly={isImportedModalReadOnly}
                  className="min-h-28 w-full rounded-2xl border border-[var(--border)] bg-[color:var(--background)] px-3 py-3 text-sm outline-none"
                />
              </Field>
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <div>
                <button
                  type="button"
                  onClick={resetImportedEvent}
                  disabled={pending || isImportedModalReadOnly}
                  className="h-10 rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-700 disabled:opacity-60"
                >
                  Reset to original
                </button>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setImportedModalOpen(false);
                    setEditingImportedId("");
                    setOriginalImportedEvent(null);
                    setImportedDraft(null);
                    setIsImportedModalReadOnly(false);
                  }}
                  className="h-10 rounded-xl border border-[var(--border)] bg-[color:var(--background)] px-4 text-sm font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveImportedEvent}
                  disabled={pending || !importedDraft.title || isImportedModalReadOnly}
                  className="h-10 rounded-xl bg-[color:var(--accent)] px-4 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {isImportedModalReadOnly ? "Read only" : pending ? "Saving..." : "Save changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <style jsx global>{`
        .forest-interview button:not(:disabled),
        .forest-interview a,
        .forest-interview [role="button"] {
          cursor: pointer;
        }

        .forest-calendar-shell .fc {
          --fc-border-color: rgba(198, 209, 198, 0.95);
          --fc-page-bg-color: #ffffff;
          --fc-neutral-bg-color: #f5f7f1;
          --fc-list-event-hover-bg-color: #eff6ee;
          font-family: inherit;
        }

        .forest-calendar-shell .fc-theme-standard td,
        .forest-calendar-shell .fc-theme-standard th {
          border-color: rgba(198, 209, 198, 0.95);
        }

        .forest-calendar-shell .fc-event.forest-event-readonly {
          cursor: not-allowed;
          opacity: 0.9;
        }

        .forest-calendar-shell .fc-scrollgrid {
          border: 0;
        }

        .forest-calendar-shell .fc-timegrid-axis,
        .forest-calendar-shell .fc-timegrid-slot-label {
          width: 0 !important;
        }

        .forest-calendar-shell .fc-timegrid-axis-frame,
        .forest-calendar-shell .fc-timegrid-slot-label-frame,
        .forest-calendar-shell .fc-timegrid-axis-cushion,
        .forest-calendar-shell .fc-timegrid-slot-label-cushion {
          display: none !important;
        }

        .forest-calendar-shell .fc-col-header-cell {
          background: linear-gradient(180deg, rgba(249, 251, 246, 0.94), #ffffff);
          padding: 10px 0;
        }

        .forest-calendar-shell .fc-scrollgrid-section-header,
        .forest-calendar-shell .fc-scrollgrid-section-header > th,
        .forest-calendar-shell .fc-scrollgrid-section-header .fc-scroller-harness,
        .forest-calendar-shell .fc-scrollgrid-section-header .fc-scroller,
        .forest-calendar-shell .fc-col-header {
          position: sticky;
          top: 104px;
          z-index: 22;
          background: #ffffff;
        }

        .forest-calendar-shell .fc-col-header-cell {
          position: sticky;
          top: 104px;
          z-index: 23;
        }

        .forest-calendar-shell .fc-col-header-cell-cushion {
          padding: 10px 8px;
          color: #12211a;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.22em;
          text-transform: uppercase;
        }

        .forest-calendar-shell .fc-timegrid-slot {
          height: 5px;
        }

        .forest-calendar-shell .fc-timegrid-slot-minor {
          border-top-style: solid;
          border-top-color: transparent;
        }

        .forest-calendar-shell td.fc-timegrid-slot-lane.fc-timegrid-slot-minor,
        .forest-calendar-shell td.fc-timegrid-slot-label.fc-timegrid-slot-minor {
          border-top-color: transparent !important;
        }

        .forest-calendar-shell .fc-timegrid-slot-label-cushion,
        .forest-calendar-shell .fc-timegrid-axis-cushion {
          color: #5d6f61;
          font-size: 12px;
          font-weight: 600;
        }

        .forest-calendar-shell .fc-timegrid-now-indicator-line {
          border-color: #ff4f7a;
        }

        .forest-calendar-shell .fc-timegrid-now-indicator-arrow {
          border-color: #ff4f7a;
          color: #ff4f7a;
        }

        .forest-calendar-shell .fc-event {
          border: 0;
          border-radius: 16px;
          box-shadow: 0 10px 24px rgba(18, 26, 19, 0.08);
        }

        .forest-calendar-shell .fc-event-main {
          padding: 0;
        }

        .forest-calendar-shell .forest-event-card {
          height: 100%;
          padding: 0;
          border: 1px solid transparent;
          border-radius: 16px;
          overflow: hidden;
        }

        .forest-calendar-shell .forest-event-scheduled .forest-event-card {
          background: #fff4d6;
          border-color: #ffd86f;
          color: #b45309;
        }

        .forest-calendar-shell .forest-event-confirmed .forest-event-card {
          background: #e0f2fe;
          border-color: #7dd3fc;
          color: #075985;
        }

        .forest-calendar-shell .forest-event-done .forest-event-card {
          background: #dff7e7;
          border-color: #86efac;
          color: #166534;
        }

        .forest-calendar-shell .forest-event-cancelled .forest-event-card {
          background: #ffe4e6;
          border-color: #fda4af;
          color: #be123c;
        }

        .forest-calendar-shell .forest-event-imported .forest-event-card {
          background: color-mix(in srgb, var(--event-color) 18%, white);
          border-color: var(--event-color);
          color: #294131;
        }

        .forest-calendar-shell .forest-event-local-colored .forest-event-card {
          background: color-mix(in srgb, var(--event-color) 18%, white);
          border-color: var(--event-color);
          color: #294131;
        }
      `}</style>
    </>
  );
}

function RefreshIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`h-4 w-4 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

function renderCalendarEvent(arg: EventContentArg) {
  const callerName = arg.event.extendedProps.callerName as string | undefined;
  const sourceName = arg.event.extendedProps.sourceName as string | undefined;
  const ownerName = arg.event.extendedProps.ownerName as string | undefined;
  const isImported = Boolean(arg.event.extendedProps.isImported);
  const rawColor = arg.event.extendedProps.color as string | undefined;
  const color = rawColor?.trim() ?? "";
  const rawStep = arg.event.extendedProps.step as number | string | undefined;
  const step = Math.max(1, Number(rawStep) || 1);
  const stepBadgeClass =
    step === 1
      ? "border-sky-200 bg-sky-100 text-sky-800"
      : step === 2
        ? "border-amber-200 bg-amber-100 text-amber-800"
        : step === 3
          ? "border-emerald-200 bg-emerald-100 text-emerald-800"
          : "border-pink-200 bg-pink-100 text-pink-800";
  const tooltipLines = [
    arg.event.title,
    arg.timeText,
    ownerName ? `Owner: ${ownerName}` : null,
    sourceName ? `Calendar: ${sourceName}` : null,
    callerName ? `Caller: ${callerName}` : null,
  ].filter(Boolean);
  const callerBadgeLabel =
    callerName && callerName !== "Unassigned"
      ? callerName.split(/\s+/)[0]
      : "";

  return (
    <div
      className="forest-event-shell relative h-full"
      style={
        isImported || color
          ? ({ ["--event-color" as string]: color || "#7c9b7b" } as CSSProperties)
          : undefined
      }
      title={tooltipLines.join("\n")}
    >
      <div className="forest-event-card h-full">
        <div className="flex items-start gap-1.5">
          <div
            className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${stepBadgeClass}`}
          >
            {step}
          </div>
          <div className="min-w-0 truncate pr-2 pt-0.5 text-sm font-semibold">{arg.event.title}</div>
        </div>
        <div className={`px-2 ${callerBadgeLabel ? "pb-7" : "pb-2"}`}>
          <div className="mt-1 truncate text-xs opacity-80">{arg.timeText}</div>
          {sourceName ? (
            <div className="mt-1 truncate text-xs opacity-80">{sourceName}</div>
          ) : null}
          {!callerBadgeLabel && callerName ? (
            <div className="mt-1 truncate text-xs opacity-80">{callerName}</div>
          ) : null}
        </div>
      </div>
      {callerBadgeLabel ? (
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 rounded-full border border-[rgba(18,26,19,0.16)] bg-white px-1.5 py-0.5 text-[10px] font-semibold leading-none text-[color:var(--foreground)]">
          {callerBadgeLabel}
        </div>
      ) : null}
    </div>
  );
}

function LinkInput({
  value,
  onChange,
  readOnly = false,
  onExtract,
}: {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  onExtract?: (() => void) | null;
}) {
  const normalizedValue = value.trim();
  const [copied, setCopied] = useState(false);
  const href = normalizedValue
    ? /^https?:\/\//i.test(normalizedValue)
      ? normalizedValue
      : `https://${normalizedValue}`
    : "";

  const copyLink = async () => {
    if (!normalizedValue) {
      return;
    }

    await navigator.clipboard.writeText(normalizedValue);
    setCopied(true);
    window.setTimeout(() => {
      setCopied(false);
    }, 1600);
  };

  return (
    <div
      className={`grid gap-2 ${
        onExtract
          ? "grid-cols-[minmax(0,1fr)_40px_40px_40px]"
          : "grid-cols-[minmax(0,1fr)_40px_40px]"
      }`}
    >
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        readOnly={readOnly}
        className="h-10 w-full rounded-xl border border-[var(--border)] bg-[color:var(--background)] px-3 text-sm outline-none"
      />
      {onExtract ? (
        <button
          type="button"
          onClick={onExtract}
          disabled={readOnly}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[color:var(--background)] text-[color:var(--muted)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-45"
          aria-label="Extract meeting link"
          title="Extract meeting link"
        >
          <ExtractLinkIcon />
        </button>
      ) : null}
      <button
        type="button"
        onClick={copyLink}
        disabled={!normalizedValue}
        className={`flex h-10 w-10 items-center justify-center rounded-xl border bg-[color:var(--background)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-45 ${
          copied
            ? "border-emerald-200 text-emerald-600"
            : "border-[var(--border)] text-[color:var(--muted)]"
        }`}
        aria-label="Copy link"
        title="Copy link"
      >
        {copied ? <StatusCheckIcon /> : <CopyIcon />}
      </button>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => {
            event.stopPropagation();
          }}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[color:var(--background)] text-[color:var(--muted)] cursor-pointer"
          aria-label="Open link"
          title="Open link"
        >
          <OpenLinkIcon />
        </a>
      ) : (
        <span
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[color:var(--background)] text-[color:var(--muted)] cursor-not-allowed opacity-45"
          aria-hidden="true"
        >
          <OpenLinkIcon />
        </span>
      )}
    </div>
  );
}

function PickerInput({
  type,
  value,
  onChange,
  disabled = false,
}: {
  type: "date" | "time";
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const openPicker = () => {
    const input = inputRef.current;

    if (!input) {
      return;
    }

    if (disabled) {
      return;
    }

    input.focus();

    const pickerInput = input as HTMLInputElement & {
      showPicker?: () => void;
    };

    if (typeof pickerInput.showPicker === "function") {
      pickerInput.showPicker();
    } else {
      input.click();
    }
  };

  return (
    <div
      className="relative h-10 w-full rounded-xl border border-[var(--border)] bg-[color:var(--background)]"
      onClick={openPicker}
    >
      <input
        ref={inputRef}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="h-full w-full rounded-xl bg-transparent px-3 text-sm outline-none"
      />
    </div>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`grid gap-2 ${className}`}>
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

function CopyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="10" height="10" rx="2" />
      <path d="M5 15V7a2 2 0 0 1 2-2h8" />
    </svg>
  );
}

function OpenLinkIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 5h5v5" />
      <path d="M10 14 19 5" />
      <path d="M19 14v3a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3" />
    </svg>
  );
}

function PaletteIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3.5c-4.9 0-8.8 3.5-8.8 7.9 0 3.6 2.7 6.1 6.2 6.1h1.1c.8 0 1.5.6 1.5 1.4 0 .8.6 1.4 1.4 1.4 4.2 0 7.4-3.2 7.4-7.4 0-5.2-4.1-9.4-8.8-9.4Z" />
      <circle cx="7.8" cy="11" r="1" />
      <circle cx="11.2" cy="8.2" r="1" />
      <circle cx="15.2" cy="8.8" r="1" />
      <circle cx="16.8" cy="12.8" r="1" />
    </svg>
  );
}

function ExtractLinkIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 12h8" />
      <path d="m13 7 5 5-5 5" />
      <path d="M5 5v14" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 12s3.6-6 9.5-6 9.5 6 9.5 6-3.6 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 3l18 18" />
      <path d="M10.6 10.7a3 3 0 0 0 4 4" />
      <path d="M9.9 5.2A10.5 10.5 0 0 1 12 5c5.9 0 9.5 6 9.5 6a18.5 18.5 0 0 1-3.1 3.8" />
      <path d="M6.2 6.3A18.3 18.3 0 0 0 2.5 12s3.6 6 9.5 6c1.5 0 2.8-.3 4-.8" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 7h16" />
      <path d="M9 7V4.8c0-.4.3-.8.8-.8h4.4c.5 0 .8.4.8.8V7" />
      <path d="M6.5 7l.8 11.1c0 .9.7 1.4 1.6 1.4h6.2c.9 0 1.6-.5 1.6-1.4L17.5 7" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  );
}

function StatusCheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function getStoredCalendarSettings(): CalendarSettings {
  if (typeof window === "undefined") {
    return defaultCalendarSettings;
  }

  const raw = window.localStorage.getItem(CALENDAR_SETTINGS_KEY);

  if (!raw) {
    return defaultCalendarSettings;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<CalendarSettings>;
    const calendarTimezoneLabel =
      parsed.calendarTimezoneLabel &&
      timezoneOptions.some((option) => option.label === parsed.calendarTimezoneLabel)
        ? parsed.calendarTimezoneLabel
        : defaultCalendarSettings.calendarTimezoneLabel;

    const comparisonTimezoneLabels =
      parsed.comparisonTimezoneLabels &&
      Array.isArray(parsed.comparisonTimezoneLabels)
        ? parsed.comparisonTimezoneLabels.filter((label) =>
            timezoneOptions.some(
              (option) => option.label === label && option.label !== "Local",
            ),
          )
        : defaultCalendarSettings.comparisonTimezoneLabels;

    return {
      calendarTimezoneLabel,
      comparisonTimezoneLabels:
        comparisonTimezoneLabels.length > 0
          ? comparisonTimezoneLabels
          : defaultCalendarSettings.comparisonTimezoneLabels,
    };
  } catch {
    window.localStorage.removeItem(CALENDAR_SETTINGS_KEY);
    return defaultCalendarSettings;
  }
}

function getStoredIcsSourcePreferences(): IcsSourcePreferences {
  if (typeof window === "undefined") {
    return {};
  }

  const raw = window.localStorage.getItem(ICS_SOURCE_PREFERENCES_KEY);

  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as IcsSourcePreferences;

    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([, value]) =>
          value &&
          typeof value === "object" &&
          typeof value.visible === "boolean" &&
          typeof value.color === "string",
      ),
    );
  } catch {
    window.localStorage.removeItem(ICS_SOURCE_PREFERENCES_KEY);
    return {};
  }
}

function getStoredSyncedOwnerPreferences(): SyncedOwnerPreferences {
  if (typeof window === "undefined") {
    return {};
  }

  const raw = window.localStorage.getItem(SYNCED_OWNER_PREFERENCES_KEY);

  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as SyncedOwnerPreferences;

    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([, value]) =>
          value &&
          typeof value === "object" &&
          typeof value.visible === "boolean" &&
          typeof value.color === "string",
      ),
    );
  } catch {
    window.localStorage.removeItem(SYNCED_OWNER_PREFERENCES_KEY);
    return {};
  }
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function combineDateTime(date: string, time: string) {
  return `${date}T${time}:00`;
}

function addMinutesToDateTime(date: string, time: string, durationMinutes: number) {
  const base = new Date(combineDateTime(date, time));
  base.setMinutes(base.getMinutes() + durationMinutes);
  return base;
}

function addMinutesToIso(startIso: string, durationMinutes: number) {
  const base = new Date(startIso);
  base.setMinutes(base.getMinutes() + durationMinutes);
  return base.toISOString();
}

function mergeDateAndTime(iso: string, dateKey: string) {
  const current = new Date(iso);
  const [year, month, day] = dateKey.split("-").map(Number);
  const next = new Date(current);
  next.setFullYear(year, (month ?? 1) - 1, day ?? 1);
  return next.toISOString();
}

function mergeTimeIntoIso(iso: string, time: string) {
  const current = new Date(iso);
  const [hours, minutes] = time.split(":").map(Number);
  const next = new Date(current);
  next.setHours(hours ?? 0, minutes ?? 0, 0, 0);
  return next.toISOString();
}

function shiftEndToMatchDate(startIso: string, endIso: string, dateKey: string) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const durationMinutes = Math.max(
    15,
    Math.round((end.getTime() - start.getTime()) / 60000),
  );

  return addMinutesToIso(mergeDateAndTime(startIso, dateKey), durationMinutes);
}

function shiftEndToMatchStart(startIso: string, endIso: string, time: string) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const durationMinutes = Math.max(
    15,
    Math.round((end.getTime() - start.getTime()) / 60000),
  );

  return addMinutesToIso(mergeTimeIntoIso(startIso, time), durationMinutes);
}

function formatTimeInputValue(date: Date) {
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${hours}:${minutes}`;
}

function compareEvents(a: InterviewEvent, b: InterviewEvent) {
  return `${a.scheduledDate}T${a.scheduledTime}`.localeCompare(
    `${b.scheduledDate}T${b.scheduledTime}`,
  );
}

function getUserName(users: ManagedUser[], userId: string) {
  return users.find((user) => user.id === userId)?.name ?? "Unassigned";
}

function formatViewRange(start: Date, end: Date, view: string) {
  if (view === "dayGridMonth") {
    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
    }).format(start);
  }

  if (view === "timeGridDay") {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(start);
  }

  const inclusiveEnd = new Date(end);
  inclusiveEnd.setDate(inclusiveEnd.getDate() - 1);

  const firstLabel = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(start);
  const lastLabel = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(inclusiveEnd);

  return `${firstLabel} - ${lastLabel}`;
}

function formatTimeInTimezone(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: timeZone === "local" ? undefined : timeZone,
  }).format(date);
}

function formatHourInTimezone(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: true,
    timeZone: timeZone === "local" ? undefined : timeZone,
  }).format(date);
}

function getInstantForTimeZoneHour(
  referenceDate: Date,
  hour: number,
  timeZone: string,
) {
  if (timeZone === "local") {
    const localDate = new Date(referenceDate);
    localDate.setHours(hour, 0, 0, 0);
    return localDate;
  }

  const { year, month, day } = getDatePartsInTimeZone(referenceDate, timeZone);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, 0, 0));
  const firstOffset = getTimeZoneOffsetMinutes(utcGuess, timeZone);
  const actualUtc = new Date(
    Date.UTC(year, month - 1, day, hour, 0, 0) - firstOffset * 60_000,
  );
  const secondOffset = getTimeZoneOffsetMinutes(actualUtc, timeZone);

  if (secondOffset !== firstOffset) {
    return new Date(
      Date.UTC(year, month - 1, day, hour, 0, 0) - secondOffset * 60_000,
    );
  }

  return actualUtc;
}

function getDatePartsInTimeZone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);

  return {
    year: Number(parts.find((part) => part.type === "year")?.value ?? "0"),
    month: Number(parts.find((part) => part.type === "month")?.value ?? "1"),
    day: Number(parts.find((part) => part.type === "day")?.value ?? "1"),
  };
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const rawOffset = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT";

  if (rawOffset === "GMT" || rawOffset === "UTC") {
    return 0;
  }

  const normalized = rawOffset.replace("GMT", "");
  const match = normalized.match(/^([+-])(\d{1,2})(?::?(\d{2}))?$/);

  if (!match) {
    return 0;
  }

  const [, sign, hours, minutes] = match;
  const totalMinutes = Number(hours) * 60 + Number(minutes ?? "0");
  return sign === "-" ? -totalMinutes : totalMinutes;
}
