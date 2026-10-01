import { EventEmitter } from "node:events";

const INTERVIEWS_CHANGED_EVENT = "interviews-changed";

const globalForInterviewUpdates = globalThis as typeof globalThis & {
  interviewUpdatesEmitter?: EventEmitter;
};

const interviewUpdatesEmitter =
  globalForInterviewUpdates.interviewUpdatesEmitter ?? new EventEmitter();

interviewUpdatesEmitter.setMaxListeners(0);
globalForInterviewUpdates.interviewUpdatesEmitter = interviewUpdatesEmitter;

export function publishInterviewUpdate() {
  interviewUpdatesEmitter.emit(INTERVIEWS_CHANGED_EVENT);
}

export function subscribeToInterviewUpdates(listener: () => void) {
  interviewUpdatesEmitter.on(INTERVIEWS_CHANGED_EVENT, listener);

  return () => {
    interviewUpdatesEmitter.off(INTERVIEWS_CHANGED_EVENT, listener);
  };
}
