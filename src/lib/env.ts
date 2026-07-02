type ServerEnv = {
  databaseUrl: string;
  nodeEnv: string;
  googleClientId: string;
  googleClientSecret: string;
  googleRedirectUri: string;
  googleCalendarConfigured: boolean;
};

let cachedEnv: ServerEnv | null = null;
let warnedAboutGoogleConfig = false;

export function getServerEnv(): ServerEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
  const nodeEnv = process.env.NODE_ENV?.trim() || "development";
  const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim() ?? "";
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "";
  const googleRedirectUri = process.env.GOOGLE_REDIRECT_URI?.trim() ?? "";

  if (!databaseUrl) {
    throw new Error("Missing required environment variable: DATABASE_URL");
  }

  const googleFields = [googleClientId, googleClientSecret, googleRedirectUri];
  const configuredGoogleFields = googleFields.filter(Boolean).length;
  const googleCalendarConfigured = configuredGoogleFields === googleFields.length;

  if (
    configuredGoogleFields > 0 &&
    !googleCalendarConfigured &&
    !warnedAboutGoogleConfig
  ) {
    warnedAboutGoogleConfig = true;
    console.warn(
      "Google Calendar env vars are partially configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI together.",
    );
  }

  cachedEnv = {
    databaseUrl,
    nodeEnv,
    googleClientId,
    googleClientSecret,
    googleRedirectUri,
    googleCalendarConfigured,
  };

  return cachedEnv;
}

export function validateServerEnv() {
  return getServerEnv();
}
