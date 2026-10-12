import { createAiChatCompletion } from "@/lib/ai-chat";

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

  return createAiChatCompletion({
    maxTokens: 1800,
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
  });
}
