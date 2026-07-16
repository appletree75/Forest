import { DiscussionWorkspace } from "@/components/discussion/discussion-workspace";
import { requireSession } from "@/lib/auth";
import {
  getDiscussionRoomsForUser,
  getDiscussionVisibleUsersForUser,
} from "@/lib/discussion";

export default async function ChatPage() {
  const user = await requireSession();
  const [rooms, users] = await Promise.all([
    getDiscussionRoomsForUser(user),
    getDiscussionVisibleUsersForUser(user),
  ]);

  return (
    <DiscussionWorkspace
      currentUser={user}
      initialRooms={rooms}
      initialUsers={users}
    />
  );
}
