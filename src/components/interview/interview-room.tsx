"use client";

import type {
  ChangeEvent,
  ClipboardEvent,
  CSSProperties,
  DragEvent,
  ReactNode,
} from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import { TranscriptionProviderModal } from "@/components/interview/transcription-provider-modal";
import type {
  InterviewRoomContext,
  InterviewRoomAttachment,
  InterviewRoomMessage,
  InterviewRoomPresence,
  SessionUser,
} from "@/lib/types";

type RoomUiMessage = InterviewRoomMessage & {
  pendingKey?: string;
  isLoading?: boolean;
};

type InterviewRoomUploadAttachment = Omit<
  InterviewRoomAttachment,
  "id" | "createdAt"
>;

type TeamAttachmentDraft = {
  id: string;
  file: File;
  previewUrl: string;
};

type AudioCaptureSource = "microphone" | "speaker";

type ActiveAudioCapture = {
  source: AudioCaptureSource;
  stream: MediaStream;
  recordingStream: MediaStream;
  recorder: MediaRecorder | null;
  segmentTimer: number | null;
  restartTimer: number | null;
  monitorContext: AudioContext | null;
  monitorTimer: number | null;
  realtimeConnection: RTCPeerConnection | null;
  realtimeChannel: RTCDataChannel | null;
  realtimeTimer: number | null;
  realtimeTrack: MediaStreamTrack | null;
  realtimeReady: boolean;
  realtimeText: string;
  realtimeDraftLine: string;
  realtimeCleared: boolean;
  running: boolean;
};

type InterviewRoomProps = {
  roomKey: string;
  meetingLink: string;
  user: SessionUser;
  initialPresence: InterviewRoomPresence[];
  initialMessages: InterviewRoomMessage[];
  initialContext: InterviewRoomContext;
};

export function InterviewRoom({
  roomKey,
  meetingLink,
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
  const [transcriptionSettingsOpen, setTranscriptionSettingsOpen] = useState(false);
  const [contextSaving, setContextSaving] = useState(false);
  const [pendingMessages, setPendingMessages] = useState<RoomUiMessage[]>([]);
  const [teamDraft, setTeamDraft] = useState("");
  const [aiDraft, setAiDraft] = useState("");
  const [teamSending, setTeamSending] = useState(false);
  const [aiSending, setAiSending] = useState(false);
  const [messageError, setMessageError] = useState("");
  const [roomDegraded, setRoomDegraded] = useState(false);
  const [sharedNoteDraft, setSharedNoteDraft] = useState(initialContext.sharedNote);
  const [sharedNoteSaving, setSharedNoteSaving] = useState(false);
  const [sharedNoteSaved, setSharedNoteSaved] = useState(false);
  const [sidebarToolsTarget, setSidebarToolsTarget] = useState<HTMLElement | null>(null);
  const sharedNoteEditingRef = useRef(false);
  const leaveTimeoutRef = useRef<number | null>(null);
  const teamScrollRef = useRef<HTMLDivElement | null>(null);
  const aiScrollRef = useRef<HTMLDivElement | null>(null);
  const shouldScrollTeamOnNextRenderRef = useRef(false);
  const shouldScrollAiOnNextRenderRef = useRef(false);
  const shouldFollowTeamRef = useRef(true);
  const chatSplitRef = useRef<HTMLDivElement | null>(null);
  const [resizingChatColumns, setResizingChatColumns] = useState(false);
  const [aiPaneWidth, setAiPaneWidth] = useState(50);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setSidebarToolsTarget(document.getElementById("interview-room-sidebar-tools"));
      const savedWidth = Number(
        window.localStorage.getItem("nex-interview-ai-pane-width"),
      );
      if (Number.isFinite(savedWidth) && savedWidth >= 25 && savedWidth <= 75) {
        setAiPaneWidth(savedWidth);
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  }, []);

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
    if (leaveTimeoutRef.current !== null) {
      window.clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }

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

    const handlePageHide = () => {
      leaveInterviewRoom(roomKey);
    };

    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.clearInterval(heartbeatId);
      window.removeEventListener("pagehide", handlePageHide);
      leaveTimeoutRef.current = window.setTimeout(() => {
        leaveInterviewRoom(roomKey);
        leaveTimeoutRef.current = null;
      }, 100);
    };
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
      setServerMessages((current) => mergeServerRoomMessages(current, payload.messages));
      setRoomContext(payload.context);
      if (!sharedNoteEditingRef.current) {
        setSharedNoteDraft(payload.context.sharedNote);
      }
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
    }, 2000);

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

  const postMessage = async (
    channel: "team" | "ai",
    attachments: InterviewRoomUploadAttachment[] = [],
  ) => {
    const content = channel === "team" ? teamDraft.trim() : aiDraft.trim();

    if (!content && attachments.length === 0) {
      return false;
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
      attachments: attachments.map((attachment) => ({
        ...attachment,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      })),
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
            attachments: [],
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

    try {
        const response = await fetch("/api/interview-rooms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomKey,
            channel,
            content,
            roomLabel,
            attachments,
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
        setServerMessages((current) => {
          return mergeServerRoomMessages(
            current,
            [payload.postedMessage, payload.assistantMessage].filter(
              (message): message is InterviewRoomMessage => Boolean(message),
            ),
          );
        });
        setPendingMessages((current) =>
          current.filter((message) => message.pendingKey !== pendingKey),
        );
        return true;
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
        return false;
      } finally {
        if (channel === "team") {
          setTeamSending(false);
        } else {
          setAiSending(false);
        }
      }
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
          ...(user.role === "admin" ? { aiPrompt: contextDraft.aiPrompt } : {}),
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

  const saveSharedNote = async () => {
    setSharedNoteSaving(true);
    setSharedNoteSaved(false);
    setMessageError("");

    try {
      const response = await fetch("/api/interview-rooms", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomKey, sharedNote: sharedNoteDraft }),
      });
      const payload = (await response.json()) as {
        message?: string;
        context?: InterviewRoomContext;
      };

      if (!response.ok || !payload.context) {
        throw new Error(payload.message || "Unable to save the shared note.");
      }

      setRoomContext(payload.context);
      setSharedNoteDraft(payload.context.sharedNote);
      setSharedNoteSaved(true);
      window.setTimeout(() => setSharedNoteSaved(false), 1800);
    } catch (error) {
      setMessageError(
        error instanceof Error ? error.message : "Unable to save the shared note.",
      );
    } finally {
      setSharedNoteSaving(false);
    }
  };

  const meetingHref = getSafeInterviewLink(meetingLink);

  return (
    <div className="flex h-[calc(100vh-3rem)] min-h-0 flex-col gap-3 overflow-hidden md:h-[calc(100vh-4rem)]">
      <div className="flex flex-wrap items-center gap-3 px-1">
        <button
          type="button"
          onClick={() => {
            leaveInterviewRoom(roomKey);
            router.back();
          }}
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

      {sidebarToolsTarget
        ? createPortal(
          <div className="space-y-4 border-t border-[var(--border)] pt-4">
            <div className="min-w-0">
              <div className="mb-1.5 text-sm font-medium">Meeting link</div>
              <div className="flex h-10 min-h-10 items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-2">
            <input
              value={meetingLink}
              readOnly
              placeholder="No meeting link added"
              title={meetingLink}
                    className="min-w-0 flex-1 truncate bg-transparent text-sm outline-none"
            />
            {meetingHref ? (
              <a
                href={meetingHref}
                target="_blank"
                rel="noreferrer"
                      className="inline-flex h-7 w-12 shrink-0 items-center justify-center rounded-md border border-[var(--border)] text-xs font-medium hover:bg-[color:var(--background)]"
              >
                Open
              </a>
            ) : null}
          </div>
        </div>

            <div className="min-w-0">
              <div className="mb-1.5 flex items-center justify-between gap-2 text-sm font-medium">
                <span>Support link</span>
            {sharedNoteSaved ? (
                  <span className="text-xs font-normal text-emerald-700">Saved</span>
            ) : null}
          </div>
              <div className="flex h-10 min-h-10 items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-2 focus-within:border-[color:var(--accent)]">
            <input
              value={sharedNoteDraft}
              onFocus={() => {
                sharedNoteEditingRef.current = true;
              }}
              onBlur={() => {
                sharedNoteEditingRef.current = false;
              }}
              onChange={(event) => {
                setSharedNoteDraft(event.target.value);
                setSharedNoteSaved(false);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void saveSharedNote();
                }
              }}
              placeholder=""
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
            <button
              type="button"
              onClick={() => void saveSharedNote()}
              disabled={sharedNoteSaving}
                    className="inline-flex h-7 w-12 shrink-0 items-center justify-center rounded-md border border-transparent bg-[color:var(--accent)] text-xs font-medium text-white disabled:opacity-60"
            >
              {sharedNoteSaving ? "..." : "Save"}
            </button>
          </div>
        </div>
          </div>,
            sidebarToolsTarget,
          )
        : null}

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

      <div ref={chatSplitRef} className="flex min-h-0 flex-1 flex-col gap-4 xl:flex-row xl:gap-0">
        <div
          className="min-h-0 min-w-0 w-full xl:w-[var(--ai-pane-width)]"
          style={{ "--ai-pane-width": `${aiPaneWidth}%` } as CSSProperties}
        >
          <ChatColumn
          title="AI room"
          description="Shared AI conversation visible to everyone in the room."
          headerAction={
            <div className="flex items-center gap-2">
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
              {user.role === "admin" ? (
                <button
                  type="button"
                  onClick={() => setTranscriptionSettingsOpen(true)}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-white transition hover:bg-[color:var(--background)]"
                  aria-label="Transcription settings"
                  title="Transcription settings"
                >
                  <SettingsIcon />
                </button>
              ) : null}
            </div>
          }
          messages={aiMessages}
          currentUserId={user.id}
          enableTranscription
          draft={aiDraft}
          onDraftChange={setAiDraft}
          onSend={() => postMessage("ai")}
          pending={aiSending}
          scrollRef={aiScrollRef}
          />
        </div>
        <div
          role="separator"
          aria-label="Resize AI Room and Team Chat"
          aria-orientation="vertical"
          aria-valuemin={25}
          aria-valuemax={75}
          aria-valuenow={Math.round(aiPaneWidth)}
          tabIndex={0}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setResizingChatColumns(true);
          }}
          onPointerMove={(event) => {
            if (!resizingChatColumns || !chatSplitRef.current) {
              return;
            }

            const bounds = chatSplitRef.current.getBoundingClientRect();
            const nextWidth = ((event.clientX - bounds.left) / bounds.width) * 100;
            setAiPaneWidth(Math.min(75, Math.max(25, nextWidth)));
          }}
          onPointerUp={(event) => {
            event.currentTarget.releasePointerCapture(event.pointerId);
            setResizingChatColumns(false);
            window.localStorage.setItem(
              "nex-interview-ai-pane-width",
              String(aiPaneWidth),
            );
          }}
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
              return;
            }

            event.preventDefault();
            const direction = event.key === "ArrowLeft" ? -2 : 2;
            setAiPaneWidth((current) => {
              const next = Math.min(75, Math.max(25, current + direction));
              window.localStorage.setItem("nex-interview-ai-pane-width", String(next));
              return next;
            });
          }}
          className={`group relative hidden w-4 shrink-0 cursor-col-resize touch-none items-center justify-center xl:flex ${
            resizingChatColumns ? "bg-[#e1ebdd]" : ""
          }`}
        >
          <span className="h-16 w-1 rounded-full bg-[#b8c9b8] transition-all group-hover:h-24 group-hover:bg-[#76927d]" />
        </div>
        <div className="min-h-0 min-w-0 w-full xl:flex-1">
          <ChatColumn
          title="Team chat"
          description="Fast room chat between users."
          discussionStyle
          messages={teamMessages}
          currentUserId={user.id}
          draft={teamDraft}
          onDraftChange={setTeamDraft}
          onSend={(attachments) => postMessage("team", attachments)}
          pending={teamSending}
          scrollRef={teamScrollRef}
          onScroll={() => {
            shouldFollowTeamRef.current = isNearBottom(teamScrollRef.current);
          }}
          />
        </div>
      </div>

      {contextModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,15,0.35)] p-4">
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-4xl overflow-y-auto rounded-[28px] border border-[var(--border)] bg-white p-6 shadow-[0_24px_80px_rgba(24,34,24,0.2)]">
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

            <label className="mt-5 block">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-sm font-medium">AI prompt</span>
                {user.role !== "admin" ? (
                  <span className="text-xs text-[color:var(--muted)]">
                    Only admins can edit
                  </span>
                ) : null}
              </div>
              <textarea
                value={contextDraft.aiPrompt}
                onChange={(event) =>
                  setContextDraft((current) => ({
                    ...current,
                    aiPrompt: event.target.value,
                  }))
                }
                readOnly={user.role !== "admin"}
                rows={14}
                className="min-h-64 w-full resize-y rounded-2xl border border-[var(--border)] bg-[color:var(--background)] px-3 py-3 font-mono text-sm leading-6 outline-none read-only:cursor-default read-only:opacity-75"
              />
            </label>

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
      {transcriptionSettingsOpen ? (
        <TranscriptionProviderModal
          onClose={() => setTranscriptionSettingsOpen(false)}
        />
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
  discussionStyle = false,
  enableTranscription = false,
  draft,
  onDraftChange,
  onSend,
  pending,
  scrollRef,
  onScroll,
}: {
  title: string;
  description: string;
  headerAction?: ReactNode;
  messages: RoomUiMessage[];
  currentUserId: string;
  discussionStyle?: boolean;
  enableTranscription?: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: (attachments?: InterviewRoomUploadAttachment[]) => Promise<boolean>;
  pending: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onScroll?: () => void;
}) {
  const [attachments, setAttachments] = useState<TeamAttachmentDraft[]>([]);
  const [preparingAttachments, setPreparingAttachments] = useState(false);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [imagePreview, setImagePreview] = useState<{ src: string; name: string } | null>(
    null,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [messageAlignment, setMessageAlignment] = useState<
    "split" | "single-left" | "single-right"
  >("split");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const attachmentsRef = useRef<TeamAttachmentDraft[]>([]);
  const draftRef = useRef(draft);
  const audioCapturesRef = useRef(new Map<AudioCaptureSource, ActiveAudioCapture>());
  const transcriptionRequestsRef = useRef(new Set<AbortController>());
  const transcriptionMountedRef = useRef(true);
  const transcriptionSequenceRef = useRef<Record<AudioCaptureSource, number>>({
    microphone: 0,
    speaker: 0,
  });
  const nextTranscriptRef = useRef<Record<AudioCaptureSource, number>>({
    microphone: 0,
    speaker: 0,
  });
  const completedTranscriptsRef = useRef<Record<AudioCaptureSource, Map<number, string>>>(
    { microphone: new Map(), speaker: new Map() },
  );
  const [transcriptionSupported, setTranscriptionSupported] = useState<
    boolean | null
  >(null);
  const [activeCaptureSources, setActiveCaptureSources] = useState<
    AudioCaptureSource[]
  >([]);
  const [transcriptionRequestCount, setTranscriptionRequestCount] = useState(0);
  const [transcriptionError, setTranscriptionError] = useState("");
  const [transcriptionStatus, setTranscriptionStatus] = useState("");
  const [livePreview, setLivePreview] = useState<Record<AudioCaptureSource, string>>({
    microphone: "",
    speaker: "",
  });
  const startingCaptureSourcesRef = useRef(new Set<AudioCaptureSource>());
  const [startingCaptureSources, setStartingCaptureSources] = useState<AudioCaptureSource[]>([]);
  const [microphoneDevices, setMicrophoneDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState("");
  const [microphoneLevel, setMicrophoneLevel] = useState(0);
  const microphonePeakRef = useRef(0);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      const saved = window.localStorage.getItem("nex-interview-team-alignment");
      if (saved === "single-left" || saved === "single-right") {
        setMessageAlignment(saved);
      }
    });
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    return () => {
      attachmentsRef.current.forEach((attachment) =>
        URL.revokeObjectURL(attachment.previewUrl),
      );
    };
  }, []);

  useEffect(() => {
    if (!enableTranscription) {
      return;
    }
    transcriptionMountedRef.current = true;
    const audioCaptures = audioCapturesRef.current;
    const transcriptionRequests = transcriptionRequestsRef.current;
    const supportCheckFrame = window.requestAnimationFrame(() => {
      setTranscriptionSupported(
        Boolean(window.MediaRecorder && navigator.mediaDevices),
      );
    });

    return () => {
      window.cancelAnimationFrame(supportCheckFrame);
      transcriptionMountedRef.current = false;
      for (const capture of audioCaptures.values()) {
        capture.running = false;
        if (capture.segmentTimer !== null) {
          window.clearTimeout(capture.segmentTimer);
        }
        if (capture.restartTimer !== null) {
          window.clearTimeout(capture.restartTimer);
        }
        if (capture.monitorTimer !== null) {
          window.clearInterval(capture.monitorTimer);
        }
        if (capture.realtimeTimer !== null) {
          window.clearInterval(capture.realtimeTimer);
        }
        capture.realtimeChannel?.close();
        capture.realtimeConnection?.close();
        capture.realtimeTrack?.stop();
        void capture.monitorContext?.close();
        const recorder = capture.recorder;
        if (recorder && recorder.state !== "inactive") {
          recorder.onstop = null;
          recorder.stop();
        }
        capture.stream.getTracks().forEach((track) => track.stop());
      }
      audioCaptures.clear();
      for (const controller of transcriptionRequests) {
        controller.abort();
      }
      transcriptionRequests.clear();
    };
  }, [enableTranscription]);

  useEffect(() => {
    if (!enableTranscription || !navigator.mediaDevices?.enumerateDevices) return;
    let active = true;
    const refreshMicrophones = () => {
      void navigator.mediaDevices.enumerateDevices()
        .then((devices) => {
          if (active) setMicrophoneDevices(devices.filter((device) => device.kind === "audioinput"));
        })
        .catch(() => undefined);
    };
    refreshMicrophones();
    navigator.mediaDevices.addEventListener("devicechange", refreshMicrophones);
    return () => {
      active = false;
      navigator.mediaDevices.removeEventListener("devicechange", refreshMicrophones);
    };
  }, [enableTranscription]);

  const appendTranscript = (source: AudioCaptureSource, text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !transcriptionMountedRef.current) {
      return;
    }
    const label = source === "microphone" ? "Mic" : "Speaker";
    const nextDraft = [draftRef.current.trimEnd(), `${label}: ${trimmed}`]
      .filter(Boolean)
      .join("\n");
    updateCaptionInput(nextDraft);
  };

  const updateCaptionInput = (value: string) => {
    draftRef.current = value;
    if (messageInputRef.current) {
      messageInputRef.current.value = value;
      messageInputRef.current.scrollTop = messageInputRef.current.scrollHeight;
    }
    onDraftChange(value);
  };

  const updateRealtimeDraft = (capture: ActiveAudioCapture, text: string, final = false) => {
    if (!transcriptionMountedRef.current) return;
    const label = capture.source === "microphone" ? "Mic" : "Speaker";
    const line = text.trim() ? `${label}: ${text.trim()}` : "";
    const previous = capture.realtimeDraftLine;
    let nextDraft = draftRef.current;
    const position = previous ? nextDraft.lastIndexOf(previous) : -1;
    if (
      position >= 0 &&
      (position === 0 || nextDraft[position - 1] === "\n") &&
      (position + previous.length === nextDraft.length || nextDraft[position + previous.length] === "\n")
    ) {
      const before = nextDraft.slice(0, position);
      const after = nextDraft.slice(position + previous.length);
      nextDraft = before.endsWith("\n")
        ? before.slice(0, -1) + after
        : before + (after.startsWith("\n") ? after.slice(1) : after);
    }
    if (line) {
      nextDraft = [nextDraft.trimEnd(), line].filter(Boolean).join("\n");
    }
    capture.realtimeDraftLine = final ? "" : line;
    updateCaptionInput(nextDraft);
  };

  const transcribeAudioSegment = async (
    source: AudioCaptureSource,
    blob: Blob,
  ) => {
    const sequence = transcriptionSequenceRef.current[source]++;
    const complete = (text: string) => {
      const completed = completedTranscriptsRef.current[source];
      completed.set(sequence, text);
      while (completed.has(nextTranscriptRef.current[source])) {
        const next = nextTranscriptRef.current[source]++;
        const caption = completed.get(next) || "";
        completed.delete(next);
        if (caption) appendTranscript(source, caption);
      }
    };
    if (blob.size < 800 || !transcriptionMountedRef.current) {
      complete("");
      return;
    }
    const controller = new AbortController();
    transcriptionRequestsRef.current.add(controller);
    setTranscriptionRequestCount((current) => current + 1);
    setTranscriptionStatus("Transcribing audio...");
    try {
      const extension = blob.type.includes("mp4") ? "mp4" : "webm";
      const formData = new FormData();
      formData.append("audio", blob, `${source}.${extension}`);
      formData.append("source", source);
      formData.append("language", navigator.language || "en-US");
      const response = await fetch("/api/transcription", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      const payload = (await response.json()) as { text?: string; message?: string };
      if (!response.ok) {
        throw new Error(payload.message || "Unable to transcribe audio.");
      }
      complete(payload.text || "");
      if (payload.text) {
        setTranscriptionStatus("Caption added to the message field.");
      } else {
        setTranscriptionStatus(
          source === "microphone" && microphonePeakRef.current < 0.015
            ? "No microphone signal detected. Check the input meter or choose another microphone."
            : "Audio was received, but no speech was recognized. Speak closer to the microphone and try again.",
        );
      }
    } catch (error) {
      complete("");
      if (!controller.signal.aborted && transcriptionMountedRef.current) {
        setTranscriptionStatus("");
        setTranscriptionError(
          error instanceof Error ? error.message : "Unable to transcribe audio.",
        );
      }
    } finally {
      transcriptionRequestsRef.current.delete(controller);
      if (transcriptionMountedRef.current) {
        setTranscriptionRequestCount((current) => Math.max(0, current - 1));
      }
    }
  };

  const clearAudioCaptureState = (source: AudioCaptureSource) => {
    const capture = audioCapturesRef.current.get(source);
    if (capture?.monitorTimer !== null && capture?.monitorTimer !== undefined) {
      window.clearInterval(capture.monitorTimer);
    }
    void capture?.monitorContext?.close();
    if (capture?.realtimeTimer !== null && capture?.realtimeTimer !== undefined) {
      window.clearInterval(capture.realtimeTimer);
    }
    capture?.realtimeChannel?.close();
    capture?.realtimeConnection?.close();
    capture?.realtimeTrack?.stop();
    audioCapturesRef.current.delete(source);
    setActiveCaptureSources((current) => current.filter((item) => item !== source));
    setLivePreview((current) => ({ ...current, [source]: "" }));
    if (source === "microphone") setMicrophoneLevel(0);
  };

  const startRecorderSegment = (capture: ActiveAudioCapture) => {
    if (!capture.running) {
      return;
    }
    const chunks: BlobPart[] = [];
    const mimeType = getSupportedAudioMimeType();
    const recorder = new MediaRecorder(
      capture.recordingStream,
      mimeType ? { mimeType } : undefined,
    );
    capture.recorder = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };
    recorder.onerror = () => {
      capture.running = false;
      capture.stream.getTracks().forEach((track) => track.stop());
      if (transcriptionMountedRef.current) {
        setTranscriptionError(`Unable to record ${capture.source} audio.`);
      }
    };
    recorder.onstop = () => {
      if (capture.segmentTimer !== null) {
        window.clearTimeout(capture.segmentTimer);
        capture.segmentTimer = null;
      }
      capture.recorder = null;
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
      if (capture.running && !capture.realtimeReady) {
        if (capture.recordingStream.getAudioTracks().some((track) => track.readyState !== "live")) {
          setTranscriptionError(`${capture.source === "microphone" ? "Microphone" : "Speaker audio"} stopped unexpectedly. Start it again.`);
          capture.stream.getTracks().forEach((track) => track.stop());
          clearAudioCaptureState(capture.source);
        } else {
          try {
            startRecorderSegment(capture);
          } catch {
            setTranscriptionError(`Unable to restart ${capture.source} recording.`);
            capture.stream.getTracks().forEach((track) => track.stop());
            clearAudioCaptureState(capture.source);
          }
        }
      } else if (!capture.running) {
        capture.stream.getTracks().forEach((track) => track.stop());
        clearAudioCaptureState(capture.source);
      }
      void transcribeAudioSegment(capture.source, blob);
    };
    recorder.start();
    capture.segmentTimer = window.setTimeout(() => {
      if (recorder.state === "recording") {
        recorder.stop();
      }
    }, 2_000);
  };

  const stopAudioCapture = (source: AudioCaptureSource) => {
    const capture = audioCapturesRef.current.get(source);
    if (!capture) {
      return;
    }
    capture.running = false;
    if (capture.segmentTimer !== null) {
      window.clearTimeout(capture.segmentTimer);
    }
    if (capture.restartTimer !== null) {
      window.clearTimeout(capture.restartTimer);
    }
    if (capture.realtimeReady && capture.realtimeConnection) {
      if (capture.realtimeChannel?.readyState === "open") {
        capture.realtimeChannel.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
      }
      window.setTimeout(() => {
        if (audioCapturesRef.current.get(source) !== capture) return;
        if (capture.realtimeText.trim()) updateRealtimeDraft(capture, capture.realtimeText, true);
        capture.stream.getTracks().forEach((track) => track.stop());
        clearAudioCaptureState(source);
      }, 1_000);
      return;
    }
    capture.realtimeChannel?.close();
    capture.realtimeConnection?.close();
    capture.realtimeTrack?.stop();
    if (capture.recorder?.state === "recording") {
      capture.recorder.stop();
    } else {
      capture.stream.getTracks().forEach((track) => track.stop());
      clearAudioCaptureState(source);
    }
  };

  const startRealtimeCapture = async (
    capture: ActiveAudioCapture,
    tokenRequest: Promise<Response | null>,
  ) => {
    if (typeof RTCPeerConnection === "undefined") return false;
    const tokenResponse = await tokenRequest;
    if (!tokenResponse?.ok) return false;
    const token = (await tokenResponse.json()) as { enabled?: boolean; token?: string };
    if (!token.enabled || !token.token || !capture.running) return false;

    const connection = new RTCPeerConnection();
    capture.realtimeConnection = connection;
    const realtimeTrack = capture.recordingStream.getAudioTracks()[0].clone();
    realtimeTrack.enabled = false;
    capture.realtimeTrack = realtimeTrack;
    connection.addTrack(realtimeTrack, new MediaStream([realtimeTrack]));
    const channel = connection.createDataChannel("oai-events");
    capture.realtimeChannel = channel;
    let connected = false;
    const fallbackToClips = () => {
      if (!connected || !capture.running || capture.realtimeConnection !== connection) return;
      if (capture.realtimeTimer !== null) window.clearInterval(capture.realtimeTimer);
      capture.realtimeTimer = null;
      capture.realtimeConnection = null;
      capture.realtimeChannel = null;
      capture.realtimeTrack?.stop();
      capture.realtimeTrack = null;
      capture.realtimeReady = false;
      channel.close();
      connection.close();
      if (capture.realtimeText.trim()) updateRealtimeDraft(capture, capture.realtimeText, true);
      capture.realtimeText = "";
      setLivePreview((current) => ({ ...current, [capture.source]: "" }));
      setTranscriptionStatus("Live connection ended. Using clip transcription.");
      if (!capture.recorder) startRecorderSegment(capture);
    };
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === "failed") fallbackToClips();
    };
    channel.onclose = fallbackToClips;
    channel.onmessage = (message) => {
      if (!transcriptionMountedRef.current) return;
      try {
        const event = JSON.parse(message.data) as {
          type?: string;
          delta?: string;
          transcript?: string;
          error?: { message?: string };
        };
        if (event.type === "conversation.item.input_audio_transcription.delta" && event.delta) {
          capture.realtimeText += event.delta;
          updateRealtimeDraft(capture, capture.realtimeText);
          setLivePreview((current) => ({ ...current, [capture.source]: capture.realtimeText }));
        } else if (event.type === "conversation.item.input_audio_transcription.completed") {
          updateRealtimeDraft(
            capture,
            capture.realtimeCleared ? capture.realtimeText : event.transcript || capture.realtimeText,
            true,
          );
          capture.realtimeText = "";
          capture.realtimeCleared = false;
          setLivePreview((current) => ({ ...current, [capture.source]: "" }));
        } else if (event.type === "error" && event.error?.message) {
          fallbackToClips();
        }
      } catch {
        // Ignore non-JSON data-channel events.
      }
    };
    try {
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      const answer = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.token}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
      });
      if (!answer.ok) throw new Error("Realtime connection failed.");
      await connection.setRemoteDescription({ type: "answer", sdp: await answer.text() });
      await new Promise<void>((resolve, reject) => {
        if (channel.readyState === "open") return resolve();
        const timeout = window.setTimeout(() => reject(new Error("Realtime connection timed out.")), 8_000);
        channel.onopen = () => {
          window.clearTimeout(timeout);
          resolve();
        };
        channel.onerror = () => {
          window.clearTimeout(timeout);
          reject(new Error("Realtime connection failed."));
        };
      });
      connected = true;
      if (!capture.running) {
        connection.close();
        realtimeTrack.stop();
        capture.realtimeConnection = null;
        capture.realtimeChannel = null;
        capture.realtimeTrack = null;
        return false;
      }
      capture.realtimeReady = true;
      if (capture.recorder?.state === "recording") capture.recorder.stop();
      realtimeTrack.enabled = true;
      capture.realtimeTimer = window.setInterval(() => {
        if (channel.readyState === "open" && capture.running) {
          channel.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
        }
      }, 3_000);
      return true;
    } catch {
      connection.close();
      realtimeTrack.stop();
      capture.realtimeConnection = null;
      capture.realtimeChannel = null;
      capture.realtimeTrack = null;
      return false;
    }
  };

  const startAudioCapture = async (source: AudioCaptureSource) => {
    if (!navigator.mediaDevices || audioCapturesRef.current.has(source) || startingCaptureSourcesRef.current.has(source)) {
      return;
    }
    startingCaptureSourcesRef.current.add(source);
    setStartingCaptureSources((current) => [...current, source]);
    setTranscriptionError("");
    setTranscriptionStatus(`Waiting for ${source === "microphone" ? "microphone" : "screen audio"} permission...`);
    const tokenRequest: Promise<Response | null> = typeof RTCPeerConnection === "undefined"
      ? Promise.resolve(null)
      : fetch("/api/transcription/realtime", { method: "POST", cache: "no-store" }).catch(() => null);
    let stream: MediaStream | null = null;
    try {
      stream =
        source === "microphone"
          ? await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                ...(selectedMicrophoneId ? { deviceId: { exact: selectedMicrophoneId } } : {}),
              },
            })
          : await navigator.mediaDevices.getDisplayMedia({
              video: true,
              audio: true,
            });
      if (stream.getAudioTracks().length === 0) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error(
          "No speaker audio was shared. Select a tab or screen and enable audio sharing.",
        );
      }

      const capture: ActiveAudioCapture = {
        source,
        stream,
        recordingStream: new MediaStream(stream.getAudioTracks()),
        recorder: null,
        segmentTimer: null,
        restartTimer: null,
        monitorContext: null,
        monitorTimer: null,
        realtimeConnection: null,
        realtimeChannel: null,
        realtimeTimer: null,
        realtimeTrack: null,
        realtimeReady: false,
        realtimeText: "",
        realtimeDraftLine: "",
        realtimeCleared: false,
        running: true,
      };
      audioCapturesRef.current.set(source, capture);
      if (source === "microphone") {
        microphonePeakRef.current = 0;
        void navigator.mediaDevices.enumerateDevices()
          .then((devices) => {
            if (capture.running) {
              setMicrophoneDevices(devices.filter((device) => device.kind === "audioinput"));
            }
          })
          .catch(() => undefined);
        if (typeof AudioContext !== "undefined") {
          try {
            const context = new AudioContext();
            capture.monitorContext = context;
            const analyser = context.createAnalyser();
            analyser.fftSize = 1024;
            context.createMediaStreamSource(stream).connect(analyser);
            void context.resume().catch(() => undefined);
            const samples = new Uint8Array(analyser.fftSize);
            capture.monitorTimer = window.setInterval(() => {
              analyser.getByteTimeDomainData(samples);
              const level = Math.sqrt(samples.reduce((sum, value) => {
                const sample = (value - 128) / 128;
                return sum + sample * sample;
              }, 0) / samples.length);
              microphonePeakRef.current = Math.max(microphonePeakRef.current, level);
              setMicrophoneLevel(Math.min(100, Math.round(level * 300)));
            }, 250);
          } catch {
            void capture.monitorContext?.close();
            capture.monitorContext = null;
          }
        }
      }
      stream.getTracks().forEach((track) => {
        track.addEventListener("ended", () => {
          if (capture.running) {
            setTranscriptionError(`${source === "microphone" ? "Microphone" : "Speaker audio"} stopped unexpectedly. Start it again.`);
            stopAudioCapture(source);
          }
        }, { once: true });
      });
      startRecorderSegment(capture);
      setActiveCaptureSources((current) => current.includes(source) ? current : [...current, source]);
      setTranscriptionStatus("Capturing audio. Connecting live transcription...");
      void startRealtimeCapture(capture, tokenRequest)
        .then((realtime) => {
          if (!capture.running || !transcriptionMountedRef.current) return;
          setTranscriptionStatus(realtime ? "Live transcription connected." : "Using clip transcription.");
        })
        .catch(() => {
          if (capture.running && transcriptionMountedRef.current) {
            setTranscriptionStatus("Using clip transcription.");
          }
        });
    } catch (error) {
      clearAudioCaptureState(source);
      stream?.getTracks().forEach((track) => track.stop());
      setTranscriptionStatus("");
      setTranscriptionError(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? `${source === "microphone" ? "Microphone" : "Speaker audio"} permission was denied.`
          : error instanceof Error
            ? error.message
            : "Unable to start audio capture.",
      );
    } finally {
      startingCaptureSourcesRef.current.delete(source);
      setStartingCaptureSources((current) => current.filter((item) => item !== source));
    }
  };

  const addFiles = (files: FileList | File[]) => {
    const nextFiles = Array.from(files);
    setAttachments((current) => [
      ...current,
      ...nextFiles.slice(0, Math.max(0, 8 - current.length)).map((file) => ({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
      })),
    ]);
  };

  const removeAttachment = (id: string) => {
    setAttachments((current) => {
      const removed = current.find((attachment) => attachment.id === id);
      if (removed) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      return current.filter((attachment) => attachment.id !== id);
    });
  };

  const handleSend = async () => {
    if (
      pending ||
      preparingAttachments ||
      activeCaptureSources.length > 0 ||
      transcriptionRequestCount > 0 ||
      (!draft.trim() && attachments.length === 0)
    ) {
      return;
    }

    setPreparingAttachments(true);
    try {
      const payload = await Promise.all(
        attachments.map(async (attachment) => ({
          name: attachment.file.name || "attachment",
          mimeType: attachment.file.type || "application/octet-stream",
          sizeBytes: attachment.file.size,
          dataUrl: await interviewFileToDataUrl(attachment.file),
        })),
      );
      const sent = await onSend(payload);

      if (sent) {
        setAttachments((current) => {
          current.forEach((attachment) => URL.revokeObjectURL(attachment.previewUrl));
          return [];
        });
      }
    } finally {
      setPreparingAttachments(false);
    }
  };

  const handleMessageKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    if (!discussionStyle) {
      return;
    }

    const files = Array.from(event.clipboardData.items)
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (files.length > 0) {
      event.preventDefault();
      addFiles(files);
    }
  };

  return (
    <section
      className={`flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] border shadow-[0_16px_50px_rgba(24,34,24,0.06)] ${
        discussionStyle
          ? "border-[#cfdcd0] bg-[#edf5ea]"
          : "border-[var(--border)] bg-white"
      }`}
    >
      <div
        className={`border-b px-5 py-4 ${
          discussionStyle
            ? "border-[#d8e4d8] bg-[#f7fbf5]"
            : "border-[var(--border)]"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className={discussionStyle ? "text-[22px] font-semibold" : "text-lg font-semibold"}>
              {title}
            </div>
            {!discussionStyle ? (
              <div className="mt-1 text-sm text-[color:var(--muted)]">{description}</div>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {headerAction}
            {discussionStyle ? (
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-[#d8e4d8] bg-white text-[#355142] transition-colors hover:bg-[#f2f7f1]"
                aria-label="Team Chat settings"
                title="Team Chat settings"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33A1.65 1.65 0 0 0 14 20.83V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82A1.65 1.65 0 0 0 3.17 14H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 8.92 4 1.65 1.65 0 0 0 10 2.49V2.4a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 4a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.12.61.66 1.05 1.29 1.05H21a2 2 0 1 1 0 4h-.09c-.63 0-1.17.44-1.51 1z" />
                </svg>
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-5"
        style={
          discussionStyle
            ? {
                backgroundColor: "#d9e8cd",
                backgroundImage:
                  "radial-gradient(circle at 20px 20px, rgba(112,144,97,0.10) 1.6px, transparent 0), radial-gradient(circle at 64px 48px, rgba(112,144,97,0.08) 1.6px, transparent 0), linear-gradient(135deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 65%)",
                backgroundSize: "88px 88px, 88px 88px, 100% 100%",
              }
            : undefined
        }
      >
        {discussionStyle && messages.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-[#d8e4d8] bg-white/88 px-4 py-5 text-sm text-[#6d7f70]">
            No discussion yet.
          </div>
        ) : null}
        {messages.map((message) => {
          const isOwnMessage =
            message.channel === "team" &&
            message.userId &&
            message.userId === currentUserId;
          const isAiPrompt = message.channel === "ai" && message.role === "user";
          const isAiAnswer = message.channel === "ai" && message.role === "assistant";
          const alignmentClass = isOwnMessage || isAiPrompt ? "justify-end" : "justify-start";
          const widthClass = isAiAnswer ? "w-full max-w-full" : "max-w-[92%]";

          if (discussionStyle) {
            const alignRight =
              messageAlignment === "single-right" ||
              (messageAlignment === "split" && isOwnMessage);
            const messageAttachments = message.attachments ?? [];
            const imageAttachments = messageAttachments.filter((attachment) =>
              attachment.mimeType.startsWith("image/"),
            );
            const fileAttachments = messageAttachments.filter(
              (attachment) => !attachment.mimeType.startsWith("image/"),
            );
            const hasImageAttachments = imageAttachments.length > 0;
            const hasOnlyImageAttachments =
              !message.content.trim() &&
              fileAttachments.length === 0 &&
              hasImageAttachments;

            return (
              <div key={message.id} className={`flex ${alignRight ? "justify-end" : "justify-start"}`}>
                <div
                  className={`flex max-w-[78%] items-end gap-2 ${
                    alignRight ? "flex-row-reverse" : ""
                  }`}
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white shadow-[0_8px_20px_rgba(24,34,24,0.08)]"
                    style={{
                      backgroundColor: isOwnMessage
                        ? "#6fb37a"
                        : getInterviewAvatarTone(message.userName),
                    }}
                  >
                    {getInterviewInitials(message.userName)}
                  </div>
                  <div
                    className={`text-[#213025] ${
                      hasOnlyImageAttachments
                        ? "bg-transparent p-0 shadow-none"
                        : hasImageAttachments
                          ? `overflow-hidden rounded-[22px] shadow-[0_8px_20px_rgba(24,34,24,0.05)] ${
                              isOwnMessage
                                ? "rounded-br-[8px] bg-[#eefddc]"
                                : "rounded-bl-[8px] bg-white"
                            }`
                          : `rounded-[22px] px-4 py-3 shadow-[0_8px_20px_rgba(24,34,24,0.05)] ${
                              isOwnMessage
                                ? "rounded-br-[8px] bg-[#eefddc]"
                                : "rounded-bl-[8px] bg-white"
                            }`
                    }`}
                  >
                    {hasImageAttachments ? (
                      <div
                        className={`grid max-w-md ${
                          imageAttachments.length === 1 ? "grid-cols-1" : "grid-cols-2"
                        }`}
                      >
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
                            className={`overflow-hidden bg-black/5 ${
                              hasOnlyImageAttachments ? "rounded-[16px]" : ""
                            }`}
                          >
                            <img
                              src={attachment.dataUrl}
                              alt={attachment.name}
                              className="max-h-56 w-full object-cover transition-opacity hover:opacity-90"
                            />
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <div
                      className={
                        hasImageAttachments && !hasOnlyImageAttachments
                          ? "px-4 pb-3 pt-2"
                          : ""
                      }
                    >
                      {fileAttachments.length > 0 ? (
                        <div className="mb-2 space-y-1.5">
                        {fileAttachments.map((attachment) => (
                          <a
                            key={attachment.id}
                            href={attachment.dataUrl}
                            download={attachment.name}
                            className="flex min-w-48 items-center justify-between gap-4 rounded-[14px] bg-black/5 px-3 py-2 text-sm hover:bg-black/10"
                          >
                            <span className="truncate">{attachment.name}</span>
                            <span className="shrink-0 text-xs opacity-65">
                              {formatInterviewBytes(attachment.sizeBytes)}
                            </span>
                          </a>
                        ))}
                        </div>
                      ) : null}
                      <div
                        className={`flex items-end justify-between gap-3 ${
                          hasOnlyImageAttachments ? "mt-1 px-1" : ""
                        }`}
                      >
                        {message.content ? (
                          <div className="min-w-0 whitespace-pre-wrap text-[15px] leading-6">
                            {message.content}
                          </div>
                        ) : null}
                        <div
                          className={`shrink-0 text-[11px] ${
                            hasOnlyImageAttachments ? "ml-auto" : ""
                          } ${
                            isOwnMessage ? "text-[#668669]" : "text-[#849383]"
                          }`}
                        >
                          {formatInterviewMessageTime(message.createdAt)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          }

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
      <div
        onDragOver={(event) => {
          if (discussionStyle) {
            event.preventDefault();
            setDraggingFiles(true);
          }
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setDraggingFiles(false);
          }
        }}
        onDrop={(event: DragEvent<HTMLDivElement>) => {
          if (!discussionStyle) {
            return;
          }
          event.preventDefault();
          setDraggingFiles(false);
          if (event.dataTransfer.files.length > 0) {
            addFiles(event.dataTransfer.files);
          }
        }}
        className={`border-t px-5 py-4 ${
          discussionStyle
            ? `border-[#d8e4d8] ${draggingFiles ? "bg-emerald-50" : "bg-[#f7fbf5]"}`
            : "border-[var(--border)]"
        }`}
      >
        {discussionStyle && attachments.length > 0 ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="flex items-center gap-2 rounded-[18px] border border-[#d8e4d8] bg-white px-3 py-2"
              >
                {attachment.file.type.startsWith("image/") ? (
                  <img
                    src={attachment.previewUrl}
                    alt={attachment.file.name}
                    className="h-11 w-11 rounded-xl object-cover"
                  />
                ) : null}
                <div className="min-w-0">
                  <div className="max-w-40 truncate text-sm">
                    {attachment.file.name || "attachment"}
                  </div>
                  <div className="text-xs text-[#748375]">
                    {formatInterviewBytes(attachment.file.size)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeAttachment(attachment.id)}
                  className="text-xs font-semibold text-rose-500 hover:text-rose-600"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <div
          className={`flex items-center gap-3 ${
            discussionStyle
              ? "min-h-[46px] rounded-[24px] border border-[#d8e4d8] bg-white px-2.5 py-1 shadow-[0_8px_24px_rgba(24,34,24,0.05)]"
              : "items-end"
          }`}
        >
          {discussionStyle ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#7a8b7d] transition-colors hover:bg-[#f2f7f1] hover:text-[#214930]"
              aria-label="Attach files"
            >
              <svg
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
          ) : null}
          <div className={discussionStyle ? "contents" : "min-w-0 flex-1"}>
            {enableTranscription ? (
              <div className="mb-2">
                <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                        activeCaptureSources.length > 0
                          ? "animate-pulse bg-red-500"
                          : "bg-[color:var(--border)]"
                      }`}
                    />
                    <span>
                      {activeCaptureSources.length > 0
                        ? "Capturing live audio..."
                        : transcriptionRequestCount > 0
                          ? "Transcribing..."
                          : "Live transcript"}
                    </span>
                  </div>
                  {transcriptionSupported === true ? (
                    <div className="flex items-center gap-2">
                      {(["microphone", "speaker"] as const).map((source) => {
                        const active = activeCaptureSources.includes(source);
                        return (
                          <button
                            key={source}
                            type="button"
                            onClick={() =>
                              active
                                ? stopAudioCapture(source)
                                : void startAudioCapture(source)
                            }
                            disabled={pending || startingCaptureSources.includes(source)}
                            aria-pressed={active}
                            className={`h-8 rounded-lg border px-3 text-xs font-semibold transition disabled:opacity-60 ${
                              active
                                ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                                : "border-[var(--border)] bg-white text-[color:var(--foreground)] hover:bg-[color:var(--background)]"
                            }`}
                          >
                            {startingCaptureSources.includes(source) ? "Starting" : active ? "Stop" : "Start"}{" "}
                            {source === "microphone" ? "mic" : "speaker"}
                          </button>
                        );
                      })}
                    </div>
                  ) : transcriptionSupported === false ? (
                    <span className="text-xs text-[color:var(--muted)]">
                      Not supported by this browser
                    </span>
                  ) : null}
                </div>
                {transcriptionError ? (
                  <div className="mt-1 text-xs text-red-600" role="alert">
                    {transcriptionError}
                  </div>
                ) : null}
                {transcriptionStatus && !transcriptionError ? (
                  <div className="mt-1 text-xs text-[color:var(--muted)]" role="status">
                    {transcriptionStatus}
                  </div>
                ) : null}
                {(livePreview.microphone || livePreview.speaker) ? (
                  <div className="mt-1 text-sm text-[color:var(--foreground)]" aria-live="polite">
                    {livePreview.microphone ? <div>Mic: {livePreview.microphone}</div> : null}
                    {livePreview.speaker ? <div>Speaker: {livePreview.speaker}</div> : null}
                  </div>
                ) : null}
                {transcriptionSupported !== false ? (
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                    <label className="flex min-w-0 items-center gap-2 text-xs text-[color:var(--muted)]">
                      <span>Microphone</span>
                      <select
                        value={selectedMicrophoneId}
                        onChange={(event) => setSelectedMicrophoneId(event.target.value)}
                        disabled={activeCaptureSources.includes("microphone") || startingCaptureSources.includes("microphone")}
                        className="h-8 min-w-0 max-w-64 rounded-lg border border-[var(--border)] bg-white px-2 text-xs text-[color:var(--foreground)]"
                      >
                        <option value="">System default</option>
                        {microphoneDevices.filter((device) => device.deviceId && device.deviceId !== "default").map((device, index) => (
                          <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>
                        ))}
                      </select>
                    </label>
                    {activeCaptureSources.includes("microphone") ? (
                      <div className="flex items-center gap-2 text-xs text-[color:var(--muted)]">
                        <span>Mic input</span>
                        <div className="h-2 w-28 overflow-hidden rounded-full bg-[#e4e9df]" role="meter" aria-label="Microphone input level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={microphoneLevel}>
                          <div className="h-full rounded-full bg-[#659b6b]" style={{ width: `${microphoneLevel}%` }} />
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
            <textarea
              ref={messageInputRef}
              value={draft}
              onChange={(event) => {
                draftRef.current = event.target.value;
                onDraftChange(event.target.value);
              }}
              onPaste={handlePaste}
              onKeyDown={handleMessageKeyDown}
              rows={discussionStyle ? 1 : 3}
              className={
                discussionStyle
                  ? "max-h-40 min-h-[22px] flex-1 resize-none overflow-y-auto bg-transparent px-1 py-[3px] text-sm leading-5 outline-none placeholder:text-[#9aa89b]"
                  : "min-h-[92px] w-full resize-y rounded-2xl border border-[var(--border)] bg-[color:var(--background)] px-3 py-3 text-sm outline-none"
              }
              placeholder={
                activeCaptureSources.length > 0
                  ? "Live captions will appear here..."
                  : discussionStyle
                    ? "Write a message..."
                    : "Type a message..."
              }
            />
          </div>
          {enableTranscription ? (
            <button
              type="button"
              onClick={() => {
                draftRef.current = "";
                if (messageInputRef.current) messageInputRef.current.value = "";
                onDraftChange("");
                for (const capture of audioCapturesRef.current.values()) {
                  capture.realtimeText = "";
                  capture.realtimeDraftLine = "";
                  capture.realtimeCleared = true;
                }
                setLivePreview({ microphone: "", speaker: "" });
              }}
              disabled={!draft}
              className="h-8 shrink-0 rounded-lg border border-[var(--border)] bg-white px-3 text-xs font-semibold text-[color:var(--foreground)] hover:bg-[color:var(--background)] disabled:opacity-50"
              aria-label="Clear message text"
            >
              Clear
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={
              pending ||
              preparingAttachments ||
              activeCaptureSources.length > 0 ||
              transcriptionRequestCount > 0 ||
              (!draft.trim() && attachments.length === 0)
            }
            className={`flex h-8 items-center justify-center bg-[color:var(--accent)] text-white disabled:opacity-60 ${
              discussionStyle
                ? "w-8 shrink-0 rounded-full transition-colors hover:bg-[#214930]"
                : "w-14 rounded-lg px-2 text-xs font-semibold"
            }`}
          >
            {pending || preparingAttachments ? (
              <span className="inline-flex items-center gap-1.5" aria-label="Sending">
                <span className="h-2 w-2 animate-bounce rounded-full bg-white [animation-delay:-0.2s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-white [animation-delay:-0.1s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-white" />
              </span>
            ) : (
              discussionStyle ? (
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12h13" />
                  <path d="m13 6 6 6-6 6" />
                </svg>
              ) : (
                "Send"
              )
            )}
          </button>
        </div>
        {discussionStyle ? (
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              if (event.target.files?.length) {
                addFiles(event.target.files);
              }
              event.target.value = "";
            }}
          />
        ) : null}
      </div>

      {settingsOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(18,26,19,0.38)] p-4">
          <div className="w-full max-w-md rounded-[28px] border border-[#d8e4d8] bg-white p-5 shadow-[0_24px_80px_rgba(18,26,19,0.18)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold">Team Chat settings</h3>
                <p className="mt-1 text-sm text-[color:var(--muted)]">
                  Choose how messages are aligned in this window.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[#d8e4d8] bg-[#f7fbf5] text-xl"
                aria-label="Close settings"
              >
                ×
              </button>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2">
              {([
                ["single-left", "Left"],
                ["split", "Split"],
                ["single-right", "Right"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setMessageAlignment(value);
                    window.localStorage.setItem("nex-interview-team-alignment", value);
                  }}
                  className={`rounded-[18px] border px-3 py-4 text-sm font-semibold transition-colors ${
                    messageAlignment === value
                      ? "border-[#8bb693] bg-[#e7f3ea] text-[#214930]"
                      : "border-[#d8e4d8] bg-white text-[#6d7f70] hover:bg-[#f2f7f1]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              className="mt-5 w-full rounded-2xl bg-[color:var(--accent)] px-4 py-2.5 text-sm font-semibold text-white"
            >
              Done
            </button>
          </div>
        </div>
      ) : null}

      {imagePreview ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(12,18,14,0.82)] p-4"
          onClick={() => setImagePreview(null)}
        >
          <div className="relative max-h-[92vh] max-w-[92vw]">
            <img
              src={imagePreview.src}
              alt={imagePreview.name}
              className="max-h-[88vh] max-w-[90vw] rounded-[20px] object-contain"
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function getSupportedAudioMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) =>
    MediaRecorder.isTypeSupported(type),
  ) ?? "";
}

function SettingsIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.09A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.09A1.7 1.7 0 0 0 4.6 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.09A1.7 1.7 0 0 0 15.5 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.16.37.37.7.6 1 .29.35.68.58 1.1.6H21v4h-.09A1.7 1.7 0 0 0 19.4 15Z" />
    </svg>
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

function mergeServerRoomMessages(
  current: InterviewRoomMessage[],
  incoming: InterviewRoomMessage[],
) {
  const byId = new Map(current.map((message) => [message.id, message]));
  incoming.forEach((message) => byId.set(message.id, message));
  return [...byId.values()].sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );
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
        let hasAnswer = false;
        for (const message of merged.slice(matchingServerIndex + 1)) {
          if (message.channel !== "ai") continue;
          if (message.role === "user") break;
          if (message.role === "assistant" && !message.isLoading) {
            hasAnswer = true;
            break;
          }
        }
        if (hasAnswer) return;
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

function leaveInterviewRoom(roomKey: string) {
  void fetch("/api/interview-rooms", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomKey }),
    keepalive: true,
  }).catch(() => undefined);
}

function getInterviewInitials(name: string) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return initials || "?";
}

function getInterviewAvatarTone(name: string) {
  const tones = ["#668f72", "#587d80", "#8a735e", "#77709a", "#8a6675"];
  const hash = Array.from(name).reduce(
    (value, character) => value + character.charCodeAt(0),
    0,
  );

  return tones[hash % tones.length];
}

function formatInterviewMessageTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function interviewFileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Unable to read the attachment."));
    reader.readAsDataURL(file);
  });
}

function formatInterviewBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getSafeInterviewLink(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}
