import { getSelectedApiKey } from "@/lib/ai-settings";
import {
  formatOpenAiReachabilityError,
  postOpenAiJson,
} from "@/lib/openai-endpoint";

const OPENAI_IMAGE_MODEL = "dall-e-3";
const OPENAI_IMAGE_SIZE = "1024x1024";
const OPENAI_IMAGE_TIMEOUT_MS = 90_000;

export type GeneratedAiImage = {
  name: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
  revisedPrompt?: string;
};

export async function createAiImageGeneration(input: {
  prompt: string;
}): Promise<GeneratedAiImage> {
  const selectedKey = await getSelectedApiKey();

  if (!selectedKey?.apiKey) {
    throw new Error("No API key is selected in Settings.");
  }

  const provider = selectedKey.provider.trim().toLowerCase();
  if (provider !== "openai") {
    throw new Error(
      `Image generation requires an OpenAI key. The selected provider is "${selectedKey.provider}". Select OpenAI in Settings.`,
    );
  }

  const prompt = input.prompt.trim();
  if (!prompt) {
    throw new Error("Describe the image you want to generate.");
  }

  let response: { status: number; body: string };
  try {
    response = await postOpenAiJson({
      path: "/images/generations",
      apiKey: selectedKey.apiKey,
      timeoutMs: OPENAI_IMAGE_TIMEOUT_MS,
      body: {
        model: OPENAI_IMAGE_MODEL,
        prompt,
        n: 1,
        size: OPENAI_IMAGE_SIZE,
        response_format: "b64_json",
      },
    });
  } catch (error) {
    throw new Error(formatOpenAiReachabilityError(error, "image generation"));
  }

  if (response.status < 200 || response.status >= 300) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("OpenAI rejected the selected API key. Check it in Settings.");
    }
    if (response.status === 429) {
      throw new Error("OpenAI rate limit or quota reached. Check your account and try again.");
    }

    const detail = readOpenAiErrorMessage(response.body);
    throw new Error(
      detail ||
        `OpenAI image generation failed (HTTP ${response.status}). Confirm the key can use ${OPENAI_IMAGE_MODEL}.`,
    );
  }

  let payload: {
    data?: Array<{ b64_json?: string; revised_prompt?: string }>;
  };
  try {
    payload = JSON.parse(response.body) as typeof payload;
  } catch {
    throw new Error("OpenAI returned an invalid image response.");
  }

  const image = payload.data?.[0];
  const b64 = image?.b64_json?.trim();
  if (!b64) {
    throw new Error("OpenAI returned an empty image response.");
  }

  const mimeType = "image/png";
  const dataUrl = `data:${mimeType};base64,${b64}`;
  const sizeBytes = Math.round((b64.length * 3) / 4);

  return {
    name: "ai-generated.png",
    mimeType,
    sizeBytes,
    dataUrl,
    revisedPrompt: image?.revised_prompt?.trim() || undefined,
  };
}

function readOpenAiErrorMessage(body: string) {
  try {
    const payload = JSON.parse(body) as { error?: { message?: string } };
    return payload.error?.message?.trim() || "";
  } catch {
    return "";
  }
}
