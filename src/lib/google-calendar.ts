import { randomUUID } from "node:crypto";

import {
  deleteGoogleCalendarConnection,
  deleteGoogleCalendarEventLink,
  getGoogleCalendarConnections,
  getGoogleCalendarEventLink,
  upsertGoogleCalendarConnection,
  upsertGoogleCalendarEventLink,
  type GoogleCalendarConnection,
} from "@/lib/google-calendar-storage";
import type { InterviewEvent } from "@/lib/types";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const GOOGLE_CALENDAR_BASE_URL = "https://www.googleapis.com/calendar/v3";
const GOOGLE_SCOPE = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar",
].join(" ");

type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
};

export function createGoogleOauthState() {
  return randomUUID();
}

export function getGoogleCalendarConfig(origin?: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ??
    (origin ? `${origin}/api/google-calendar/callback` : "");

  return {
    clientId,
    clientSecret,
    redirectUri,
  };
}

export function isGoogleCalendarConfigured(origin?: string) {
  const config = getGoogleCalendarConfig(origin);
  return Boolean(config.clientId && config.clientSecret);
}

export function buildGoogleAuthorizationUrl(state: string, origin?: string) {
  const config = getGoogleCalendarConfig(origin);
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: GOOGLE_SCOPE,
    state,
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeGoogleCodeForTokens(code: string, origin?: string) {
  const config = getGoogleCalendarConfig(origin);
  const params = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Unable to exchange Google authorization code.");
  }

  return (await response.json()) as GoogleTokenResponse;
}

export async function fetchGoogleUserProfile(accessToken: string) {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Unable to fetch Google user profile.");
  }

  return (await response.json()) as { email?: string };
}

export async function saveGoogleCalendarConnection(
  userId: string,
  code: string,
  origin?: string,
) {
  const tokens = await exchangeGoogleCodeForTokens(code, origin);
  const profile = await fetchGoogleUserProfile(tokens.access_token);
  const existingConnections = await getGoogleCalendarConnections(userId);
  const existing = existingConnections.find(
    (connection) =>
      connection.email.toLowerCase() === (profile.email ?? "").toLowerCase(),
  );

  return upsertGoogleCalendarConnection({
    userId,
    email: profile.email ?? existing?.email ?? "",
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? existing?.refreshToken ?? "",
    expiryDate: Date.now() + tokens.expires_in * 1000,
    scope: tokens.scope,
    calendarId: existing?.calendarId ?? "primary",
  });
}

export async function revokeGoogleCalendarConnection(
  userId: string,
  connectionId: string,
) {
  const connections = await getGoogleCalendarConnections(userId);
  const existing = connections.find((connection) => connection.id === connectionId);

  if (existing?.accessToken) {
    await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(existing.accessToken)}`, {
      method: "POST",
      cache: "no-store",
    }).catch(() => undefined);
  }

  await deleteGoogleCalendarConnection(userId, connectionId);
}

export async function syncInterviewEventToGoogleCalendar(
  userId: string,
  event: InterviewEvent,
) {
  const connections = await getGoogleCalendarConnections(userId);

  await Promise.all(
    connections.map(async (connection) => {
      const accessToken = await ensureFreshGoogleAccessToken(connection);
      const existingLink = await getGoogleCalendarEventLink(connection.id, event.id);
      const body = buildGoogleCalendarEventPayload(event);

      if (existingLink) {
        const response = await fetch(
          `${GOOGLE_CALENDAR_BASE_URL}/calendars/${encodeURIComponent(connection.calendarId)}/events/${encodeURIComponent(existingLink.externalEventId)}`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
            cache: "no-store",
          },
        );

        if (response.ok) {
          return;
        }
      }

      const createResponse = await fetch(
        `${GOOGLE_CALENDAR_BASE_URL}/calendars/${encodeURIComponent(connection.calendarId)}/events`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          cache: "no-store",
        },
      );

      if (!createResponse.ok) {
        throw new Error("Unable to create Google Calendar event.");
      }

      const created = (await createResponse.json()) as { id?: string };

      if (created.id) {
        await upsertGoogleCalendarEventLink(connection.id, event.id, created.id);
      }
    }),
  );
}

export async function deleteInterviewEventFromGoogleCalendar(
  userId: string,
  localEventId: string,
) {
  const connections = await getGoogleCalendarConnections(userId);

  await Promise.all(
    connections.map(async (connection) => {
      const existingLink = await getGoogleCalendarEventLink(connection.id, localEventId);

      if (!existingLink) {
        return;
      }

      const accessToken = await ensureFreshGoogleAccessToken(connection);

      await fetch(
        `${GOOGLE_CALENDAR_BASE_URL}/calendars/${encodeURIComponent(connection.calendarId)}/events/${encodeURIComponent(existingLink.externalEventId)}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          cache: "no-store",
        },
      ).catch(() => undefined);

      await deleteGoogleCalendarEventLink(connection.id, localEventId);
    }),
  );
}

async function ensureFreshGoogleAccessToken(connection: GoogleCalendarConnection) {
  if (connection.expiryDate > Date.now() + 60_000) {
    return connection.accessToken;
  }

  if (!connection.refreshToken) {
    return connection.accessToken;
  }

  const config = getGoogleCalendarConfig();
  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: connection.refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Unable to refresh Google access token.");
  }

  const tokens = (await response.json()) as GoogleTokenResponse;

  await upsertGoogleCalendarConnection({
    userId: connection.userId,
    email: connection.email,
    accessToken: tokens.access_token,
    refreshToken: connection.refreshToken,
    expiryDate: Date.now() + tokens.expires_in * 1000,
    scope: tokens.scope ?? connection.scope,
    calendarId: connection.calendarId,
  });

  return tokens.access_token;
}

function buildGoogleCalendarEventPayload(event: InterviewEvent) {
  const start = new Date(`${event.scheduledDate}T${event.scheduledTime}:00`);
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + event.durationMinutes);
  const description = [
    Number.isFinite(event.step) && event.step > 0 ? `Step: ${event.step}` : "",
    event.notes.trim(),
    event.meetingLink.trim() ? `Meeting link: ${event.meetingLink.trim()}` : "",
    event.jdLink.trim() ? `JD: ${event.jdLink.trim()}` : "",
    event.resumeLink.trim() ? `Resume: ${event.resumeLink.trim()}` : "",
    event.docLink.trim() ? `Doc: ${event.docLink.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    summary: event.title,
    description: description || undefined,
    start: {
      dateTime: start.toISOString(),
    },
    end: {
      dateTime: end.toISOString(),
    },
  };
}
