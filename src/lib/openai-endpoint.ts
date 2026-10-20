import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

export function getOpenAiBaseUrl() {
  const configured = process.env.OPENAI_BASE_URL?.trim();
  return (configured || DEFAULT_OPENAI_BASE_URL).replace(/\/+$/, "");
}

export function resolveOpenAiUrl(path: string) {
  const base = getOpenAiBaseUrl();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return new URL(`${base}${normalizedPath}`);
}

export async function postOpenAiJson(input: {
  path: string;
  apiKey: string;
  body: Record<string, unknown>;
  timeoutMs: number;
}) {
  const target = resolveOpenAiUrl(input.path);
  const payload = JSON.stringify(input.body);
  const transport = target.protocol === "http:" ? httpRequest : httpsRequest;

  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = transport(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || undefined,
        path: `${target.pathname}${target.search}`,
        method: "POST",
        family: 4,
        timeout: input.timeoutMs,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${input.apiKey}`,
          "Content-Length": Buffer.byteLength(payload),
          "User-Agent": "NexOpenAI/1.0",
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer | string) => {
          chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
        });
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
        res.on("error", reject);
      },
    );

    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`timed out after ${input.timeoutMs}ms`));
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

export function formatOpenAiReachabilityError(error: unknown, action: string) {
  const detail = getErrorDetail(error);
  const baseUrl = getOpenAiBaseUrl();

  if (/timed out|TIMEOUT|ECONNRESET|ENOTFOUND|ECONNREFUSED/i.test(detail)) {
    return `OpenAI could not be reached for ${action} via ${baseUrl}. This network cannot connect to that host. Use a VPN, or set OPENAI_BASE_URL to an OpenAI-compatible relay in .env.`;
  }

  if (detail) {
    return `OpenAI could not be reached for ${action} via ${baseUrl} (${detail}).`;
  }

  return `OpenAI could not be reached for ${action} via ${baseUrl}.`;
}

function getErrorDetail(error: unknown) {
  if (!(error instanceof Error)) {
    return "";
  }

  const withCause = error as Error & { code?: string; cause?: unknown };
  const cause =
    withCause.cause instanceof Error
      ? withCause.cause.message
      : typeof withCause.cause === "string"
        ? withCause.cause
        : "";
  const code = typeof withCause.code === "string" ? withCause.code : "";

  return [code, error.message, cause].filter(Boolean).join(": ");
}
