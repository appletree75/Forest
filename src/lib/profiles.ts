import { randomUUID } from "node:crypto";

import { ensureDatabaseConnected } from "@/lib/database";
import { prisma } from "@/lib/prisma";
import type {
  PersonalProfile,
  ProfileAssignmentMap,
  SessionUser,
} from "@/lib/types";

export async function getProfiles(): Promise<PersonalProfile[]> {
  await ensureDatabaseConnected();

  const profiles = await prisma.profile.findMany({
    orderBy: { fullName: "asc" },
  });

  return profiles.map((profile) => ({
    id: profile.id,
    fullName: profile.fullName,
    email: profile.email,
    dob: profile.dob,
    address: profile.address,
    phoneNumber: profile.phoneNumber,
    linkedinUrl: profile.linkedinUrl,
  }));
}

export async function getProfileAssignments(): Promise<ProfileAssignmentMap> {
  await ensureDatabaseConnected();

  const assignments = await prisma.profileAssignment.findMany();

  return assignments.reduce<ProfileAssignmentMap>((acc, assignment) => {
    acc[assignment.bidderUserId] = [
      ...(acc[assignment.bidderUserId] ?? []),
      assignment.profileId,
    ];
    return acc;
  }, {});
}

export async function setProfileAssignments(assignments: ProfileAssignmentMap) {
  await ensureDatabaseConnected();

  await prisma.$transaction([
    prisma.profileAssignment.deleteMany(),
    prisma.profileAssignment.createMany({
      data: Object.entries(assignments).flatMap(([bidderUserId, profileIds]) =>
        profileIds.map((profileId) => ({
          bidderUserId,
          profileId,
        })),
      ),
    }),
  ]);
}

export async function getBidderUsers() {
  await ensureDatabaseConnected();

  const users = await prisma.user.findMany({
    where: { role: "bidder" },
    orderBy: { name: "asc" },
  });

  return users.map(({ id, name, email, role }) => ({
    id,
    name,
    email,
    role,
  }));
}

export async function getVisibleProfilesForUser(user: SessionUser) {
  const profiles = await getProfiles();

  if (user.role !== "bidder") {
    return profiles;
  }

  const assignments = await getProfileAssignments();
  const allowedProfileIds = assignments[user.id] ?? [];

  return profiles.filter((profile) => allowedProfileIds.includes(profile.id));
}

export async function updateProfile(profile: PersonalProfile) {
  await ensureDatabaseConnected();

  const updated = await prisma.profile.update({
    where: { id: profile.id },
    data: {
      fullName: profile.fullName.trim(),
      email: profile.email.trim(),
      dob: profile.dob.trim(),
      address: profile.address.trim(),
      phoneNumber: profile.phoneNumber.trim(),
      linkedinUrl: profile.linkedinUrl.trim(),
    },
  });

  return {
    id: updated.id,
    fullName: updated.fullName,
    email: updated.email,
    dob: updated.dob,
    address: updated.address,
    phoneNumber: updated.phoneNumber,
    linkedinUrl: updated.linkedinUrl,
  } satisfies PersonalProfile;
}

export async function createProfile(
  profile: Omit<PersonalProfile, "id"> & { id?: string },
) {
  await ensureDatabaseConnected();

  const created = await prisma.profile.create({
    data: {
      id: profile.id?.trim() || randomUUID(),
      fullName: profile.fullName.trim(),
      email: profile.email.trim(),
      dob: profile.dob.trim(),
      address: profile.address.trim(),
      phoneNumber: profile.phoneNumber.trim(),
      linkedinUrl: profile.linkedinUrl.trim(),
    },
  });

  return {
    id: created.id,
    fullName: created.fullName,
    email: created.email,
    dob: created.dob,
    address: created.address,
    phoneNumber: created.phoneNumber,
    linkedinUrl: created.linkedinUrl,
  } satisfies PersonalProfile;
}

export async function deleteProfile(profileId: string) {
  await ensureDatabaseConnected();
  await prisma.profile.delete({
    where: { id: profileId },
  });
}
