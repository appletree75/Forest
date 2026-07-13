"use server";

import { getSessionUser } from "@/lib/auth";
import { addApiKey, removeApiKey, selectApiKey } from "@/lib/ai-settings";
import { createAuditLog } from "@/lib/audit-log";

type ActionState = {
  message: string;
};

export async function addApiKeyAction(_: ActionState, formData: FormData) {
  const user = await getSessionUser();

  if (!user || user.role !== "admin") {
    return { message: "Only administrators can manage API keys." };
  }

  try {
    const provider = String(formData.get("provider") ?? "deepseek");
    const name = String(formData.get("name") ?? "");
    const apiKey = String(formData.get("apiKey") ?? "");

    const created = await addApiKey({ provider, name, apiKey });
    await createAuditLog({
      actorUserId: user.id,
      actorEmail: user.email,
      action: "settings.api_key_added",
      targetType: "api_key",
      targetId: created.id,
      targetLabel: created.name,
      metadata: { provider: created.provider },
    });

    return { message: "API key added." };
  } catch (error) {
    return {
      message:
        error instanceof Error ? error.message : "Unable to add API key.",
    };
  }
}

export async function selectApiKeyAction(_: ActionState, formData: FormData) {
  const user = await getSessionUser();

  if (!user || user.role !== "admin") {
    return { message: "Only administrators can manage API keys." };
  }

  const id = String(formData.get("id") ?? "").trim();

  if (!id) {
    return { message: "API key is required." };
  }

  await selectApiKey(id);
  await createAuditLog({
    actorUserId: user.id,
    actorEmail: user.email,
    action: "settings.api_key_selected",
    targetType: "api_key",
    targetId: id,
    targetLabel: id,
  });

  return { message: "API key selected." };
}

export async function removeApiKeyAction(_: ActionState, formData: FormData) {
  const user = await getSessionUser();

  if (!user || user.role !== "admin") {
    return { message: "Only administrators can manage API keys." };
  }

  const id = String(formData.get("id") ?? "").trim();

  if (!id) {
    return { message: "API key is required." };
  }

  await removeApiKey(id);
  await createAuditLog({
    actorUserId: user.id,
    actorEmail: user.email,
    action: "settings.api_key_removed",
    targetType: "api_key",
    targetId: id,
    targetLabel: id,
  });

  return { message: "API key removed." };
}
