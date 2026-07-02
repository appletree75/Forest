import { randomBytes, scryptSync } from "node:crypto";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const defaultPermissionMatrix = {
  admin: [
    "view_dashboard",
    "view_job_application",
    "view_interview",
    "view_chat",
    "view_profile",
    "view_profiles",
    "view_admin",
    "manage_permissions",
    "manage_users",
  ],
  bidder: [
    "view_dashboard",
    "view_job_application",
    "view_chat",
    "view_profile",
  ],
  caller: [
    "view_dashboard",
    "view_interview",
    "view_chat",
    "view_profile",
  ],
  supportor: ["view_dashboard", "view_chat", "view_profile"],
};

const defaultUsers = [
  {
    id: "u_admin",
    name: "Ariana Admin",
    email: "admin@forest.local",
    password: "admin123",
    role: "admin",
  },
  {
    id: "u_bidder",
    name: "Ben Bidder",
    email: "bidder@forest.local",
    password: "bidder123",
    role: "bidder",
  },
  {
    id: "u_caller",
    name: "Cora Caller",
    email: "caller@forest.local",
    password: "caller123",
    role: "caller",
  },
  {
    id: "u_supportor",
    name: "Sam Supportor",
    email: "supportor@forest.local",
    password: "supportor123",
    role: "supportor",
  },
];

const defaultProfiles = [
  {
    id: "profile_ava",
    fullName: "Ava Thompson",
    email: "ava.thompson@example.com",
    dob: "1993-04-18",
    address: "415 Cedar Ave, Austin, TX",
    phoneNumber: "+1 512 555 0134",
    linkedinUrl: "https://www.linkedin.com/in/ava-thompson",
  },
  {
    id: "profile_liam",
    fullName: "Liam Carter",
    email: "liam.carter@example.com",
    dob: "1990-09-02",
    address: "92 Franklin St, Jersey City, NJ",
    phoneNumber: "+1 201 555 0176",
    linkedinUrl: "https://www.linkedin.com/in/liam-carter",
  },
  {
    id: "profile_sophia",
    fullName: "Sophia Kim",
    email: "sophia.kim@example.com",
    dob: "1995-01-11",
    address: "808 Pine Rd, Seattle, WA",
    phoneNumber: "+1 206 555 0118",
    linkedinUrl: "https://www.linkedin.com/in/sophia-kim",
  },
  {
    id: "profile_noah",
    fullName: "Noah Patel",
    email: "noah.patel@example.com",
    dob: "1991-07-29",
    address: "155 Lake Dr, Chicago, IL",
    phoneNumber: "+1 312 555 0191",
    linkedinUrl: "https://www.linkedin.com/in/noah-patel",
  },
];

const defaultAssignments = {
  u_bidder: ["profile_ava", "profile_liam"],
};

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derivedKey}`;
}

async function main() {
  await prisma.$connect();

  await prisma.appSettings.upsert({
    where: { id: "global" },
    update: {},
    create: {
      id: "global",
      permissionMatrix: defaultPermissionMatrix,
    },
  });

  for (const user of defaultUsers) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: {
        id: user.id,
        name: user.name,
        email: user.email,
        passwordHash: hashPassword(user.password),
        role: user.role,
      },
    });
  }

  for (const profile of defaultProfiles) {
    await prisma.profile.upsert({
      where: { id: profile.id },
      update: {},
      create: profile,
    });
  }

  for (const [bidderUserId, profileIds] of Object.entries(defaultAssignments)) {
    for (const profileId of profileIds) {
      await prisma.profileAssignment.upsert({
        where: {
          bidderUserId_profileId: {
            bidderUserId,
            profileId,
          },
        },
        update: {},
        create: {
          bidderUserId,
          profileId,
        },
      });
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("Database seeded.");
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
