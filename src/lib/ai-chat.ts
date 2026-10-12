import { getSelectedApiKey } from "@/lib/ai-settings";

type ChatMessage = { role: "system" | "user"; content: string };

export async function createAiChatCompletion(input: {
  messages: ChatMessage[];
  maxTokens: number;
}) {
  const selectedKey = await getSelectedApiKey();

  if (!selectedKey?.apiKey) {
    throw new Error("No API key is selected in Settings.");
  }

  const provider = selectedKey.provider.trim().toLowerCase();
  const config =
    provider === "openai"
      ? { url: "https://api.openai.com/v1/chat/completions", model: "gpt-4o-mini", label: "OpenAI" }
      : provider === "deepseek"
        ? { url: "https://api.deepseek.com/chat/completions", model: "deepseek-flash", label: "DeepSeek" }
        : null;

  if (!config) {
    throw new Error(`Provider "${selectedKey.provider}" is not supported. Choose OpenAI or DeepSeek in Settings.`);
  }

  let response: Response;
  try {
    response = await fetch(config.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${selectedKey.apiKey}`,
      },
      body: JSON.stringify({
        model: selectedKey.model || config.model,
        ...(provider === "openai" ? { max_completion_tokens: input.maxTokens } : { max_tokens: input.maxTokens }),
        messages: input.messages,
      }),
    });
  } catch {
    throw new Error(`${config.label} could not be reached. Try again shortly.`);
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(`${config.label} rejected the selected API key. Check its provider and key in Settings.`);
    }
    if (response.status === 429) {
      throw new Error(`${config.label} rate limit or quota reached. Check your account and try again.`);
    }
    throw new Error(`${config.label} request failed for model "${selectedKey.model || config.model}" (HTTP ${response.status}). Check that it supports Chat Completions.`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error(`${config.label} returned an empty response.`);
  }
  return content;
}
