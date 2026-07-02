"use server";

import { revalidateTag } from "next/cache";

import { getSessionUser } from "@/lib/auth";
import { createProfile, deleteProfile, updateProfile } from "@/lib/profiles";

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

  return {
    message: "Profile updated.",
  };
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

  return {
    message: "Profile created.",
  };
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

  await deleteProfile(id);

  revalidateTag("profiles");
  revalidateTag("profile-assignments");

  return {
    message: "Profile deleted.",
  };
}
