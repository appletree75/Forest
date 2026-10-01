import { getSessionUser } from "@/lib/auth";
import { subscribeToInterviewUpdates } from "@/lib/interview-updates";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const encoder = new TextEncoder();

export async function GET(request: Request) {
  const user = await getSessionUser();

  if (!user) {
    return new Response("Unauthorized.", { status: 401 });
  }

  if (user.role !== "caller") {
    return new Response("Forbidden.", { status: 403 });
  }

  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (payload: string) => {
        if (!closed) {
          controller.enqueue(encoder.encode(payload));
        }
      };
      const unsubscribe = subscribeToInterviewUpdates(() => {
        send("event: interviews-changed\ndata: {}\n\n");
      });
      const keepAliveId = setInterval(() => {
        send(": keep-alive\n\n");
      }, 15_000);

      cleanup = () => {
        if (closed) {
          return;
        }

        closed = true;
        clearInterval(keepAliveId);
        unsubscribe();
        request.signal.removeEventListener("abort", cleanup);

        try {
          controller.close();
        } catch {
          // The client may have already closed the stream.
        }
      };

      request.signal.addEventListener("abort", cleanup, { once: true });
      send(": connected\n\n");
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
      "X-Accel-Buffering": "no",
    },
  });
}
