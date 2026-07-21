"use client";

import type {
  ChangeEvent,
  ClipboardEvent,
  DragEvent,
  KeyboardEvent,
  ReactNode,
} from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import type {
  DiscussionMessage,
  DiscussionRoom,
  ManagedUser,
  SessionUser,
} from "@/lib/types";

type DiscussionWorkspaceProps = {
  currentUser: SessionUser;
  initialRooms: DiscussionRoom[];
  initialUsers: ManagedUser[];
};

type AttachmentDraft = {
  id: string;
  file: File;
  previewUrl: string;
};

type ImagePreviewState = {
  src: string;
  name: string;
};

type PendingMessage = DiscussionMessage & {
  pending?: boolean;
};

export function DiscussionWorkspace({
  currentUser,
  initialRooms,
  initialUsers,
}: DiscussionWorkspaceProps) {
  const [rooms, setRooms] = useState(initialRooms);
  const [users] = useState(initialUsers);
  const [selectedRoomId, setSelectedRoomId] = useState(initialRooms[0]?.id ?? "");
  const [messagesByRoom, setMessagesByRoom] = useState<Record<string, PendingMessage[]>>({});
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const [newRoomModalOpen, setNewRoomModalOpen] = useState(false);
  const [roomNameDraft, setRoomNameDraft] = useState("");
  const [roomSearch, setRoomSearch] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [submittingRoom, setSubmittingRoom] = useState(false);
  const [savingMembers, setSavingMembers] = useState(false);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [imagePreview, setImagePreview] = useState<ImagePreviewState | null>(null);
  const [isRoomListCollapsed, setIsRoomListCollapsed] = useState(false);
  const [isRoomSettingsOpen, setIsRoomSettingsOpen] = useState(false);
  const [messageAlignment, setMessageAlignment] = useState<
    "split" | "single-left" | "single-right"
  >(() => {
    if (typeof window === "undefined") {
      return "split";
    }

    const savedAlignment = window.localStorage.getItem("nex-discussion-message-alignment");
    if (savedAlignment === "single-left" || savedAlignment === "single-right") {
      return savedAlignment;
    }

    return "split";
  });
  const [roomSettingsAlignmentDraft, setRoomSettingsAlignmentDraft] = useState<
    "split" | "single-left" | "single-right"
  >("split");
  const [roomSettingsInitialAlignment, setRoomSettingsInitialAlignment] = useState<
    "split" | "single-left" | "single-right"
  >("split");
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const draftInputRef = useRef<HTMLTextAreaElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const shouldFollowScrollRef = useRef(true);

  const isAdmin = currentUser.role === "admin";
  const effectiveSelectedRoomId = useMemo(() => {
    if (selectedRoomId && rooms.some((room) => room.id === selectedRoomId)) {
      return selectedRoomId;
    }

    return rooms[0]?.id ?? "";
  }, [rooms, selectedRoomId]);
  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === effectiveSelectedRoomId) ?? null,
    [effectiveSelectedRoomId, rooms],
  );
  const selectedRoomMessages = useMemo(
    () => messagesByRoom[effectiveSelectedRoomId] ?? [],
    [effectiveSelectedRoomId, messagesByRoom],
  );
  const selectedRoomMembers = useMemo(() => {
    if (!selectedRoom) {
      return [];
    }

    const members = new Map<string, { id: string; name: string }>();

    selectedRoom.members.forEach((member) => {
      if (member.id && member.name) {
        members.set(member.id, {
          id: member.id,
          name: member.name,
        });
      }
    });

    selectedRoom.memberUserIds.forEach((memberUserId) => {
      if (members.has(memberUserId)) {
        return;
      }

      const matchedUser = users.find((user) => user.id === memberUserId);

      if (matchedUser) {
        members.set(memberUserId, {
          id: matchedUser.id,
          name: matchedUser.name,
        });
        return;
      }

      const matchedMessageAuthor = selectedRoomMessages.find(
        (message) => message.userId === memberUserId,
      );

      members.set(memberUserId, {
        id: memberUserId,
        name: matchedMessageAuthor?.userName || "Member",
      });
    });

    if (members.size === 0) {
      selectedRoomMessages.forEach((message) => {
        if (!members.has(message.userId)) {
          members.set(message.userId, {
            id: message.userId,
            name: message.userName,
          });
        }
      });
    }

    return Array.from(members.values());
  }, [selectedRoom, selectedRoomMessages, users]);
  const filteredRooms = useMemo(() => {
    const keyword = roomSearch.trim().toLowerCase();

    if (!keyword) {
      return rooms;
    }

    return rooms.filter((room) => room.name.toLowerCase().includes(keyword));
  }, [roomSearch, rooms]);
  const messages = selectedRoomMessages;

  useEffect(() => {
    if (!effectiveSelectedRoomId) {
      return;
    }

    let cancelled = false;

    const loadMessages = async () => {
      setLoadingMessages(true);

      try {
        const response = await fetch(
          `/api/discussion/messages?roomId=${encodeURIComponent(effectiveSelectedRoomId)}`,
          { cache: "no-store" },
        );

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as {
          messages?: DiscussionMessage[];
          degraded?: boolean;
        };

        if (cancelled || payload.degraded || !payload.messages) {
          return;
        }

        setMessagesByRoom((current) => {
          const nextMessages = payload.messages ?? [];
          const currentMessages = current[effectiveSelectedRoomId] ?? [];

          if (
            currentMessages.length >= 6 &&
            nextMessages.length <= Math.floor(currentMessages.length * 0.6)
          ) {
            return current;
          }

          return {
            ...current,
            [effectiveSelectedRoomId]: mergePendingMessages(
              currentMessages,
              nextMessages,
            ),
          };
        });
      } finally {
        if (!cancelled) {
          setLoadingMessages(false);
        }
      }
    };

    void loadMessages();
    const intervalId = window.setInterval(() => {
      void loadMessages();
    }, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [effectiveSelectedRoomId]);

  useEffect(() => {
    if (!effectiveSelectedRoomId) {
      return;
    }

    let cancelled = false;

    const touchPresence = async () => {
      try {
        await fetch(`/api/discussion/rooms/${encodeURIComponent(effectiveSelectedRoomId)}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action: "touchPresence" }),
        });
      } catch {
        if (!cancelled) {
          return;
        }
      }
    };

    void touchPresence();
    const intervalId = window.setInterval(() => {
      void touchPresence();
    }, 20_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [effectiveSelectedRoomId]);

  useEffect(() => {
    let cancelled = false;

    const loadRooms = async () => {
      const response = await fetch("/api/discussion/rooms", { cache: "no-store" });

      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as {
        rooms?: DiscussionRoom[];
        degraded?: boolean;
      };

      if (cancelled || payload.degraded || !payload.rooms) {
        return;
      }

      setRooms((current) => {
        const nextRooms = payload.rooms ?? [];

        if (
          current.length >= 4 &&
          nextRooms.length > 0 &&
          nextRooms.length <= Math.floor(current.length * 0.6)
        ) {
          return current;
        }

        const currentRoomsById = new Map(current.map((room) => [room.id, room]));

        return nextRooms.map((room) => {
          const previousRoom = currentRoomsById.get(room.id);

          if (!previousRoom) {
            return room;
          }

          return {
            ...room,
            memberUserIds:
              room.memberUserIds.length === 0 &&
              previousRoom.memberUserIds.length > 0
                ? previousRoom.memberUserIds
                : room.memberUserIds,
            members:
              room.members.length === 0 && previousRoom.members.length > 0
                ? previousRoom.members
                : room.members,
            activeUserIds:
              room.activeUserIds.length === 0 &&
              previousRoom.activeUserIds.length > 0
                ? previousRoom.activeUserIds
                : room.activeUserIds,
          };
        });
      });
    };

    const intervalId = window.setInterval(() => {
      void loadRooms();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const container = messageListRef.current;

    if (!container) {
      return;
    }

    if (shouldFollowScrollRef.current) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (!imagePreview) {
      return;
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setImagePreview(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [imagePreview]);

  useEffect(() => {
    if (!draftInputRef.current) {
      return;
    }

    draftInputRef.current.style.height = "0px";
    draftInputRef.current.style.height = `${Math.min(draftInputRef.current.scrollHeight, 160)}px`;
  }, [draft]);

  const onMessageScroll = () => {
    const container = messageListRef.current;

    if (!container) {
      return;
    }

    shouldFollowScrollRef.current =
      container.scrollTop + container.clientHeight >= container.scrollHeight - 48;
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const addFiles = (files: FileList | File[]) => {
    const nextFiles = Array.from(files).slice(0, 8);

    setAttachments((current) => [
      ...current,
      ...nextFiles.map((file) => ({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
      })),
    ]);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files?.length) {
      return;
    }

    addFiles(event.target.files);
    event.target.value = "";
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedFiles = Array.from(event.clipboardData.items)
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));

    if (pastedFiles.length === 0) {
      return;
    }

    event.preventDefault();
    addFiles(pastedFiles);
  };

  const handleAttachmentDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDraggingFiles(true);
  };

  const handleAttachmentDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setDraggingFiles(false);
    }
  };

  const handleAttachmentDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDraggingFiles(false);

    if (event.dataTransfer.files?.length) {
      addFiles(event.dataTransfer.files);
    }
  };

  const removeAttachment = (attachmentId: string) => {
    setAttachments((current) => {
      const match = current.find((attachment) => attachment.id === attachmentId);

      if (match) {
        URL.revokeObjectURL(match.previewUrl);
      }

      return current.filter((attachment) => attachment.id !== attachmentId);
    });
  };

  const sendMessage = async () => {
    if (!effectiveSelectedRoomId || sending) {
      return;
    }

    const trimmedDraft = draft.trim();

    if (!trimmedDraft && attachments.length === 0) {
      return;
    }

    setSending(true);
    setError("");

    try {
      const attachmentPayload = await Promise.all(
        attachments.map(async (attachment) => ({
          name: attachment.file.name || "attachment",
          mimeType: attachment.file.type || "application/octet-stream",
          sizeBytes: attachment.file.size,
          dataUrl: await fileToDataUrl(attachment.file),
        })),
      );

      const optimisticMessage: PendingMessage = {
        id: `temp-${crypto.randomUUID()}`,
        roomId: effectiveSelectedRoomId,
        userId: currentUser.id,
        userName: currentUser.name,
        content: trimmedDraft,
        createdAt: new Date().toISOString(),
        attachments: attachmentPayload.map((attachment) => ({
          id: crypto.randomUUID(),
          name: attachment.name,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          dataUrl: attachment.dataUrl,
          createdAt: new Date().toISOString(),
        })),
        pending: true,
      };

      shouldFollowScrollRef.current = true;
      setMessagesByRoom((current) => ({
        ...current,
        [effectiveSelectedRoomId]: [
          ...(current[effectiveSelectedRoomId] ?? []),
          optimisticMessage,
        ],
      }));
      setDraft("");
      setAttachments((current) => {
        current.forEach((attachment) => URL.revokeObjectURL(attachment.previewUrl));
        return [];
      });

      const response = await fetch("/api/discussion/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: effectiveSelectedRoomId,
          content: trimmedDraft,
          attachments: attachmentPayload,
        }),
      });
      const payload = (await response.json()) as {
        message?: DiscussionMessage | string;
      };

      if (!response.ok || !payload.message || typeof payload.message === "string") {
        throw new Error(
          typeof payload.message === "string"
            ? payload.message
            : "Unable to send message.",
        );
      }

      const savedMessage: PendingMessage = payload.message;

      setMessagesByRoom((current) => ({
        ...current,
        [effectiveSelectedRoomId]: [
          ...(current[effectiveSelectedRoomId] ?? []).filter(
            (message) => message.id !== optimisticMessage.id,
          ),
          savedMessage,
        ] satisfies PendingMessage[],
      }));
      setRooms((current) =>
        current
          .map((room) =>
            room.id === effectiveSelectedRoomId
              ? { ...room, lastMessageAt: savedMessage.createdAt }
              : room,
          )
          .sort(compareDiscussionRooms),
      );
    } catch (sendError) {
      setError(
        sendError instanceof Error ? sendError.message : "Unable to send message.",
      );
      setMessagesByRoom((current) => ({
        ...current,
        [effectiveSelectedRoomId]: (current[effectiveSelectedRoomId] ?? []).filter(
          (message) => !message.pending,
        ),
      }));
    } finally {
      setSending(false);
    }
  };

  const createRoom = async () => {
    if (!isAdmin || submittingRoom) {
      return;
    }

    setSubmittingRoom(true);
    setError("");

    try {
      const response = await fetch("/api/discussion/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: roomNameDraft,
          memberUserIds: selectedMemberIds,
        }),
      });
      const payload = (await response.json()) as {
        room?: DiscussionRoom;
        message?: string;
      };

      if (!response.ok || !payload.room) {
        throw new Error(payload.message || "Unable to create room.");
      }

      setRooms((current) => [...current, payload.room!].sort(compareDiscussionRooms));
      setSelectedRoomId(payload.room.id);
      setRoomNameDraft("");
      setSelectedMemberIds([]);
      setNewRoomModalOpen(false);
    } catch (roomError) {
      setError(
        roomError instanceof Error ? roomError.message : "Unable to create room.",
      );
    } finally {
      setSubmittingRoom(false);
    }
  };

  const saveMembers = async () => {
    if (!selectedRoom || !isAdmin || savingMembers) {
      return false;
    }

    setSavingMembers(true);
    setError("");

    try {
      const response = await fetch(
        `/api/discussion/rooms/${encodeURIComponent(selectedRoom.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ memberUserIds: selectedMemberIds }),
        },
      );
      const payload = (await response.json()) as {
        room?: DiscussionRoom;
        message?: string;
      };

      if (!response.ok || !payload.room) {
        throw new Error(payload.message || "Unable to update room members.");
      }

      setRooms((current) =>
        current.map((room) => (room.id === payload.room!.id ? payload.room! : room)),
      );
      return true;
    } catch (membersError) {
      setError(
        membersError instanceof Error
          ? membersError.message
          : "Unable to update room members.",
      );
      return false;
    } finally {
      setSavingMembers(false);
    }
  };

  const saveRoomSettings = async () => {
    if (isAdmin) {
      const saved = await saveMembers();
      if (saved) {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(
            "nex-discussion-message-alignment",
            roomSettingsAlignmentDraft,
          );
        }
        setRoomSettingsInitialAlignment(roomSettingsAlignmentDraft);
        setIsRoomSettingsOpen(false);
      }
      return;
    }

    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        "nex-discussion-message-alignment",
        roomSettingsAlignmentDraft,
      );
    }
    setRoomSettingsInitialAlignment(roomSettingsAlignmentDraft);
    setIsRoomSettingsOpen(false);
  };

  const closeRoomSettings = () => {
    setMessageAlignment(roomSettingsInitialAlignment);
    setRoomSettingsAlignmentDraft(roomSettingsInitialAlignment);
    setIsRoomSettingsOpen(false);
  };

  const removeRoom = async () => {
    if (!selectedRoom || !isAdmin) {
      return;
    }

    if (!window.confirm(`Delete "${selectedRoom.name}"?`)) {
      return;
    }

    setError("");

    const response = await fetch(
      `/api/discussion/rooms/${encodeURIComponent(selectedRoom.id)}`,
      { method: "DELETE" },
    );
    const payload = (await response.json()) as { message?: string };

    if (!response.ok) {
      setError(payload.message || "Unable to delete room.");
      return;
    }

    setRooms((current) => current.filter((room) => room.id !== selectedRoom.id));
    setMessagesByRoom((current) => {
      const next = { ...current };
      delete next[selectedRoom.id];
      return next;
    });
    setSelectedRoomId((current) =>
      current === selectedRoom.id
        ? rooms.filter((room) => room.id !== selectedRoom.id)[0]?.id ?? ""
        : current,
    );
  };

  const handleMessageKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    void sendMessage();
  };

  return (
    <div className="flex h-[calc(100vh-5rem)] min-h-0 overflow-hidden rounded-[28px] border border-[#cfdcd0] bg-[#edf5ea] shadow-[0_24px_80px_rgba(24,34,24,0.08)]">
      <aside
        className={`flex shrink-0 flex-col border-r border-[#d8e4d8] bg-[#f7fbf5] transition-[width] duration-300 ease-out ${
          isRoomListCollapsed ? "w-[96px]" : "w-[340px]"
        }`}
      >
        <div
          className={`flex border-b border-[#d8e4d8] px-4 py-4 ${
            isRoomListCollapsed ? "justify-center" : "items-center justify-between"
          }`}
        >
          <button
            type="button"
            onClick={() => setIsRoomListCollapsed((current) => !current)}
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-[#d8e4d8] bg-white text-[#355142] transition-colors hover:bg-[#f2f7f1]"
            title={isRoomListCollapsed ? "Expand rooms" : "Collapse rooms"}
            aria-label={isRoomListCollapsed ? "Expand rooms" : "Collapse rooms"}
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className={`h-4 w-4 transition-transform duration-300 ${isRoomListCollapsed ? "" : "rotate-180"}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          {!isRoomListCollapsed && isAdmin ? (
            <button
              type="button"
              onClick={() => {
                setRoomNameDraft("");
                setSelectedMemberIds([]);
                setNewRoomModalOpen(true);
              }}
              className="rounded-full bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#214930]"
            >
              New room
            </button>
          ) : null}
        </div>

        <div className={`min-h-0 flex-1 overflow-y-auto ${isRoomListCollapsed ? "px-2 py-3" : "px-3 py-3"}`}>
          {!isRoomListCollapsed ? (
            <div className="mb-3 px-1">
              <input
                value={roomSearch}
                onChange={(event) => setRoomSearch(event.target.value)}
                placeholder="Search"
                className="h-11 w-full rounded-full border border-[#d8e4d8] bg-white px-4 text-sm outline-none transition focus:border-[color:var(--accent)]"
              />
            </div>
          ) : null}

          {filteredRooms.length === 0 ? (
            <div className="rounded-[20px] border border-dashed border-[#d8e4d8] bg-white px-4 py-5 text-sm text-[#6d7f70]">
              {rooms.length === 0
                ? isAdmin
                  ? "No discussion rooms yet."
                  : "You do not have access to any discussion room yet."
                : "No room matches your search."}
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredRooms.map((room) => {
                const active = room.id === effectiveSelectedRoomId;

                return (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => {
                      setSelectedRoomId(room.id);
                      setIsRoomSettingsOpen(false);
                      if (isAdmin) {
                        setSelectedMemberIds(room.memberUserIds);
                      }
                      shouldFollowScrollRef.current = true;
                    }}
                    className={`flex w-full cursor-pointer items-center rounded-[20px] text-left transition ${
                      active
                        ? "bg-[#e7f3ea] shadow-[0_10px_24px_rgba(29,83,54,0.10)]"
                        : "hover:bg-white/90"
                    } ${isRoomListCollapsed ? "justify-center px-2 py-3" : "gap-3 px-3 py-3"}`}
                    title={room.name}
                  >
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                        active ? "bg-[color:var(--accent)] text-white" : "bg-[#dde9de] text-[#355142]"
                      }`}
                    >
                      {getInitials(room.name)}
                    </div>
                    {!isRoomListCollapsed ? (
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-[#213025]">
                          {room.name}
                        </div>
                        <div className="mt-1 text-xs text-[#748375]">
                          {room.memberCount} member{room.memberCount === 1 ? "" : "s"}
                        </div>
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col bg-[#dcebd4]">
        {selectedRoom ? (
          <>
            <div className="flex items-start justify-between gap-4 border-b border-[#d8e4d8] bg-[#f7fbf5] px-6 py-4">
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-[22px] font-semibold text-[#213025]">
                  {selectedRoom.name}
                </h2>
              </div>
              <div className="flex shrink-0 items-start gap-2">
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  {selectedRoomMembers.map((user) => {
                    const tone = getAvatarTone(user.name);
                    const isJoined = selectedRoom.activeUserIds.includes(user.id);
                    return (
                      <div
                        key={user.id}
                        className="flex items-center gap-1.5 rounded-full border border-[#d8e4d8] bg-white px-2 py-1"
                      >
                        <div
                          className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold text-white"
                          style={{ backgroundColor: tone }}
                        >
                          {getInitials(user.name)}
                        </div>
                        <span className="max-w-[100px] truncate text-xs font-medium text-[#355142]">
                          {user.name}
                        </span>
                        <span
                          className={`h-2 w-2 rounded-full ${
                            isJoined ? "bg-emerald-500" : "bg-slate-300"
                          }`}
                          aria-label={isJoined ? "Joined" : "Not joined"}
                          title={isJoined ? "Joined" : "Not joined"}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="relative flex items-center">
                <button
                  type="button"
                  onClick={() => {
                    if (isAdmin && selectedRoom) {
                      setSelectedMemberIds(selectedRoom.memberUserIds);
                    }
                    setRoomSettingsInitialAlignment(messageAlignment);
                    setRoomSettingsAlignmentDraft(messageAlignment);
                    setIsRoomSettingsOpen(true);
                  }}
                  className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-[#d8e4d8] bg-white text-[#355142] transition-colors hover:bg-[#f2f7f1]"
                  aria-label="Room settings"
                  title="Room settings"
                >
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01A1.65 1.65 0 0 0 10.91 3H11a2 2 0 1 1 4 0h.09a1.65 1.65 0 0 0 1.51 1h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01A1.65 1.65 0 0 0 21 10.91V11a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </button>
                </div>
              </div>
            </div>

            {error ? (
              <div className="mx-5 mt-4 rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            <div
              ref={messageListRef}
              onScroll={onMessageScroll}
              className="min-h-0 flex-1 overflow-y-auto px-6 py-5"
              style={{
                backgroundColor: "#d9e8cd",
                backgroundImage:
                  "radial-gradient(circle at 20px 20px, rgba(112,144,97,0.10) 1.6px, transparent 0), radial-gradient(circle at 64px 48px, rgba(112,144,97,0.08) 1.6px, transparent 0), linear-gradient(135deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 65%)",
                backgroundSize: "88px 88px, 88px 88px, 100% 100%",
              }}
            >
              {loadingMessages && messages.length === 0 ? (
                <div className="flex items-center justify-center gap-3 rounded-[20px] border border-dashed border-[#d8e4d8] bg-white/88 px-4 py-5 text-sm text-[#6d7f70]">
                  <span className="inline-flex h-5 w-5 animate-spin rounded-full border-2 border-[#9ab39e] border-t-transparent" />
                  <span>Loading messages...</span>
                </div>
              ) : messages.length === 0 ? (
                <div className="rounded-[20px] border border-dashed border-[#d8e4d8] bg-white/88 px-4 py-5 text-sm text-[#6d7f70]">
                  No discussion yet.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {messages.map((message) => {
                    const mine = message.userId === currentUser.id;
                    const incomingTone = getAvatarTone(message.userName);
                    const imageAttachments = message.attachments.filter((attachment) =>
                      attachment.mimeType.startsWith("image/"),
                    );
                    const fileAttachments = message.attachments.filter(
                      (attachment) => !attachment.mimeType.startsWith("image/"),
                    );
                    const hasImageAttachments = imageAttachments.length > 0;
                    const hasOnlyImageAttachments =
                      !message.content.trim() &&
                      fileAttachments.length === 0 &&
                      hasImageAttachments;

                    return (
                      <div
                        key={message.id}
                        className={`flex ${
                          messageAlignment === "single-right" ||
                          (messageAlignment === "split" && mine)
                            ? "justify-end"
                            : "justify-start"
                        }`}
                      >
                        <div
                          className={`flex max-w-[78%] items-end gap-2 ${
                            messageAlignment === "single-right" ||
                            (messageAlignment === "split" && mine)
                              ? "flex-row-reverse"
                              : ""
                          }`}
                        >
                          <div
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white shadow-[0_8px_20px_rgba(24,34,24,0.08)]"
                            style={{
                              backgroundColor: mine ? "#6fb37a" : incomingTone,
                            }}
                          >
                            {getInitials(message.userName)}
                          </div>

                          <div
                            className={`${
                              hasOnlyImageAttachments
                                ? "bg-transparent p-0 shadow-none"
                                : hasImageAttachments
                                  ? `overflow-hidden rounded-[22px] shadow-[0_8px_20px_rgba(24,34,24,0.05)] ${
                                      mine
                                        ? "rounded-br-[8px] bg-[#eefddc] text-[#213025]"
                                        : "rounded-bl-[8px] bg-white text-[#213025]"
                                    }`
                                  : `rounded-[22px] px-4 py-3 shadow-[0_8px_20px_rgba(24,34,24,0.05)] ${
                                     mine
                                       ? "rounded-br-[8px] bg-[#eefddc] text-[#213025]"
                                       : "rounded-bl-[8px] bg-white text-[#213025]"
                                    }`
                            }`}
                          >
                            {hasImageAttachments ? (
                              <div className="space-y-0">
                                {imageAttachments.map((attachment) => (
                                  <button
                                    key={attachment.id}
                                    type="button"
                                    onClick={() =>
                                      setImagePreview({
                                        src: attachment.dataUrl,
                                        name: attachment.name,
                                      })
                                    }
                                    className={`block w-full cursor-pointer overflow-hidden transition-opacity hover:opacity-90 ${
                                      hasOnlyImageAttachments
                                        ? "rounded-[20px]"
                                        : imageAttachments.length === 1
                                          ? ""
                                          : "border-b border-black/5 last:border-b-0"
                                    }`}
                                  >
                                    <img
                                      src={attachment.dataUrl}
                                      alt={attachment.name}
                                      className="max-h-56 w-full object-cover"
                                    />
                                  </button>
                                ))}

                                {message.content || fileAttachments.length > 0 ? (
                                  <div className="px-4 pb-3 pt-2">
                                    {message.content ? (
                                      <div className="flex items-end justify-between gap-3">
                                        <div className="min-w-0 flex-1 whitespace-pre-wrap text-[15px] leading-6">
                                          {message.content}
                                        </div>
                                        {fileAttachments.length === 0 ? (
                                          <div
                                            className={`shrink-0 text-[11px] ${
                                              mine ? "text-[#668669]" : "text-[#849383]"
                                            }`}
                                          >
                                            {formatMessageTime(message.createdAt)}
                                          </div>
                                        ) : null}
                                      </div>
                                    ) : null}

                                    {fileAttachments.length > 0 ? (
                                      <div className={`${message.content ? "mt-3" : ""} space-y-2`}>
                                        {fileAttachments.map((attachment) => (
                                          <a
                                            key={attachment.id}
                                            href={attachment.dataUrl}
                                            download={attachment.name}
                                            className={`flex items-center justify-between rounded-[16px] px-3 py-2 text-sm ${
                                              mine ? "bg-white/60 text-[#213025]" : "bg-[#f6f8f4]"
                                            }`}
                                          >
                                            <span className="truncate">{attachment.name}</span>
                                            <span className="ml-3 shrink-0 text-xs opacity-70">
                                              {formatBytes(attachment.sizeBytes)}
                                            </span>
                                          </a>
                                        ))}
                                      </div>
                                    ) : null}

                                    {fileAttachments.length > 0 ? (
                                      <div
                                        className={`mt-1.5 text-right text-[11px] ${
                                          mine ? "text-[#668669]" : "text-[#849383]"
                                        }`}
                                      >
                                        {formatMessageTime(message.createdAt)}
                                      </div>
                                    ) : null}
                                  </div>
                                ) : (
                                  <div
                                    className={`px-4 pb-3 pt-2 text-right text-[11px] ${
                                      mine ? "text-[#668669]" : "text-[#849383]"
                                    }`}
                                  >
                                    {formatMessageTime(message.createdAt)}
                                  </div>
                                )}
                              </div>
                            ) : null}

                            {!hasImageAttachments && message.content ? (
                              <div
                                className={`flex items-end justify-between gap-3 ${
                                  mine ? "" : "mt-1.5"
                                }`}
                              >
                                <div className="min-w-0 flex-1 whitespace-pre-wrap text-[15px] leading-6">
                                  {message.content}
                                </div>
                                {message.attachments.length === 0 ? (
                                  <div
                                    className={`shrink-0 text-[11px] ${
                                      mine ? "text-[#668669]" : "text-[#849383]"
                                    }`}
                                  >
                                    {formatMessageTime(message.createdAt)}
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                            {!hasImageAttachments && message.attachments.length > 0 ? (
                              <div className={`${message.content ? "mt-3" : ""} space-y-2`}>
                                {message.attachments.map((attachment) =>
                                  attachment.mimeType.startsWith("image/") ? (
                                    <button
                                      key={attachment.id}
                                      type="button"
                                      onClick={() =>
                                        setImagePreview({
                                          src: attachment.dataUrl,
                                          name: attachment.name,
                                        })
                                      }
                                      className="block w-full cursor-pointer overflow-hidden rounded-[18px] bg-white/50 transition-opacity hover:opacity-90"
                                    >
                                      <img
                                        src={attachment.dataUrl}
                                        alt={attachment.name}
                                        className="max-h-56 w-full object-cover"
                                      />
                                    </button>
                                  ) : (
                                    <a
                                      key={attachment.id}
                                      href={attachment.dataUrl}
                                      download={attachment.name}
                                      className={`flex items-center justify-between rounded-[16px] px-3 py-2 text-sm ${
                                        mine ? "bg-white/60 text-[#213025]" : "bg-[#f6f8f4]"
                                      }`}
                                    >
                                      <span className="truncate">{attachment.name}</span>
                                      <span className="ml-3 shrink-0 text-xs opacity-70">
                                        {formatBytes(attachment.sizeBytes)}
                                      </span>
                                    </a>
                                  ),
                                )}
                              </div>
                            ) : null}
                            {!hasImageAttachments && message.attachments.length > 0 ? (
                              <div
                                className={`mt-1.5 text-right text-[11px] ${
                                  mine ? "text-[#668669]" : "text-[#849383]"
                                }`}
                              >
                                {formatMessageTime(message.createdAt)}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div
              onDragOver={handleAttachmentDragOver}
              onDragLeave={handleAttachmentDragLeave}
              onDrop={handleAttachmentDrop}
              className={`border-t border-[#d8e4d8] bg-[#f7fbf5] px-5 py-4 transition ${
                draggingFiles ? "bg-emerald-50" : ""
              }`}
            >
              {attachments.length > 0 ? (
                <div className="mb-3 flex flex-wrap gap-2">
                  {attachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="flex items-center gap-2 rounded-[18px] border border-[#d8e4d8] bg-white px-3 py-2"
                    >
                      {attachment.file.type.startsWith("image/") ? (
                        <img
                          src={attachment.previewUrl}
                          alt={attachment.file.name || "Screenshot"}
                          className="h-12 w-12 rounded-xl object-cover"
                        />
                      ) : null}
                      <div className="min-w-0">
                        <div className="max-w-[220px] truncate text-sm">
                          {attachment.file.name || "Screenshot"}
                        </div>
                        <div className="text-xs text-[#748375]">
                          {formatBytes(attachment.file.size)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeAttachment(attachment.id)}
                        className="text-sm font-semibold text-rose-500 transition-colors hover:text-rose-600"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="flex items-center">
                <div className="flex min-h-[46px] w-full items-center gap-1.5 rounded-[24px] border border-[#d8e4d8] bg-white px-2.5 py-1 shadow-[0_8px_24px_rgba(24,34,24,0.05)]">
                  <button
                    type="button"
                    onClick={openFilePicker}
                    className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#7a8b7d] transition-colors hover:bg-[#f2f7f1] hover:text-[#214930]"
                    aria-label="Attach files"
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l9.2-9.19a4 4 0 1 1 5.65 5.66l-9.2 9.19a2 2 0 0 1-2.82-2.83l8.48-8.48" />
                    </svg>
                  </button>
                  <textarea
                    ref={draftInputRef}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onPaste={handlePaste}
                    onKeyDown={handleMessageKeyDown}
                    placeholder="Write a message..."
                    rows={1}
                    className="max-h-40 min-h-[22px] flex-1 resize-none overflow-hidden bg-transparent px-1 py-[3px] text-sm leading-5 outline-none placeholder:text-[#9aa89b]"
                  />
                  <button
                    type="button"
                    onClick={() => void sendMessage()}
                    disabled={sending}
                    className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[color:var(--accent)] text-base font-semibold text-white transition-colors hover:bg-[#214930] disabled:cursor-wait disabled:opacity-70"
                    aria-label="Send message"
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="h-4.5 w-4.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 12h11" />
                      <path d="m12 5 7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                onChange={handleFileChange}
              />
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-[#6d7f70]">
            {isAdmin
              ? "Create a room to start discussing projects."
              : "No discussion room is available for you yet."}
          </div>
        )}
      </section>

      {newRoomModalOpen ? (
        <ModalShell
          title="New discussion room"
          onClose={() => setNewRoomModalOpen(false)}
        >
          <label className="block text-sm font-medium">
            Room name
            <input
              value={roomNameDraft}
              onChange={(event) => setRoomNameDraft(event.target.value)}
              className="mt-2 h-12 w-full rounded-2xl border border-[var(--border)] bg-[color:var(--background)] px-4"
            />
          </label>
          <UserSelectionList
            users={users}
            selectedIds={selectedMemberIds}
            onToggle={(userId) =>
              setSelectedMemberIds((current) =>
                current.includes(userId)
                  ? current.filter((id) => id !== userId)
                  : [...current, userId],
              )
            }
          />
          <div className="mt-5 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setNewRoomModalOpen(false)}
              className="rounded-2xl border border-[var(--border)] px-4 py-2 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void createRoom()}
              disabled={submittingRoom}
              className="rounded-2xl bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-70"
            >
              Create room
            </button>
          </div>
        </ModalShell>
      ) : null}

      {isRoomSettingsOpen && selectedRoom ? (
        <ModalShell
          title="Settings"
          onClose={closeRoomSettings}
        >
          <div className="space-y-5">
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#6f8371]">
                Layout
              </div>
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setRoomSettingsAlignmentDraft("single-left");
                    setMessageAlignment("single-left");
                  }}
                  className={`flex h-20 cursor-pointer flex-col items-center justify-center gap-2 rounded-[20px] border transition-colors ${
                    roomSettingsAlignmentDraft === "single-left"
                      ? "border-[#8bb693] bg-[#e7f3ea] text-[#214930] shadow-[0_10px_24px_rgba(29,83,54,0.10)]"
                      : "border-[#d8e4d8] bg-white text-[#6d7f70] hover:bg-[#f2f7f1]"
                  }`}
                  title="Align left"
                  aria-label="Align left"
                >
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="mx-auto h-4.5 w-4.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 6h16" />
                    <path d="M4 12h10" />
                    <path d="M4 18h14" />
                  </svg>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.22em]">
                    Left
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRoomSettingsAlignmentDraft("split");
                    setMessageAlignment("split");
                  }}
                  className={`flex h-20 cursor-pointer flex-col items-center justify-center gap-2 rounded-[20px] border transition-colors ${
                    roomSettingsAlignmentDraft === "split"
                      ? "border-[#8bb693] bg-[#e7f3ea] text-[#214930] shadow-[0_10px_24px_rgba(29,83,54,0.10)]"
                      : "border-[#d8e4d8] bg-white text-[#6d7f70] hover:bg-[#f2f7f1]"
                  }`}
                  title="Split"
                  aria-label="Split"
                >
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="mx-auto h-4.5 w-4.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 6h7" />
                    <path d="M13 6h7" />
                    <path d="M4 12h6" />
                    <path d="M14 12h6" />
                    <path d="M4 18h8" />
                    <path d="M12 18h8" />
                  </svg>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.22em]">
                    Split
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRoomSettingsAlignmentDraft("single-right");
                    setMessageAlignment("single-right");
                  }}
                  className={`flex h-20 cursor-pointer flex-col items-center justify-center gap-2 rounded-[20px] border transition-colors ${
                    roomSettingsAlignmentDraft === "single-right"
                      ? "border-[#8bb693] bg-[#e7f3ea] text-[#214930] shadow-[0_10px_24px_rgba(29,83,54,0.10)]"
                      : "border-[#d8e4d8] bg-white text-[#6d7f70] hover:bg-[#f2f7f1]"
                  }`}
                  title="Align right"
                  aria-label="Align right"
                >
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="mx-auto h-4.5 w-4.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 6h16" />
                    <path d="M10 12h10" />
                    <path d="M6 18h14" />
                  </svg>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.22em]">
                    Right
                  </span>
                </button>
              </div>
            </div>

            {isAdmin ? (
              <div className="space-y-5">
                <div>
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#6f8371]">
                    Manage users
                  </div>
                  <UserSelectionList
                    users={users}
                    selectedIds={selectedMemberIds}
                    onToggle={(userId) =>
                      setSelectedMemberIds((current) =>
                        current.includes(userId)
                          ? current.filter((id) => id !== userId)
                          : [...current, userId],
                      )
                    }
                  />
                </div>

                <div className="flex items-center justify-between border-t border-[#d8e4d8] pt-5">
                  <button
                    type="button"
                    onClick={() => {
                      setIsRoomSettingsOpen(false);
                      void removeRoom();
                    }}
                    className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-100"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      className="h-4.5 w-4.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 6h18" />
                      <path d="M8 6V4h8v2" />
                      <path d="M19 6l-1 14H6L5 6" />
                      <path d="M10 11v6" />
                      <path d="M14 11v6" />
                    </svg>
                    Delete room
                  </button>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={closeRoomSettings}
                      className="rounded-2xl border border-[var(--border)] px-4 py-2 text-sm font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveRoomSettings()}
                      disabled={savingMembers}
                      className="rounded-2xl bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-70"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeRoomSettings}
                  className="rounded-2xl border border-[var(--border)] px-4 py-2 text-sm font-semibold"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => void saveRoomSettings()}
                  className="rounded-2xl bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-white"
                >
                  Save
                </button>
              </div>
            )}
          </div>
        </ModalShell>
      ) : null}

      {imagePreview ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(12,18,14,0.82)] p-4"
          onClick={() => setImagePreview(null)}
        >
          <div
            className="relative max-h-[92vh] max-w-[92vw]"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setImagePreview(null)}
              className="absolute right-3 top-3 z-10 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-white/92 text-lg font-semibold text-slate-700 shadow-[0_10px_30px_rgba(0,0,0,0.18)] transition-colors hover:bg-white"
            >
              ×
            </button>
            <img
              src={imagePreview.src}
              alt={imagePreview.name}
              className="max-h-[92vh] max-w-[92vw] rounded-[24px] bg-white object-contain shadow-[0_24px_80px_rgba(0,0,0,0.28)]"
            />
            <div className="mt-3 text-center text-sm text-white/88">
              {imagePreview.name}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(18,26,19,0.38)] p-4">
      <div className="w-full max-w-2xl rounded-[30px] border border-[rgba(28,82,54,0.12)] bg-white p-5 shadow-[0_24px_80px_rgba(18,26,19,0.18)]">
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-2xl font-semibold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-[var(--border)] bg-[color:var(--background)] text-[color:var(--muted)] transition-colors hover:bg-white"
            >
              ×
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

function UserSelectionList({
  users,
  selectedIds,
  onToggle,
}: {
  users: ManagedUser[];
  selectedIds: string[];
  onToggle: (userId: string) => void;
}) {
  return (
    <div className="mt-4 max-h-[420px] overflow-y-auto rounded-[24px] border border-[var(--border)] p-3">
      <div className="space-y-2">
        {users.map((user) => (
          <label
            key={user.id}
            className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[color:var(--background)] px-4 py-3"
          >
            <div>
              <div className="text-sm font-semibold">{user.name}</div>
              <div className="text-xs text-[color:var(--muted)]">
                {user.role} · {user.email}
              </div>
            </div>
            <input
              type="checkbox"
              checked={selectedIds.includes(user.id)}
              onChange={() => onToggle(user.id)}
              className="h-4 w-4"
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function compareDiscussionRooms(a: DiscussionRoom, b: DiscussionRoom) {
  const timeCompare =
    new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();

  if (timeCompare !== 0) {
    return timeCompare;
  }

  return a.name.localeCompare(b.name);
}

function mergePendingMessages(
  currentMessages: PendingMessage[],
  nextMessages: DiscussionMessage[],
) {
  const pendingMessages = currentMessages.filter((message) => message.pending);
  const serverIds = new Set(nextMessages.map((message) => message.id));
  const stillPending = pendingMessages.filter((message) => !serverIds.has(message.id));

  return [...nextMessages, ...stillPending].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Unable to read the attachment."));
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatMessageTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function getInitials(label: string) {
  const parts = label.trim().split(/\s+/).filter(Boolean).slice(0, 2);

  if (parts.length === 0) {
    return "?";
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function getAvatarTone(label: string) {
  const palette = [
    "#62b0ff",
    "#7c9b7b",
    "#d483ff",
    "#ff8a65",
    "#30b77a",
    "#f0bf4f",
    "#ef6d6d",
    "#5f83f2",
  ];
  const seed = label
    .split("")
    .reduce((accumulator, character) => accumulator + character.charCodeAt(0), 0);

  return palette[seed % palette.length];
}
