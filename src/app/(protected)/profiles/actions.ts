"use server";

import { revalidatePath, revalidateTag } from "next/cache";

import { getSessionUser } from "@/lib/auth";
import {
  createProfile,
  deleteProfile,
  reorderProfiles,
  updateProfile,
} from "@/lib/profiles";

type ActionState = {
  message: string;
};

export async function updateProfileAction(_: ActionState, formData: FormData) {
  const user = await getSessionUser();

  if (!user || user.role !== "admin") {
    return {
      message: "Only administrators can update profiles.",
    };
  }

  const id = String(formData.get("id") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const dob = String(formData.get("dob") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const phoneNumber = String(formData.get("phoneNumber") ?? "").trim();
  const linkedinUrl = String(formData.get("linkedinUrl") ?? "").trim();

  if (!id || !fullName) {
    return {
      message: "Profile name is required.",
    };
  }

  try {
    await updateProfile({
      id,
      fullName,
      email,
      dob,
      address,
      phoneNumber,
      linkedinUrl,
    });

    revalidateTag("profiles");
    revalidatePath("/profiles");

    return {
      message: "Profile updated.",
    };
  } catch {
    return {
      message: "Unable to update profile.",
    };
  }
}

export async function createProfileAction(_: ActionState, formData: FormData) {
  const user = await getSessionUser();

  if (!user || user.role !== "admin") {
    return {
      message: "Only administrators can create profiles.",
    };
  }

  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const dob = String(formData.get("dob") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const phoneNumber = String(formData.get("phoneNumber") ?? "").trim();
  const linkedinUrl = String(formData.get("linkedinUrl") ?? "").trim();

  if (!fullName) {
    return {
      message: "Profile name is required.",
    };
  }

  try {
    await createProfile({
      fullName,
      email,
      dob,
      address,
      phoneNumber,
      linkedinUrl,
    });

    revalidateTag("profiles");
    revalidateTag("profile-assignments");
    revalidatePath("/profiles");

    return {
      message: "Profile created.",
    };
  } catch {
    return {
      message: "Unable to create profile.",
    };
  }
}

export async function deleteProfileAction(_: ActionState, formData: FormData) {
  const user = await getSessionUser();

  if (!user || user.role !== "admin") {
    return {
      message: "Only administrators can delete profiles.",
    };
  }

  const id = String(formData.get("id") ?? "").trim();

  if (!id) {
    return {
      message: "Profile ID is required.",
    };
  }

  try {
    await deleteProfile(id);

    revalidateTag("profiles");
    revalidateTag("profile-assignments");
    revalidatePath("/profiles");

    return {
      message: "Profile deleted.",
    };
  } catch {
    return {
      message: "Unable to delete profile.",
    };
  }
}

export async function reorderProfilesAction(profileIds: string[]) {
  const user = await getSessionUser();

  if (!user || user.role !== "admin") {
    return {
      message: "Only administrators can reorder profiles.",
    };
  }

  if (!Array.isArray(profileIds) || profileIds.length === 0) {
    return {
      message: "No profiles to reorder.",
    };
  }

  try {
    await reorderProfiles(profileIds);

    revalidateTag("profiles");
    revalidateTag("profile-assignments");
    revalidatePath("/profiles");
    revalidatePath("/job-application");
    revalidatePath("/admin");

    return {
      message: "Profile order updated.",
    };
  } catch {
    return {
      message: "Unable to reorder profiles.",
    };
  }
}
