import { DateTime } from "luxon";

import { extractMeetingLinkFromText } from "@/lib/meeting-link";
import type {
  IcsCalendarSource,
  ImportedCalendarEvent,
  ImportedCalendarEventOverride,
} from "@/lib/types";

const ICS_FETCH_TIMEOUT_MS = 10000;
const ICS_FETCH_ATTEMPTS = 3;
const ICS_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type CachedIcsFeed = {
  text: string;
  updatedAt: number;
};

const globalForIcsFeeds = globalThis as unknown as {
  nexIcsFeedCache?: Map<string, CachedIcsFeed>;
  nexIcsFeedRequests?: Map<string, Promise<string>>;
};

const icsFeedCache = globalForIcsFeeds.nexIcsFeedCache ?? new Map();
const icsFeedRequests = globalForIcsFeeds.nexIcsFeedRequests ?? new Map();

globalForIcsFeeds.nexIcsFeedCache = icsFeedCache;
globalForIcsFeeds.nexIcsFeedRequests = icsFeedRequests;

export async function importIcsEventsForSources(sources: IcsCalendarSource[]) {
  const results = await Promise.all(
    sources.map(async (source) => {
      try {
        const text = await getIcsFeed(source.url);
        return parseIcsCalendar(text, source);
      } catch {
        return [] as ImportedCalendarEvent[];
      }
    }),
  );

  return results.flat();
}

async function getIcsFeed(url: string) {
  const activeRequest = icsFeedRequests.get(url);

  if (activeRequest) {
    return activeRequest;
  }

  const request = fetchIcsFeedWithFallback(url).finally(() => {
    if (icsFeedRequests.get(url) === request) {
      icsFeedRequests.delete(url);
    }
  });

  icsFeedRequests.set(url, request);
  return request;
}

async function fetchIcsFeedWithFallback(url: string) {
  const cached = getUsableCachedFeed(url);
  let lastError: unknown;

  for (let attempt = 0; attempt < ICS_FETCH_ATTEMPTS; attempt += 1) {
    try {
      const text = await fetchIcsFeed(url);
      icsFeedCache.set(url, { text, updatedAt: Date.now() });
      return text;
    } catch (error) {
      lastError = error;

      if (cached) {
        return cached.text;
      }

      if (attempt < ICS_FETCH_ATTEMPTS - 1) {
        await waitForRetry(200 * (attempt + 1));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unable to load ICS feed.");
}

async function fetchIcsFeed(url: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ICS_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "text/calendar,text/plain;q=0.9,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      throw new Error(`ICS provider returned ${response.status}.`);
    }

    const text = await response.text();

    if (!text.includes("BEGIN:VCALENDAR")) {
      throw new Error("ICS provider returned an invalid calendar document.");
    }

    return text;
  } finally {
    clearTimeout(timeoutId);
  }
}

function getUsableCachedFeed(url: string) {
  const cached = icsFeedCache.get(url);

  if (!cached || Date.now() - cached.updatedAt > ICS_CACHE_MAX_AGE_MS) {
    return null;
  }

  return cached;
}

function waitForRetry(delayMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

export function applyImportedEventOverrides(
  events: ImportedCalendarEvent[],
  overrides: ImportedCalendarEventOverride[],
) {
  return events.map((event) => {
    const matchingOverrides = overrides.filter((override) => override.id === event.id);
    const override =
      matchingOverrides.find(
        (candidate) =>
          event.ownerUserId &&
          candidate.userId &&
          candidate.userId === event.ownerUserId,
      ) ?? matchingOverrides[0];

    if (!override) {
      return event;
    }

    return {
      ...event,
      title: override.hasLocalTitleOverride ? override.title : event.title,
      start: override.hasLocalScheduleOverride ? override.start : event.start,
      end: override.hasLocalScheduleOverride ? override.end : event.end,
      color:
        override.hasLocalColorOverride && override.color ? override.color : event.color,
      hasLocalColorOverride: Boolean(override.hasLocalColorOverride),
      callerUserId: override.callerUserId,
      meetingLink: override.meetingLink,
      jdLink: override.jdLink,
      resumeLink: override.resumeLink,
      docLink: override.docLink,
      step: override.step,
      notes: override.notes,
    };
  });
}

function parseIcsCalendar(icsText: string, source: IcsCalendarSource) {
  const lines = unfoldIcsLines(icsText);
  const calendarTimeZone = findCalendarTimeZone(lines);
  const events: ImportedCalendarEvent[] = [];
  let current: Record<string, string> | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = {};
      continue;
    }

    if (line === "END:VEVENT") {
      const parsed = buildImportedEvent(current, source, calendarTimeZone);

      if (parsed) {
        events.push(parsed);
      }

      current = null;
      continue;
    }

    if (!current) {
      continue;
    }

    const separatorIndex = findPropertyValueSeparator(line);

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex);
    const value = line.slice(separatorIndex + 1);
    current[key] = value;
  }

  return events;
}

function buildImportedEvent(
  raw: Record<string, string> | null,
  source: IcsCalendarSource,
  calendarTimeZone: string | null,
) {
  if (!raw) {
    return null;
  }

  const startEntry = findEntry(raw, "DTSTART");
  const endEntry = findEntry(raw, "DTEND");

  if (!startEntry) {
    return null;
  }

  const start = parseIcsDateValue(
    startEntry.key,
    startEntry.value,
    calendarTimeZone,
  );
  const end = parseIcsDateValue(
    endEntry?.key ?? "",
    endEntry?.value ?? "",
    calendarTimeZone,
  );

  if (!start || !isValidDate(start.date)) {
    return null;
  }

  const normalizedEnd =
    end?.date && isValidDate(end.date)
      ? end.date
      :
    new Date(
      start.date.getTime() +
        (start.allDay ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000),
    );

  if (!isValidDate(normalizedEnd)) {
    return null;
  }

  const uid = raw.UID ?? `${start.date.toISOString()}:${raw.SUMMARY ?? "busy"}`;
  const recurrenceId = getFieldValue(raw, "RECURRENCE-ID").trim();
  const eventKey = recurrenceId ? `${uid}:${recurrenceId}` : uid;

  return {
    id: `${source.id}:${eventKey}`,
    sourceId: source.id,
    sourceName: source.name,
    ownerUserId: source.ownerUserId,
    ownerName: source.ownerName,
    title: raw.SUMMARY?.trim() || source.name,
    start: start.date.toISOString(),
    end: normalizedEnd.toISOString(),
    allDay: start.allDay,
    color: source.color,
    location: getFieldValue(raw, "LOCATION"),
    description: getFieldValue(raw, "DESCRIPTION"),
    htmlDescription: getFieldValue(raw, "X-ALT-DESC"),
    externalUrl: getFieldValue(raw, "URL"),
    meetingLink: extractMeetingLinkFromText(
      getFieldValue(raw, "SUMMARY"),
      getFieldValue(raw, "DESCRIPTION"),
      getFieldValue(raw, "LOCATION"),
      getFieldValue(raw, "URL"),
      getFieldValue(raw, "X-ALT-DESC"),
    ),
  } satisfies ImportedCalendarEvent;
}

function findEntry(raw: Record<string, string>, startsWith: string) {
  const key = Object.keys(raw).find((entryKey) => entryKey.startsWith(startsWith));

  if (!key) {
    return null;
  }

  return { key, value: raw[key] };
}

function getFieldValue(raw: Record<string, string>, startsWith: string) {
  return findEntry(raw, startsWith)?.value ?? "";
}

function parseIcsDateValue(
  key: string,
  value: string,
  calendarTimeZone: string | null,
) {
  if (!value) {
    return null;
  }

  const isAllDay = key.includes("VALUE=DATE") || /^\d{8}$/.test(value);
  const normalized = value.trim();

  if (isAllDay) {
    const year = Number(normalized.slice(0, 4));
    const month = Number(normalized.slice(4, 6)) - 1;
    const day = Number(normalized.slice(6, 8));
    return {
      date: new Date(Date.UTC(year, month, day, 0, 0, 0)),
      allDay: true,
    };
  }

  const isUtc = normalized.endsWith("Z");
  const tzid = extractTzid(key);
  const normalizedZone = tzid ? normalizeIcsTimezone(tzid) : null;
  const compact = normalized.replace("Z", "");
  const parsedDateTime =
    parseDateTimeWithZone(
      compact,
      isUtc ? "UTC" : normalizedZone ?? calendarTimeZone,
    ) ??
    parseDateTimeWithZone(compact, "local");

  return {
    date: parsedDateTime?.toJSDate() ?? new Date(compact),
    allDay: false,
  };
}

function extractTzid(key: string) {
  const match = key.match(/TZID=(?:"([^"]+)"|([^;:]+))/i);

  if (!match) {
    return null;
  }

  return (match[1] ?? match[2] ?? "").trim();
}

function parseDateTimeWithZone(value: string, zone: string | null) {
  if (!zone) {
    return null;
  }

  const formats = [
    "yyyyLLdd'T'HHmmss",
    "yyyyLLdd'T'HHmm",
    "yyyyLLdd'T'HHmmssZZ",
    "yyyyLLdd'T'HHmmZZ",
  ];

  for (const format of formats) {
    const parsed = DateTime.fromFormat(value, format, { zone });

    if (parsed.isValid) {
      return parsed;
    }
  }

  return null;
}

function isValidDate(value: Date) {
  return Number.isFinite(value.getTime());
}

function normalizeIcsTimezone(tzid: string) {
  const trimmed = tzid
    .replace(/\\([,;])/g, "$1")
    .replace(/^\/+|^"+|"+$/g, "")
    .trim();

  if (IANA_ZONE_SET.has(trimmed)) {
    return trimmed;
  }

  const directMatch = WINDOWS_TZ_TO_IANA[trimmed];

  if (directMatch) {
    return directMatch;
  }

  const embeddedWindowsZone = Object.keys(WINDOWS_TZ_TO_IANA).find((zone) =>
    trimmed.endsWith(`/${zone}`),
  );

  if (embeddedWindowsZone) {
    return WINDOWS_TZ_TO_IANA[embeddedWindowsZone];
  }

  return DISPLAY_TZ_TO_IANA.find(({ pattern }) => pattern.test(trimmed))?.zone ?? trimmed;
}

function findCalendarTimeZone(lines: string[]) {
  const timezoneLines = [
    ...lines.filter((line) => line.startsWith("X-WR-TIMEZONE")),
    ...lines.filter((line) => line.startsWith("TZID")),
  ];

  for (const line of timezoneLines) {
    const separatorIndex = findPropertyValueSeparator(line);

    if (separatorIndex === -1) {
      continue;
    }

    const zone = normalizeIcsTimezone(line.slice(separatorIndex + 1));

    if (DateTime.local().setZone(zone).isValid) {
      return zone;
    }
  }

  return null;
}

function findPropertyValueSeparator(line: string) {
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }

    if (line[index] === ":" && !insideQuotes) {
      return index;
    }
  }

  return -1;
}

const WINDOWS_TZ_TO_IANA: Record<string, string> = {
  UTC: "UTC",
  "GMT Standard Time": "Europe/London",
  "W. Europe Standard Time": "Europe/Berlin",
  "Central Europe Standard Time": "Europe/Budapest",
  "Romance Standard Time": "Europe/Paris",
  "Central European Standard Time": "Europe/Warsaw",
  "E. Europe Standard Time": "Europe/Bucharest",
  "Turkey Standard Time": "Europe/Istanbul",
  "Israel Standard Time": "Asia/Jerusalem",
  "Russian Standard Time": "Europe/Moscow",
  "Arab Standard Time": "Asia/Riyadh",
  "Arabian Standard Time": "Asia/Dubai",
  "India Standard Time": "Asia/Kolkata",
  "China Standard Time": "Asia/Shanghai",
  "Tokyo Standard Time": "Asia/Tokyo",
  "Korea Standard Time": "Asia/Seoul",
  "AUS Eastern Standard Time": "Australia/Sydney",
  "New Zealand Standard Time": "Pacific/Auckland",
  "Eastern Standard Time": "America/New_York",
  "Central Standard Time": "America/Chicago",
  "Mountain Standard Time": "America/Denver",
  "Pacific Standard Time": "America/Los_Angeles",
  "British Columbia Standard Time": "America/Vancouver",
  "Alaskan Standard Time": "America/Anchorage",
  "Hawaiian Standard Time": "Pacific/Honolulu",
  "Central Standard Time (Mexico)": "America/Mexico_City",
  "Greenwich Standard Time": "Atlantic/Reykjavik",
  "SE Asia Standard Time": "Asia/Bangkok",
};

const DISPLAY_TZ_TO_IANA = [
  { pattern: /eastern time/i, zone: "America/New_York" },
  { pattern: /central time/i, zone: "America/Chicago" },
  { pattern: /mountain time/i, zone: "America/Denver" },
  { pattern: /pacific time/i, zone: "America/Los_Angeles" },
] as const;

const IANA_ZONE_SET = new Set(Intl.supportedValuesOf("timeZone"));

function unfoldIcsLines(input: string) {
  const normalized = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rawLines = normalized.split("\n");
  const unfolded: string[] = [];

  for (const line of rawLines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += line.slice(1);
    } else {
      unfolded.push(line);
    }
  }

  return unfolded.map((line) => line.trim()).filter(Boolean);
}
