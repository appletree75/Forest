import { getSelectedApiKey } from "@/lib/ai-settings";
import { isDatabaseUnavailable } from "@/lib/database";

type DeepSeekResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
};

export async function buildTailoredResume(input: {
  profileName?: string;
  jd: string;
  baseResume: string;
  instructions?: string;
}): Promise<string> {
  const profileName = input.profileName?.trim() || "";
  const jd = input.jd.trim();
  const baseResume = input.baseResume.trim();
  const instructions = input.instructions?.trim() || "";

  if (!jd || !baseResume) {
    throw new Error("JD and basic resume are required.");
  }

  let selectedKey;

  try {
    selectedKey = await getSelectedApiKey();
  } catch (error) {
    if (!isDatabaseUnavailable(error)) {
      throw error;
    }

    selectedKey = null;
  }

  if (!selectedKey?.apiKey) {
    throw new Error("No API key is configured for resume builder.");
  }

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${selectedKey.apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      temperature: 0.2,
      max_tokens: 1800,
      messages: [
        {
          role: "system",
          content: `You are a resume tailoring assistant for recruiters and bidders.

Your task is to rewrite a candidate resume so it better matches a target job description.

Follow these rules:
- Keep every fact truthful to the provided base resume.
- Do not invent employers, projects, dates, education, certificates, titles, or skills.
- Emphasize the most relevant experience, tools, and outcomes from the base resume.
- Make the result ATS-friendly and easy to scan.
- Use clear plain English.
- Keep the result concise but strong.
- Use section headers when useful.
- Return only the tailored resume content.`,
        },
        {
          role: "user",
          content: `Create a tailored resume using the material below.

[PROFILE NAME]
${profileName || "(not provided)"}

[JOB DESCRIPTION]
${jd}

[BASE RESUME]
${baseResume}

[SPECIAL INSTRUCTIONS]
${instructions || "(none)"}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let message = errorText.trim() || "Resume builder request failed.";

    try {
      const payload = JSON.parse(errorText) as DeepSeekResponse;
      const providerMessage = payload.error?.message?.trim();

      if (providerMessage) {
        message = providerMessage;
      }
    } catch {
      // Keep the raw text fallback when the provider response is not JSON.
    }

    if (/api key/i.test(message) || /authentication/i.test(message)) {
      message =
        "The selected DeepSeek API key is invalid. Update the active API key in Settings and try again.";
    }

    throw new Error(message);
  }

  const payload = (await response.json()) as DeepSeekResponse;
  const result = payload.choices?.[0]?.message?.content?.trim() || "";

  if (!result) {
    throw new Error("Resume builder returned an empty result.");
  }

  return result;
}
