"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { PhoneIncoming, PhoneOff, Video } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import { callState, type VideoCall } from "@/lib/calls/callMessage";
import { callRequest, type CallResponse } from "@/services/calls/callService";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import DailyFrame from "./DailyFrame";

const Context = createContext<{
  start: (conversationId: string) => void;
  open: (callId: string) => void;
  busy: boolean;
} | null>(null);
export function useCalls() {
  return useContext(Context);
}
export default function CallProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [calls, setCalls] = useState<VideoCall[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [locallyLeft, setLocallyLeft] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<{
    id: string;
    roomUrl: string;
    token: string;
  } | null>(null);
  const [joinError, setJoinError] = useState("");
  const [joinAttempt, setJoinAttempt] = useState(0);
  const identity = useRef<string | null>(null);
  const pending = useRef(false);
  const revision = useRef(0);
  useEffect(() => {
    let alive = true;
    const apply = (id: string | null) => {
      if (!alive || identity.current === id) return;
      identity.current = id;
      setUserId(id);
      setCalls([]);
      setSelectedId(null);
      setCredentials(null);
    };
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) =>
      apply(session?.user.id ?? null),
    );
    void supabase.auth
      .getSession()
      .then(({ data }) => apply(data.session?.user.id ?? null));
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);
  const refresh = useCallback(async () => {
    const id = identity.current;
    const version = revision.current;
    if (!id || pending.current) return;
    pending.current = true;
    try {
      const result = await callRequest<{
        userId: string;
        calls: VideoCall[];
      }>();
      if (
        identity.current === id &&
        result.userId === id &&
        revision.current === version
      )
        setCalls(result.calls);
    } catch {
      /* Starting or answering surfaces errors; background checks stay unobtrusive. */
    } finally {
      pending.current = false;
    }
  }, []);
  useEffect(() => {
    if (!userId) return;
    const timeout = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), 4000);
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    const channel = supabase
      .channel(`video-calls:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        focus,
      )
      .subscribe();
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
      window.removeEventListener("focus", focus);
      void supabase.removeChannel(channel);
    };
  }, [userId, refresh]);
  const selected = calls.find((call) => call.id === selectedId);
  const incoming = calls.find(
    (call) => call.recipientId === userId && callState(call) === "ringing",
  );
  const shown = selected ?? incoming;
  const state = shown ? callState(shown) : null;
  const selectedState = selected ? callState(selected) : null;
  const deadline = shown
    ? state === "ringing"
      ? shown.ringingUntil
      : state === "active"
        ? shown.expiresAt
        : null
    : null;
  useEffect(() => {
    if (!deadline) return;
    const timer = window.setTimeout(
      () => setCalls((current) => [...current]),
      Math.max(0, deadline - Date.now()) + 50,
    );
    return () => clearTimeout(timer);
  }, [deadline]);
  const actionPending = useRef(false);
  const run = useCallback(
    async (action: string, callId: string, conversationId?: string) => {
      if (actionPending.current) return;
      actionPending.current = true;
      setBusy(true);
      if (action === "end") {
        setLocallyLeft(callId);
        setCredentials(null);
      }
      revision.current += 1;
      const actor = identity.current;
      try {
        const result = await callRequest<CallResponse>({
          action,
          callId,
          conversationId,
        });
        if (actor !== identity.current) return;
        setCalls((current) => [
          result.call,
          ...current.filter((c) => c.id !== result.call.id),
        ]);
        if (action === "start" || action === "accept")
          setSelectedId(result.call.id);
        if (action === "end" || action === "decline") {
          setSelectedId(null);
          setCredentials(null);
        }
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Unable to connect the call.",
        );
        void refresh();
      } finally {
        revision.current += 1;
        actionPending.current = false;
        setBusy(false);
      }
    },
    [refresh],
  );
  useEffect(() => {
    if (!selectedId || selectedState !== "active") return;
    let alive = true;
    const actor = identity.current;
    void callRequest<CallResponse>({ action: "join", callId: selectedId })
      .then((result) => {
        if (
          alive &&
          actor === identity.current &&
          result.roomUrl &&
          result.token
        ) {
          setJoinError("");
          setCredentials({
            id: selectedId,
            roomUrl: result.roomUrl,
            token: result.token,
          });
        }
      })
      .catch((error) => {
        if (alive)
          setJoinError(
            error instanceof Error ? error.message : "Unable to join the call.",
          );
      });
    return () => {
      alive = false;
    };
  }, [selectedId, selectedState, joinAttempt]);
  const start = (conversationId: string) => {
    if (selected && ["ringing", "active"].includes(callState(selected))) {
      toast.info("Finish your current call first.");
      return;
    }
    setJoinError("");
    setLocallyLeft(null);
    setCredentials(null);
    void run("start", crypto.randomUUID(), conversationId);
  };
  const open = (callId: string) => {
    setJoinError("");
    setLocallyLeft(null);
    setSelectedId(callId);
    void refresh();
  };
  const otherName = shown
    ? shown.callerId === userId
      ? shown.recipientName
      : shown.callerName
    : "";
  const terminal = state && !["ringing", "active"].includes(state);
  const active = calls.find((call) => callState(call) === "active");
  return (
    <Context.Provider value={{ start, open, busy }}>
      {children}
      {!shown && active && (
        <Button
          className="fixed bottom-5 right-5 z-40 shadow-lg"
          onClick={() => open(active.id)}
        >
          <Video className="size-4" />
          Return to call
        </Button>
      )}
      <Dialog
        open={Boolean(shown)}
        onOpenChange={(value) => {
          if (!value && terminal) setSelectedId(null);
        }}
      >
        <DialogContent
          showCloseButton={false}
          className={state === "active" ? "sm:max-w-5xl" : "sm:max-w-md"}
          onEscapeKeyDown={(event) => {
            if (!terminal) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (!terminal) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Video className="size-5" />
              {otherName}
            </DialogTitle>
            <DialogDescription>
              {state === "ringing"
                ? shown?.callerId === userId
                  ? "Calling… Waiting for an answer."
                  : "Incoming video call"
                : state === "active"
                  ? "Video call · Check your camera and microphone before joining."
                  : state === "missed"
                    ? "No answer. The call timed out."
                    : `Call ${state ?? "finished"}.`}
            </DialogDescription>
          </DialogHeader>
          {shown && state === "active" && (
            <>
              {locallyLeft === shown.id ? (
                <p role="status" className="py-8 text-sm text-muted-foreground">
                  You have left the video room.{" "}
                  {busy
                    ? "Confirming the call has ended…"
                    : "If the call could not be ended, use End call to retry."}
                </p>
              ) : credentials?.id === shown.id ? (
                <DailyFrame
                  key={shown.id}
                  roomUrl={credentials.roomUrl}
                  token={credentials.token}
                />
              ) : joinError ? (
                <div role="alert" className="space-y-3">
                  <p className="text-sm text-destructive">{joinError}</p>
                  <Button
                    variant="outline"
                    onClick={() => setJoinAttempt((value) => value + 1)}
                  >
                    Retry connection
                  </Button>
                </div>
              ) : (
                <p
                  role="status"
                  className="py-10 text-center text-muted-foreground"
                >
                  Connecting to video…
                </p>
              )}
            </>
          )}
          {shown && (
            <div className="flex flex-wrap justify-end gap-2">
              {state === "ringing" && shown.recipientId === userId && (
                <>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => void run("decline", shown.id)}
                  >
                    <PhoneOff className="size-4" />
                    Decline
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() => void run("accept", shown.id)}
                  >
                    <PhoneIncoming className="size-4" />
                    Accept
                  </Button>
                </>
              )}
              {(state === "active" ||
                (state === "ringing" && shown.callerId === userId)) && (
                <Button
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void run("end", shown.id)}
                >
                  <PhoneOff className="size-4" />
                  {state === "ringing" ? "Cancel call" : "End call"}
                </Button>
              )}
              {terminal && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedId(null);
                    setCredentials(null);
                  }}
                >
                  Close
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Context.Provider>
  );
}
