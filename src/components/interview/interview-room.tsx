"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type {
  InterviewRoomContext,
  InterviewRoomMessage,
  InterviewRoomPresence,
  SessionUser,
} from "@/lib/types";

type RoomUiMessage = InterviewRoomMessage & {
  pendingKey?: string;
  isLoading?: boolean;
};

type InterviewRoomProps = {
  roomKey: string;
  user: SessionUser;
  initialPresence: InterviewRoomPresence[];
  initialMessages: InterviewRoomMessage[];
  initialContext: InterviewRoomContext;
};

export function InterviewRoom({
  roomKey,
  user,
  initialPresence,
  initialMessages,
  initialContext,
}: InterviewRoomProps) {
  const router = useRouter();
  const [presence, setPresence] = useState(initialPresence);
  const [serverMessages, setServerMessages] = useState(initialMessages);
  const [roomContext, setRoomContext] = useState(initialContext);
  const [contextDraft, setContextDraft] = useState(initialContext);
  const [contextModalOpen, setContextModalOpen] = useState(false);
  const [contextSaving, setContextSaving] = useState(false);
  const [pendingMessages, setPendingMessages] = useState<RoomUiMessage[]>([]);
  const [teamDraft, setTeamDraft] = useState("");
  const [aiDraft, setAiDraft] = useState("");
  const [teamSending, setTeamSending] = useState(false);
  const [aiSending, setAiSending] = useState(false);
  const [messageError, setMessageError] = useState("");
  const [roomDegraded, setRoomDegraded] = useState(false);
  const teamScrollRef = useRef<HTMLDivElement | null>(null);
  const aiScrollRef = useRef<HTMLDivElement | null>(null);
  const shouldScrollTeamOnNextRenderRef = useRef(false);
  const shouldScrollAiOnNextRenderRef = useRef(false);
  const shouldFollowTeamRef = useRef(true);

  const messages = useMemo<RoomUiMessage[]>(
    () => mergeRoomMessages(serverMessages, pendingMessages),
    [pendingMessages, serverMessages],
  );
  const teamMessages = useMemo(
    () => messages.filter((message) => message.channel === "team"),
    [messages],
  );
  const aiMessages = useMemo(
    () => messages.filter((message) => message.channel === "ai"),
    [messages],
  );
  const roomLabel = roomKey.startsWith("imported:")
    ? "Synced interview room"
    : "Local interview room";

  useEffect(() => {
    const touchPresence = async () => {
      if (document.visibilityState === "hidden") {
        return;
      }

      const response = await fetch("/api/interview-rooms", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomKey }),
      });

      if (response.ok) {
        const payload = (await response.json()) as { degraded?: boolean };
        if (payload.degraded) {
          setRoomDegraded(true);
        } else {
          setRoomDegraded(false);
        }
      }
    };

    void touchPresence().catch(() => {
      setRoomDegraded(true);
    });

    const heartbeatId = window.setInterval(() => {
      void touchPresence().catch(() => {
        setRoomDegraded(true);
      });
    }, 15000);

    return () => window.clearInterval(heartbeatId);
  }, [roomKey]);

  useEffect(() => {
    const syncRoom = async () => {
      if (document.visibilityState === "hidden") {
        return;
      }

      const response = await fetch(
        `/api/interview-rooms?roomKey=${encodeURIComponent(roomKey)}`,
        {
          cache: "no-store",
        },
      );

      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as {
        degraded?: boolean;
        presence: InterviewRoomPresence[];
        messages: InterviewRoomMessage[];
        context: InterviewRoomContext;
      };

      if (payload.degraded) {
        setRoomDegraded(true);
        return;
      }

      setRoomDegraded(false);
      setPresence(payload.presence);
      setServerMessages(payload.messages);
      setRoomContext(payload.context);
      setContextDraft((current) =>
        contextModalOpen ? current : payload.context,
      );
    };

    void syncRoom().catch(() => {
      setRoomDegraded(true);
    });

    const intervalId = window.setInterval(() => {
      void syncRoom().catch(() => {
        setRoomDegraded(true);
      });
    }, 4000);

    return () => window.clearInterval(intervalId);
  }, [contextModalOpen, roomKey]);

  useEffect(() => {
    if (!shouldScrollTeamOnNextRenderRef.current && !shouldFollowTeamRef.current) {
      return;
    }

    scrollContainerToBottom(teamScrollRef.current);
    shouldScrollTeamOnNextRenderRef.current = false;
  }, [teamMessages]);

  useEffect(() => {
    if (!shouldScrollAiOnNextRenderRef.current) {
      return;
    }

    scrollContainerToBottom(aiScrollRef.current);
    shouldScrollAiOnNextRenderRef.current = false;
  }, [aiMessages]);

  const postMessage = (channel: "team" | "ai") => {
    const content = channel === "team" ? teamDraft.trim() : aiDraft.trim();

    if (!content) {
      return;
    }

    const pendingKey = crypto.randomUUID();

    const optimisticMessage: RoomUiMessage = {
      id: `temp-${crypto.randomUUID()}`,
      roomKey,
      eventType: roomKey.startsWith("imported:") ? "imported" : "local",
      eventId: roomKey.split(":").slice(1).join(":"),
      channel,
      role: "user",
      userId: user.id,
      userName: user.name,
      content,
      createdAt: new Date().toISOString(),
      pendingKey,
    };

    const optimisticAssistantMessage: RoomUiMessage | null =
      channel === "ai"
        ? {
            id: `temp-${crypto.randomUUID()}`,
            roomKey,
            eventType: optimisticMessage.eventType,
            eventId: optimisticMessage.eventId,
            channel: "ai",
            role: "assistant",
            userId: "",
            userName: "Nex AI",
            content: "",
            createdAt: new Date(Date.now() + 1).toISOString(),
            pendingKey,
            isLoading: true,
          }
        : null;

    setMessageError("");
    setPendingMessages((current) => [
      ...current,
      optimisticMessage,
      ...(optimisticAssistantMessage ? [optimisticAssistantMessage] : []),
    ]);
    if (channel === "team") {
      shouldScrollTeamOnNextRenderRef.current = true;
    } else {
      shouldScrollAiOnNextRenderRef.current = true;
    }
    if (channel === "team") {
      setTeamDraft("");
    } else {
      setAiDraft("");
    }

    if (channel === "team") {
      setTeamSending(true);
    } else {
      setAiSending(true);
    }

    void (async () => {
      try {
        const response = await fetch("/api/interview-rooms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomKey,
            channel,
            content,
            roomLabel,
          }),
        });

        const payload = (await response.json()) as {
          message?: string;
          postedMessage?: InterviewRoomMessage;
          assistantMessage?: InterviewRoomMessage | null;
        };

        if (!response.ok) {
          throw new Error(payload.message || "Unable to post message.");
        }

        setRoomDegraded(false);
        setPendingMessages((current) =>
          current.filter((message) => message.pendingKey !== pendingKey),
        );
        setServerMessages((current) => {
          const nextMessages = [...current];

          if (
            payload.postedMessage &&
            !nextMessages.some((message) => message.id === payload.postedMessage?.id)
          ) {
            nextMessages.push(payload.postedMessage);
          }

          if (
            payload.assistantMessage &&
            !nextMessages.some((message) => message.id === payload.assistantMessage?.id)
          ) {
            nextMessages.push(payload.assistantMessage);
          }

          nextMessages.sort(
            (left, right) =>
              new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
          );

          return nextMessages;
        });
      } catch (error) {
        setMessageError(
          error instanceof Error ? error.message : "Unable to post message.",
        );
        setPendingMessages((current) =>
          current.filter((message) => message.pendingKey !== pendingKey),
        );
        if (channel === "team") {
          setTeamDraft(content);
        } else {
          setAiDraft(content);
        }
      } finally {
        if (channel === "team") {
          setTeamSending(false);
        } else {
          setAiSending(false);
        }
      }
    })();
  };

  const saveContext = async () => {
    setContextSaving(true);
    setMessageError("");

    try {
      const response = await fetch("/api/interview-rooms", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomKey,
          resume: contextDraft.resume,
          jd: contextDraft.jd,
          details: contextDraft.details,
          reference: contextDraft.reference,
        }),
      });

      const payload = (await response.json()) as {
        message?: string;
        context?: InterviewRoomContext;
      };

      if (!response.ok || !payload.context) {
        throw new Error(payload.message || "Unable to save AI room context.");
      }

      setRoomContext(payload.context);
      setContextDraft(payload.context);
      setContextModalOpen(false);
    } catch (error) {
      setMessageError(
        error instanceof Error ? error.message : "Unable to save AI room context.",
      );
    } finally {
      setContextSaving(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-3rem)] min-h-0 flex-col gap-3 overflow-hidden md:h-[calc(100vh-4rem)]">
      <div className="flex flex-wrap items-center gap-3 px-1">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Back"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-white text-[color:var(--foreground)] shadow-[0_6px_18px_rgba(24,34,24,0.05)] transition hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="none"
            className="h-4 w-4"
          >
            <path
              d="M12.75 4.75 7.5 10l5.25 5.25"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M8 10h6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {presence.map((member) => (
            <div
              key={member.userId}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-medium shadow-[0_6px_18px_rgba(24,34,24,0.05)]"
            >
              <svg
                viewBox="0 0 20 20"
                aria-hidden="true"
                className="h-4 w-4 text-[color:var(--muted)]"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10 10a3 3 0 1 0-3-3 3 3 0 0 0 3 3Z" />
                <path d="M4.5 16a5.5 5.5 0 0 1 11 0" />
              </svg>
              {member.userName}
            </div>
          ))}
        </div>
      </div>

      {roomDegraded ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Live sync is temporarily degraded. Existing room messages stay visible and sync
          will resume automatically.
        </div>
      ) : null}

      {messageError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {messageError}
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-2">
        <ChatColumn
          title="AI room"
          description="Shared AI conversation visible to everyone in the room."
          headerAction={
            <button
              type="button"
              onClick={() => {
                setContextDraft(roomContext);
                setContextModalOpen(true);
              }}
              className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium transition hover:bg-[color:var(--background)]"
            >
              AI context
            </button>
          }
          messages={aiMessages}
          currentUserId={user.id}
          groupAiReplies
          draft={aiDraft}
          onDraftChange={setAiDraft}
          onSend={() => postMessage("ai")}
          pending={aiSending}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              postMessage("ai");
            }
          }}
          scrollRef={aiScrollRef}
        />
        <ChatColumn
          title="Team chat"
          description="Fast room chat between users."
          messages={teamMessages}
          currentUserId={user.id}
          draft={teamDraft}
          onDraftChange={setTeamDraft}
          onSend={() => postMessage("team")}
          pending={teamSending}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              postMessage("team");
            }
          }}
          scrollRef={teamScrollRef}
          onScroll={() => {
            shouldFollowTeamRef.current = isNearBottom(teamScrollRef.current);
          }}
        />
      </div>

      {contextModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,15,0.35)] p-4">
          <div className="w-full max-w-4xl rounded-[28px] border border-[var(--border)] bg-white p-6 shadow-[0_24px_80px_rgba(24,34,24,0.2)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--muted)]">
                  AI context
                </div>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight">
                  Shared recruiter context
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setContextModalOpen(false)}
                className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border)] bg-[color:var(--background)] text-[color:var(--muted)] transition hover:bg-white"
                aria-label="Close"
              >
                X
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <ContextField
                label="Resume"
                value={contextDraft.resume}
                onChange={(value) =>
                  setContextDraft((current) => ({ ...current, resume: value }))
                }
              />
              <ContextField
                label="JD"
                value={contextDraft.jd}
                onChange={(value) =>
                  setContextDraft((current) => ({ ...current, jd: value }))
                }
              />
              <ContextField
                label="Details"
                value={contextDraft.details}
                onChange={(value) =>
                  setContextDraft((current) => ({ ...current, details: value }))
                }
              />
              <ContextField
                label="Reference"
                value={contextDraft.reference}
                onChange={(value) =>
                  setContextDraft((current) => ({ ...current, reference: value }))
                }
              />
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setContextModalOpen(false)}
                className="rounded-xl border border-[var(--border)] bg-[color:var(--background)] px-5 py-3 text-base font-medium transition hover:bg-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveContext()}
                disabled={contextSaving}
                className="rounded-xl bg-[color:var(--accent)] px-5 py-3 text-base font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
              >
                {contextSaving ? "Saving..." : "Save context"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function isNearBottom(container: HTMLDivElement | null, threshold = 48) {
  if (!container) {
    return true;
  }

  const distanceToBottom =
    container.scrollHeight - container.scrollTop - container.clientHeight;

  return distanceToBottom <= threshold;
}

function scrollContainerToBottom(container: HTMLDivElement | null) {
  if (!container) {
    return;
  }

  container.scrollTop = container.scrollHeight;
}

function ChatColumn({
  title,
  description,
  headerAction,
  messages,
  currentUserId,
  groupAiReplies = false,
  draft,
  onDraftChange,
  onSend,
  pending,
  onKeyDown,
  scrollRef,
  onScroll,
}: {
  title: string;
  description: string;
  headerAction?: ReactNode;
  messages: RoomUiMessage[];
  currentUserId: string;
  groupAiReplies?: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  pending: boolean;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onScroll?: () => void;
}) {
  const displayMessages = useMemo(
    () => (groupAiReplies ? buildAiDisplayMessages(messages) : messages),
    [groupAiReplies, messages],
  );

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] border border-[var(--border)] bg-white shadow-[0_16px_50px_rgba(24,34,24,0.06)]">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">{title}</div>
            <div className="mt-1 text-sm text-[color:var(--muted)]">{description}</div>
          </div>
          {headerAction}
        </div>
      </div>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-5"
      >
        {displayMessages.map((message) => {
          const isOwnMessage =
            message.channel === "team" &&
            message.userId &&
            message.userId === currentUserId;
          const isAiPrompt = message.channel === "ai" && message.role === "user";
          const isAiAnswer = message.channel === "ai" && message.role === "assistant";
          const alignmentClass = isOwnMessage || isAiPrompt ? "justify-end" : "justify-start";
          const widthClass = isAiAnswer ? "w-full max-w-full" : "max-w-[92%]";

          return (
            <div
              key={message.id}
              className={`flex ${alignmentClass}`}
            >
              <div
                className={`${widthClass} rounded-2xl px-4 py-3 ${
                  message.role === "assistant"
                    ? "border border-sky-200 bg-sky-50"
                    : isOwnMessage
                      ? "border border-emerald-300 bg-emerald-50"
                      : "border border-[var(--border)] bg-[color:var(--background)]"
                }`}
              >
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">
                  {message.userName}
                </div>
                {message.isLoading ? (
                  <div className="mt-3 flex items-center gap-2 text-sm text-[color:var(--muted)]">
                    <span className="inline-flex gap-1">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-current [animation-delay:-0.2s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-current [animation-delay:-0.1s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-current" />
                    </span>
                    Thinking...
                  </div>
                ) : (
                  <div className="mt-2 whitespace-pre-wrap text-sm leading-6">
                    {message.content}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="border-t border-[var(--border)] px-5 py-4">
        <div className="flex items-end gap-3">
          <textarea
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={onKeyDown}
            rows={3}
            className="min-h-[92px] flex-1 rounded-2xl border border-[var(--border)] bg-[color:var(--background)] px-3 py-3 text-sm outline-none"
            placeholder="Type a message..."
          />
          <button
            type="button"
            onClick={onSend}
            disabled={pending || !draft.trim()}
            className="flex h-8 w-14 items-center justify-center rounded-lg bg-[color:var(--accent)] px-2 text-xs font-semibold text-white disabled:opacity-60"
          >
            {pending ? (
              <span className="inline-flex items-center gap-1.5" aria-label="Sending">
                <span className="h-2 w-2 animate-bounce rounded-full bg-white [animation-delay:-0.2s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-white [animation-delay:-0.1s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-white" />
              </span>
            ) : (
              "Send"
            )}
          </button>
        </div>
      </div>
    </section>
  );
}

function ContextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <div className="mb-2 text-sm font-medium">{label}</div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={8}
        className="w-full rounded-2xl border border-[var(--border)] bg-[color:var(--background)] px-3 py-3 text-sm outline-none"
      />
    </label>
  );
}

function buildAiDisplayMessages(messages: RoomUiMessage[]) {
  const grouped: RoomUiMessage[] = [];
  const unmatchedUserIndexByPendingKey = new Map<string, number>();
  const unmatchedUserIndexes: number[] = [];

  messages.forEach((message) => {
    if (message.role === "user") {
      grouped.push(message);
      const userIndex = grouped.length - 1;

      if (message.pendingKey) {
        unmatchedUserIndexByPendingKey.set(message.pendingKey, userIndex);
      } else {
        unmatchedUserIndexes.push(userIndex);
      }

      return;
    }

    if (message.role === "assistant") {
      let userIndex: number | undefined;

      if (message.pendingKey && unmatchedUserIndexByPendingKey.has(message.pendingKey)) {
        userIndex = unmatchedUserIndexByPendingKey.get(message.pendingKey);
        unmatchedUserIndexByPendingKey.delete(message.pendingKey);
      } else if (unmatchedUserIndexes.length > 0) {
        userIndex = unmatchedUserIndexes.shift();
      }

      if (userIndex === undefined) {
        grouped.push(message);
        return;
      }

      grouped.splice(userIndex + 1, 0, message);

      unmatchedUserIndexByPendingKey.forEach((storedIndex, pendingKey) => {
        if (storedIndex > userIndex) {
          unmatchedUserIndexByPendingKey.set(pendingKey, storedIndex + 1);
        }
      });

      for (let index = 0; index < unmatchedUserIndexes.length; index += 1) {
        if (unmatchedUserIndexes[index] > userIndex) {
          unmatchedUserIndexes[index] += 1;
        }
      }

      return;
    }

    grouped.push(message);
  });

  return grouped;
}

function mergeRoomMessages(
  serverMessages: InterviewRoomMessage[],
  pendingMessages: RoomUiMessage[],
) {
  const merged: RoomUiMessage[] = [...serverMessages];
  const pendingUserByKey = new Map<string, RoomUiMessage>();
  const hiddenPendingKeys = new Set<string>();

  pendingMessages.forEach((pendingMessage) => {
    if (pendingMessage.role === "user" && pendingMessage.pendingKey) {
      pendingUserByKey.set(pendingMessage.pendingKey, pendingMessage);
    }
  });

  pendingMessages.forEach((pendingMessage) => {
    if (pendingMessage.role !== "user") {
      return;
    }

    if (
      merged.some((serverMessage) => isMatchingPendingPrompt(serverMessage, pendingMessage))
    ) {
      if (pendingMessage.pendingKey) {
        hiddenPendingKeys.add(pendingMessage.pendingKey);
      }
      return;
    }

    merged.push(pendingMessage);
  });

  pendingMessages.forEach((pendingMessage) => {
    if (pendingMessage.role !== "assistant" || !pendingMessage.pendingKey) {
      if (pendingMessage.role !== "assistant") {
        return;
      }

      merged.push(pendingMessage);
      return;
    }

    const matchingPendingUser = pendingUserByKey.get(pendingMessage.pendingKey);

    if (
      matchingPendingUser &&
      hiddenPendingKeys.has(pendingMessage.pendingKey)
    ) {
      const matchingServerIndex = merged.findIndex((serverMessage) =>
        isMatchingPendingPrompt(serverMessage, matchingPendingUser),
      );

      if (matchingServerIndex >= 0) {
        merged.splice(matchingServerIndex + 1, 0, pendingMessage);
        return;
      }
    }

    merged.push(pendingMessage);
  });

  return merged;
}

function isMatchingPendingPrompt(
  serverMessage: InterviewRoomMessage,
  pendingMessage: RoomUiMessage,
) {
  if (
    serverMessage.role !== "user" ||
    serverMessage.channel !== pendingMessage.channel ||
    serverMessage.userId !== pendingMessage.userId ||
    serverMessage.content !== pendingMessage.content
  ) {
    return false;
  }

  const serverTime = new Date(serverMessage.createdAt).getTime();
  const pendingTime = new Date(pendingMessage.createdAt).getTime();

  return Math.abs(serverTime - pendingTime) <= 10000;
}
