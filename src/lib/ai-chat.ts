import { getSelectedApiKey } from "@/lib/ai-settings";
import {
  formatOpenAiReachabilityError,
  getOpenAiBaseUrl,
  postOpenAiJson,
} from "@/lib/openai-endpoint";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function createAiChatCompletion(input: {
  messages: ChatMessage[];
  maxTokens: number;
}) {
  const selectedKey = await getSelectedApiKey();

  if (!selectedKey?.apiKey) {
    throw new Error("No API key is selected in Settings.");
  }

  const provider = selectedKey.provider.trim().toLowerCase();
  if (provider !== "openai" && provider !== "deepseek") {
    throw new Error(`Provider "${selectedKey.provider}" is not supported. Choose OpenAI or DeepSeek in Settings.`);
  }

  if (provider === "openai") {
    return createOpenAiChatCompletion({
      apiKey: selectedKey.apiKey,
      model: selectedKey.model || "gpt-4o-mini",
      messages: input.messages,
      maxTokens: input.maxTokens,
    });
  }

  return createDeepSeekChatCompletion({
    apiKey: selectedKey.apiKey,
    model: selectedKey.model || "deepseek-flash",
    messages: input.messages,
    maxTokens: input.maxTokens,
  });
}

async function createOpenAiChatCompletion(input: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
}) {
  let response: { status: number; body: string };
  try {
    response = await postOpenAiJson({
      path: "/chat/completions",
      apiKey: input.apiKey,
      timeoutMs: 60_000,
      body: {
        model: input.model,
        max_completion_tokens: input.maxTokens,
        messages: input.messages,
      },
    });
  } catch (error) {
    throw new Error(formatOpenAiReachabilityError(error, "chat"));
  }

  if (response.status < 200 || response.status >= 300) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("OpenAI rejected the selected API key. Check its provider and key in Settings.");
    }
    if (response.status === 429) {
      throw new Error("OpenAI rate limit or quota reached. Check your account and try again.");
    }
    throw new Error(
      `OpenAI request failed for model "${input.model}" (HTTP ${response.status}) via ${getOpenAiBaseUrl()}.`,
    );
  }

  return readChatContent(response.body, "OpenAI");
}

async function createDeepSeekChatCompletion(input: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
}) {
  let response: Response;
  try {
    response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        model: input.model,
        max_tokens: input.maxTokens,
        messages: input.messages,
      }),
    });
  } catch {
    throw new Error("DeepSeek could not be reached. Try again shortly.");
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("DeepSeek rejected the selected API key. Check its provider and key in Settings.");
    }
    if (response.status === 429) {
      throw new Error("DeepSeek rate limit or quota reached. Check your account and try again.");
    }
    throw new Error(
      `DeepSeek request failed for model "${input.model}" (HTTP ${response.status}). Check that it supports Chat Completions.`,
    );
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("DeepSeek returned an empty response.");
  }
  return content;
}

function readChatContent(body: string, label: string) {
  let payload: { choices?: Array<{ message?: { content?: string } }> };
  try {
    payload = JSON.parse(body) as typeof payload;
  } catch {
    throw new Error(`${label} returned an invalid response.`);
  }
  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error(`${label} returned an empty response.`);
  }
  return content;
}
