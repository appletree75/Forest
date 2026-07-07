const locationCache = new Map<string, string>();

type IpWhoIsResponse = {
  success?: boolean;
  city?: string;
  region?: string;
  country?: string;
};

export async function resolveSessionLocationName(ipAddress: string) {
  const normalizedIp = normalizeIpAddress(ipAddress);

  if (!normalizedIp || isPrivateOrLocalIp(normalizedIp)) {
    return "";
  }

  const cached = locationCache.get(normalizedIp);

  if (typeof cached === "string") {
    return cached;
  }

  try {
    const response = await fetch(`https://ipwho.is/${encodeURIComponent(normalizedIp)}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      next: { revalidate: 60 * 60 * 12 },
    });

    if (!response.ok) {
      locationCache.set(normalizedIp, "");
      return "";
    }

    const data = (await response.json()) as IpWhoIsResponse;

    if (data.success === false) {
      locationCache.set(normalizedIp, "");
      return "";
    }

    const locationName = [data.city, data.region, data.country]
      .map((value) => value?.trim() ?? "")
      .filter(Boolean)
      .filter((value, index, values) => values.indexOf(value) === index)
      .join(", ");

    locationCache.set(normalizedIp, locationName);
    return locationName;
  } catch {
    locationCache.set(normalizedIp, "");
    return "";
  }
}

function normalizeIpAddress(value: string) {
  return value.trim().replace(/^::ffff:/i, "");
}

function isPrivateOrLocalIp(ipAddress: string) {
  if (
    ipAddress === "127.0.0.1" ||
    ipAddress === "::1" ||
    ipAddress.toLowerCase() === "localhost"
  ) {
    return true;
  }

  if (ipAddress.includes(":")) {
    const normalized = ipAddress.toLowerCase();
    return (
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80") ||
      normalized === "::1"
    );
  }

  const parts = ipAddress.split(".").map(Number);

  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return true;
  }

  const [first, second] = parts;

  return (
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254)
  );
}
