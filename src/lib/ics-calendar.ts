import { DateTime } from "luxon";

import { extractMeetingLinkFromText } from "@/lib/meeting-link";
import type {
  IcsCalendarSource,
  ImportedCalendarEvent,
  ImportedCalendarEventOverride,
} from "@/lib/types";

export async function importIcsEventsForSources(sources: IcsCalendarSource[]) {
  const results = await Promise.all(
    sources.map(async (source) => {
      try {
        const response = await fetch(source.url, {
          cache: "no-store",
          headers: {
            Accept: "text/calendar,text/plain;q=0.9,*/*;q=0.8",
          },
        });

        if (!response.ok) {
          return [] as ImportedCalendarEvent[];
        }

        const text = await response.text();
        return parseIcsCalendar(text, source);
      } catch {
        return [] as ImportedCalendarEvent[];
      }
    }),
  );

  return results.flat();
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
      color: override.color || event.color,
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
  const events: ImportedCalendarEvent[] = [];
  let current: Record<string, string> | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = {};
      continue;
    }

    if (line === "END:VEVENT") {
      const parsed = buildImportedEvent(current, source);

      if (parsed) {
        events.push(parsed);
      }

      current = null;
      continue;
    }

    if (!current) {
      continue;
    }

    const separatorIndex = line.indexOf(":");

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
) {
  if (!raw) {
    return null;
  }

  const startEntry = findEntry(raw, "DTSTART");
  const endEntry = findEntry(raw, "DTEND");

  if (!startEntry) {
    return null;
  }

  const start = parseIcsDateValue(startEntry.key, startEntry.value);
  const end = parseIcsDateValue(endEntry?.key ?? "", endEntry?.value ?? "");

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

  return {
    id: `${source.id}:${raw.UID ?? `${start.date.toISOString()}:${raw.SUMMARY ?? "busy"}`}`,
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

function parseIcsDateValue(key: string, value: string) {
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
    parseDateTimeWithZone(compact, isUtc ? "UTC" : normalizedZone) ??
    parseDateTimeWithZone(compact, "local");

  return {
    date: parsedDateTime?.toJSDate() ?? new Date(compact),
    allDay: false,
  };
}

function extractTzid(key: string) {
  const match = key.match(/TZID=([^;:]+)/i);

  if (!match) {
    return null;
  }

  return match[1].replace(/^"+|"+$/g, "").trim();
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
  const trimmed = tzid.trim();

  if (IANA_ZONE_SET.has(trimmed)) {
    return trimmed;
  }

  return WINDOWS_TZ_TO_IANA[trimmed] ?? trimmed;
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
  "Alaskan Standard Time": "America/Anchorage",
  "Hawaiian Standard Time": "Pacific/Honolulu",
};

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
