const MEETING_HOST_PATTERN =
  /(?:^|\.)(teams\.microsoft\.com|meet\.google\.com|zoom\.us|webex\.com|whereby\.com|gotomeeting\.com|breezy\.hr|hireflix\.com|willo\.video|app\.cal\.com|cal\.com|careers\.corsearch\.com)$/i;

const URL_PATTERN = /https?:\/\/[^\s<>"')]+/gi;
const HTML_HREF_PATTERN = /href=["']([^"']+)["']/gi;
const MEETING_CONTEXT_PATTERN =
  /\b(video call|meeting link|join (?:meeting|call)|interview link|conference link|call link|meeting url)\b/i;

export function extractMeetingLinkFromText(...chunks: Array<string | null | undefined>) {
  const candidates = new Map<string, string>();

  for (const chunk of chunks) {
    const normalized = normalizeInvitationText(chunk);

    if (!normalized) {
      continue;
    }

    for (const match of normalized.matchAll(HTML_HREF_PATTERN)) {
      const candidate = sanitizeUrl(match[1]);

      if (candidate) {
        candidates.set(candidate, normalized);
      }
    }

    for (const match of normalized.matchAll(URL_PATTERN)) {
      const candidate = sanitizeUrl(match[0]);
      const context = getUrlContext(normalized, match.index ?? 0);

      if (candidate) {
        candidates.set(candidate, context);
      }
    }
  }

  for (const candidate of candidates.keys()) {
    if (isMeetingLink(candidate)) {
      return candidate;
    }
  }

  for (const [candidate, context] of candidates.entries()) {
    if (MEETING_CONTEXT_PATTERN.test(context)) {
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

function getUrlContext(source: string, matchIndex: number) {
  const lineStart = source.lastIndexOf("\n", Math.max(matchIndex - 1, 0));
  const lineEnd = source.indexOf("\n", matchIndex);

  return source
    .slice(lineStart === -1 ? 0 : lineStart + 1, lineEnd === -1 ? source.length : lineEnd)
    .trim();
}
