import { ProfileDirectory } from "@/components/profiles/profile-directory";
import { getProfiles } from "@/lib/profiles";

export default async function ProfilesPage() {
  const profiles = await getProfiles();

  return <ProfileDirectory profiles={profiles} />;
}
