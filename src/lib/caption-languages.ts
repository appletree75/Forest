export type CaptionLanguage = {
  code: string;
  label: string;
};

/** Languages available for live caption lock-in (ISO 639-1). */
export const CAPTION_LANGUAGES: CaptionLanguage[] = [
  { code: "en", label: "English" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "es", label: "Spanish" },
  { code: "pt", label: "Portuguese" },
  { code: "it", label: "Italian" },
  { code: "nl", label: "Dutch" },
  { code: "pl", label: "Polish" },
  { code: "ro", label: "Romanian" },
  { code: "cs", label: "Czech" },
  { code: "sv", label: "Swedish" },
  { code: "da", label: "Danish" },
  { code: "fi", label: "Finnish" },
  { code: "no", label: "Norwegian" },
  { code: "tr", label: "Turkish" },
  { code: "ru", label: "Russian" },
  { code: "uk", label: "Ukrainian" },
  { code: "ar", label: "Arabic" },
  { code: "he", label: "Hebrew" },
  { code: "hi", label: "Hindi" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "zh", label: "Chinese" },
  { code: "vi", label: "Vietnamese" },
  { code: "th", label: "Thai" },
  { code: "id", label: "Indonesian" },
];

const CAPTION_LANGUAGE_CODES = new Set(
  CAPTION_LANGUAGES.map((language) => language.code),
);

export const DEFAULT_CAPTION_LANGUAGE = "en";
export const CAPTION_LANGUAGE_STORAGE_KEY = "nex-caption-language";

const CAPTION_LANGUAGE_LOCALES: Record<string, string> = {
  en: "en-US",
  fr: "fr-FR",
  de: "de-DE",
  es: "es-ES",
  pt: "pt-BR",
  it: "it-IT",
  nl: "nl-NL",
  pl: "pl-PL",
  ro: "ro-RO",
  cs: "cs-CZ",
  sv: "sv-SE",
  da: "da-DK",
  fi: "fi-FI",
  no: "nb-NO",
  tr: "tr-TR",
  ru: "ru-RU",
  uk: "uk-UA",
  ar: "ar-SA",
  he: "he-IL",
  hi: "hi-IN",
  ja: "ja-JP",
  ko: "ko-KR",
  zh: "zh-CN",
  vi: "vi-VN",
  th: "th-TH",
  id: "id-ID",
};

export function captionLanguageToLocale(value: unknown) {
  const code = normalizeCaptionLanguage(value);
  return CAPTION_LANGUAGE_LOCALES[code] ?? "en-US";
}

export function normalizeCaptionLanguage(value: unknown) {
  const code = String(value ?? "")
    .trim()
    .toLowerCase()
    .split(/[-_]/)[0];

  if (CAPTION_LANGUAGE_CODES.has(code)) {
    return code;
  }

  return DEFAULT_CAPTION_LANGUAGE;
}

export function detectDefaultCaptionLanguage(
  locale = typeof navigator !== "undefined" ? navigator.language : DEFAULT_CAPTION_LANGUAGE,
) {
  return normalizeCaptionLanguage(locale);
}
