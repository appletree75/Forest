-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('admin', 'bidder', 'caller', 'supportor');

-- CreateEnum
CREATE TYPE "public"."Platform" AS ENUM ('Linkedin', 'Indeed', 'Jobright', 'Dice');

-- CreateEnum
CREATE TYPE "public"."ApplicationStatus" AS ENUM ('Applied', 'Failed');

-- CreateEnum
CREATE TYPE "public"."InterviewStatus" AS ENUM ('Scheduled', 'Confirmed', 'Done', 'Cancelled');

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "public"."Role" NOT NULL,
    "bidderAppliedRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bidderFailedRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "callerHourlyRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Session" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ipAddress" TEXT,
    "osInfo" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Profile" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "dob" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "linkedinUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProfileAssignment" (
    "bidderUserId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileAssignment_pkey" PRIMARY KEY ("bidderUserId","profileId")
);

-- CreateTable
CREATE TABLE "public"."AppSettings" (
    "id" TEXT NOT NULL,
    "permissionMatrix" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."JobApplicationRow" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "rowId" INTEGER NOT NULL,
    "platform" "public"."Platform" NOT NULL DEFAULT 'Linkedin',
    "company" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "url" TEXT NOT NULL DEFAULT '',
    "stack" TEXT NOT NULL DEFAULT '',
    "status" "public"."ApplicationStatus",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobApplicationRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Interview" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "bidderUserId" TEXT,
    "callerUserId" TEXT,
    "title" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "meetingLink" TEXT NOT NULL DEFAULT '',
    "resumeLink" TEXT NOT NULL DEFAULT '',
    "docLink" TEXT NOT NULL DEFAULT '',
    "step" INTEGER NOT NULL DEFAULT 1,
    "scheduledDate" TEXT NOT NULL,
    "scheduledTime" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "status" "public"."InterviewStatus" NOT NULL DEFAULT 'Scheduled',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Interview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."IcsCalendarSource" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IcsCalendarSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."IcsEventOverride" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "start" TEXT NOT NULL,
    "end" TEXT NOT NULL,
    "hasLocalTitleOverride" BOOLEAN NOT NULL DEFAULT false,
    "hasLocalScheduleOverride" BOOLEAN NOT NULL DEFAULT false,
    "callerUserId" TEXT,
    "meetingLink" TEXT NOT NULL DEFAULT '',
    "resumeLink" TEXT NOT NULL DEFAULT '',
    "docLink" TEXT NOT NULL DEFAULT '',
    "step" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IcsEventOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GoogleCalendarConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiryDate" BIGINT NOT NULL,
    "scope" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleCalendarConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GoogleCalendarEventLink" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "localEventId" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleCalendarEventLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FinanceTransaction" (
    "id" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "date" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "public"."Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "public"."Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "public"."Session"("expiresAt");

-- CreateIndex
CREATE INDEX "ProfileAssignment_profileId_idx" ON "public"."ProfileAssignment"("profileId");

-- CreateIndex
CREATE INDEX "JobApplicationRow_profileId_dayKey_idx" ON "public"."JobApplicationRow"("profileId", "dayKey");

-- CreateIndex
CREATE UNIQUE INDEX "JobApplicationRow_profileId_dayKey_rowId_key" ON "public"."JobApplicationRow"("profileId", "dayKey", "rowId");

-- CreateIndex
CREATE INDEX "Interview_scheduledDate_scheduledTime_idx" ON "public"."Interview"("scheduledDate", "scheduledTime");

-- CreateIndex
CREATE INDEX "Interview_callerUserId_idx" ON "public"."Interview"("callerUserId");

-- CreateIndex
CREATE INDEX "Interview_ownerUserId_idx" ON "public"."Interview"("ownerUserId");

-- CreateIndex
CREATE INDEX "IcsCalendarSource_ownerUserId_idx" ON "public"."IcsCalendarSource"("ownerUserId");

-- CreateIndex
CREATE INDEX "IcsEventOverride_userId_idx" ON "public"."IcsEventOverride"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "IcsEventOverride_userId_eventId_key" ON "public"."IcsEventOverride"("userId", "eventId");

-- CreateIndex
CREATE INDEX "GoogleCalendarConnection_userId_idx" ON "public"."GoogleCalendarConnection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleCalendarConnection_userId_email_key" ON "public"."GoogleCalendarConnection"("userId", "email");

-- CreateIndex
CREATE INDEX "GoogleCalendarEventLink_localEventId_idx" ON "public"."GoogleCalendarEventLink"("localEventId");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleCalendarEventLink_connectionId_localEventId_key" ON "public"."GoogleCalendarEventLink"("connectionId", "localEventId");

-- CreateIndex
CREATE INDEX "FinanceTransaction_date_createdAt_idx" ON "public"."FinanceTransaction"("date", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProfileAssignment" ADD CONSTRAINT "ProfileAssignment_bidderUserId_fkey" FOREIGN KEY ("bidderUserId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProfileAssignment" ADD CONSTRAINT "ProfileAssignment_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "public"."Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."JobApplicationRow" ADD CONSTRAINT "JobApplicationRow_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "public"."Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GoogleCalendarEventLink" ADD CONSTRAINT "GoogleCalendarEventLink_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "public"."GoogleCalendarConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

