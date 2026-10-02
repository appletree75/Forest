import { redirect } from "next/navigation";

import { InterviewRoom } from "@/components/interview/interview-room";
import { getSessionUser } from "@/lib/auth";
import {
  buildInterviewRoomKey,
  getInterviewRoomState,
  touchInterviewRoomPresence,
} from "@/lib/interview-room";
import { getInterviewEventById } from "@/lib/interview-storage";

export default async function InterviewRoomPage({
  searchParams,
}: {
  searchParams: Promise<{
    type?: string;
    id?: string;
    title?: string;
    meetingLink?: string;
  }>;
}) {
  const [user, params] = await Promise.all([getSessionUser(), searchParams]);

  if (!user) {
    redirect("/login");
  }

  const eventType = params.type === "imported" ? "imported" : "local";
  const eventId = params.id?.trim() || "";

  if (!eventId) {
    redirect("/interview");
  }

  const roomKey = buildInterviewRoomKey(eventType, eventId);

  await touchInterviewRoomPresence({
    roomKey,
    userId: user.id,
    userName: user.name,
    userRole: user.role,
  });

  const [state, localEvent] = await Promise.all([
    getInterviewRoomState(roomKey),
    eventType === "local" ? getInterviewEventById(eventId) : Promise.resolve(null),
  ]);
  const meetingLink = localEvent?.meetingLink || params.meetingLink?.trim() || "";

  return (
    <InterviewRoom
      roomKey={roomKey}
      user={user}
      initialPresence={state.presence}
      initialMessages={state.messages}
      initialContext={state.context}
      meetingLink={meetingLink}
    />
  );
}
