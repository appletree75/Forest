import { ApiKeySettings } from "@/components/settings/api-key-settings";
import { AccessGuard } from "@/components/ui/access-guard";
import { getApiKeys } from "@/lib/ai-settings";

export default async function SettingsPage() {
  const apiKeys = await getApiKeys();

  return (
    <AccessGuard permission="view_settings">
      <ApiKeySettings apiKeys={apiKeys} />
    </AccessGuard>
  );
}
