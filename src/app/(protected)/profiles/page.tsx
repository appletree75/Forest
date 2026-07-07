import { ProfileDirectory } from "@/components/profiles/profile-directory";
import { getSessionUser } from "@/lib/auth";
import { getProfiles } from "@/lib/profiles";

export default async function ProfilesPage() {
  const user = await getSessionUser();
  const profiles = await getProfiles();
  const directoryKey = profiles
    .map(
      (profile) =>
        `${profile.id}:${profile.fullName}:${profile.email}:${profile.dob}:${profile.address}:${profile.phoneNumber}:${profile.linkedinUrl}`,
    )
    .join("|");

  return (
    <ProfileDirectory
      key={directoryKey}
      profiles={profiles}
      canManage={user?.role === "admin"}
    />
  );
}
