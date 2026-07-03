const MEETING_HOST_PATTERN =
  /(?:^|\.)(teams\.microsoft\.com|meet\.google\.com|zoom\.us|webex\.com|whereby\.com|gotomeeting\.com)$/i;

const URL_PATTERN = /https?:\/\/[^\s<>"')]+/gi;
const HTML_HREF_PATTERN = /href=["']([^"']+)["']/gi;

export function extractMeetingLinkFromText(...chunks: Array<string | null | undefined>) {
  const candidates = new Set<string>();

  for (const chunk of chunks) {
    const normalized = normalizeInvitationText(chunk);

    if (!normalized) {
      continue;
    }

    for (const match of normalized.matchAll(HTML_HREF_PATTERN)) {
      const candidate = sanitizeUrl(match[1]);

      if (candidate) {
        candidates.add(candidate);
      }
    }

    for (const match of normalized.matchAll(URL_PATTERN)) {
      const candidate = sanitizeUrl(match[0]);

      if (candidate) {
        candidates.add(candidate);
      }
    }
  }

  for (const candidate of candidates) {
    if (isMeetingLink(candidate)) {
      return candidate;
    }
  }

  return "";
}

function isMeetingLink(value: string) {
  try {
    const url = new URL(value);
    return MEETING_HOST_PATTERN.test(url.hostname);
  } catch {
    return false;
  }
}

function sanitizeUrl(value: string) {
  const trimmed = String(value ?? "").trim();

  if (!trimmed) {
    return "";
  }

  const unescaped = trimmed
    .replace(/&amp;/gi, "&")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\n/gi, "\n");

  return unescaped.replace(/[)\].,;]+$/g, "");
}

function normalizeInvitationText(value: string | null | undefined) {
  const trimmed = String(value ?? "").trim();

  if (!trimmed) {
    return "";
  }

  return trimmed
    .replace(/\\n/gi, "\n")
    .replace(/\\\\/g, "\\")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}
