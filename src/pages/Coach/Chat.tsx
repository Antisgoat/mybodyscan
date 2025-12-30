import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { BottomNav } from "@/components/BottomNav";
import { NotMedicalAdviceBanner } from "@/components/NotMedicalAdviceBanner";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useDemoMode } from "@/components/DemoModeProvider";
import { demoToast } from "@/lib/demoToast";
import { useUserProfile } from "@/hooks/useUserProfile";
import type { CoachPlanSession } from "@/hooks/useUserProfile";
import { formatDistanceToNow } from "date-fns";
import { coachChatApi, type CoachChatRequest } from "@/lib/api/coach";
import { call } from "@/lib/callable";
import { useAuthUser } from "@/lib/auth";
import { ErrorBoundary } from "@/components/system/ErrorBoundary";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { coachChatCollectionPath } from "@/lib/paths";
import {
  coachChatCollection,
  coachThreadDoc,
  coachThreadMessagesCollection,
  coachThreadsCollection,
} from "@/lib/db/coachPaths";
import { buildErrorToast } from "@/lib/errorToasts";
import { demoCoach } from "@/lib/demoDataset";
import { demoGuard } from "@/lib/demoGuard";
import { useSystemHealth } from "@/hooks/useSystemHealth";
import { computeFeatureStatuses } from "@/lib/envStatus";
import { reportError } from "@/lib/telemetry";
import { setDoc } from "@/lib/dbWrite";
import { sortCoachThreadMessages } from "@/lib/coach/threadStore";
import { toDateOrNull } from "@/lib/time";
import { useCoachTodayAtAGlance } from "@/hooks/useCoachTodayAtAGlance";
import { canUseCoach } from "@/lib/entitlements";
import { recordPermissionDenied } from "@/lib/devDiagnostics";
import { useEntitlements } from "@/lib/entitlements/store";
import { isNative } from "@/lib/platform";

declare global {
  interface Window {
    webkitSpeechRecognition?: any;
    SpeechRecognition?: any;
  }
}

type ChatRole = "user" | "assistant";
interface ThreadMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: Date;
  suggestions?: string[] | null;
  usedLLM?: boolean;
}

interface ThreadMeta {
  id: string;
  updatedAt: Date;
  createdAt: Date;
  lastMessagePreview?: string | null;
}

const DEMO_THREAD_ID = "demo-thread";
const DEMO_CHAT_MESSAGES: ThreadMessage[] = demoCoach.messages.flatMap(
  (msg, index) => {
    const created = new Date(
      Date.now() - (demoCoach.messages.length - index) * 60 * 60 * 1000
    );
    return [
      {
        id: `${msg.id}-u`,
        role: "user",
        content: msg.message,
        createdAt: created,
      },
      {
        id: `${msg.id}-a`,
        role: "assistant",
        content: msg.reply,
        createdAt: new Date(created.getTime() + 1000),
        usedLLM: true,
      },
    ] satisfies ThreadMessage[];
  }
);

const sortMessages = sortCoachThreadMessages;

function isPermissionDenied(err: any) {
  return (
    err?.code === "permission-denied" ||
    err?.code === "permission_denied" ||
    String(err?.code || "").includes("permission-denied")
  );
}

function PlanSession({ session }: { session: CoachPlanSession }) {
  return (
    <div className="rounded-lg border border-dashed border-muted-foreground/30 p-3">
      <p className="font-medium text-foreground">{session.day}</p>
      {session.blocks.map((block, idx) => (
        <div key={idx} className="mt-2 space-y-1 text-sm">
          <p className="font-semibold text-primary/80">{block.title}</p>
          <p className="text-muted-foreground">{block.focus}</p>
          <ul className="list-disc pl-4 text-muted-foreground/90">
            {block.work.map((item, workIdx) => (
              <li key={workIdx}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default function CoachChatPage() {
  const { toast } = useToast();
  const demo = useDemoMode();
  const { plan } = useUserProfile();
  const location = useLocation();
  const { entitlements, loading: entitlementsLoading } = useEntitlements();
  const missingThreadUpdatedAtRef = useRef<Set<string>>(new Set());
  const missingMessageCreatedAtRef = useRef<Set<string>>(new Set());
  const [threads, setThreads] = useState<ThreadMeta[]>(() =>
    demo
      ? [
          {
            id: DEMO_THREAD_ID,
            createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            updatedAt: new Date(),
            lastMessagePreview: "Demo conversation",
          },
        ]
      : []
  );
  const [activeThreadId, setActiveThreadId] = useState<string | null>(() =>
    demo ? DEMO_THREAD_ID : null
  );
  const [messages, setMessages] = useState<ThreadMessage[]>(() =>
    demo ? DEMO_CHAT_MESSAGES : []
  );
  const [pending, setPending] = useState(false);
  const [input, setInput] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const [coachError, setCoachError] = useState<string | null>(null);
  const [hydratingHistory, setHydratingHistory] = useState(false);
  const [listening, setListening] = useState(false);
  const [recognizer, setRecognizer] = useState<any | null>(null);
  const getSpeechRecognitionCtor = () =>
    typeof window !== "undefined"
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : null;
  const supportsSpeech = Boolean(getSpeechRecognitionCtor());
  const { health: systemHealth } = useSystemHealth();
  const { coachConfigured } = computeFeatureStatuses(systemHealth ?? undefined);
  const coachPrereqMessage =
    systemHealth?.openaiConfigured === false ||
    systemHealth?.openaiKeyPresent === false
        ? "Coach chat requires the OpenAI key (OPENAI_API_KEY). Ask an admin to add it."
        : coachConfigured === false
          ? "Coach chat is offline until the backend configuration is completed."
          : null;
  const coachAvailable = coachConfigured && !coachPrereqMessage;
  const coachEntitled = canUseCoach({
    demo,
    entitlements,
  });
  const { totals, latestScan } = useCoachTodayAtAGlance();

  const startListening = () => {
    if (!supportsSpeech || listening) return;
    const Ctor: any = getSpeechRecognitionCtor();
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = true;
    rec.onresult = (e: any) => {
      let t = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        t += e.results[i][0].transcript;
      }
      setInput((prev) => (prev ? prev + " " : "") + t.trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.start();
    setRecognizer(rec);
    setListening(true);
  };
  const stopListening = () => {
    try {
      recognizer?.stop?.();
    } catch {
      // ignore
    }
    setListening(false);
  };
  useEffect(
    () => () => {
      try {
        recognizer?.stop?.();
      } catch {
        // ignore
      }
    },
    [recognizer]
  );

  // auth + app check from PR2 (keep!)
  const { user, authReady } = useAuthUser();
  const appCheckReady = true;
  const signUpHref = `/auth?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`;

  // derive uid only after auth is ready
  const uid = authReady ? (user?.uid ?? null) : null;
  const initializing = !authReady;
  const threadStorageKey = uid ? `mbs_coach_active_thread_v1:${uid}` : null;
  const refreshAuthTokenSoft = useCallback(async () => {
    try {
      if (user && typeof (user as any).getIdToken === "function") {
        await user.getIdToken(true);
      }
    } catch {
      // ignore
    }
  }, [user]);

  useEffect(() => {
    if (demo) {
      setThreads([
        {
          id: DEMO_THREAD_ID,
          createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          updatedAt: new Date(),
          lastMessagePreview: "Demo conversation",
        },
      ]);
      setActiveThreadId(DEMO_THREAD_ID);
      setMessages(DEMO_CHAT_MESSAGES);
      setHydratingHistory(false);
      return;
    }
    if (!authReady || !appCheckReady || !uid) {
      setThreads([]);
      setActiveThreadId(null);
      setMessages([]);
      setHydratingHistory(false);
      return;
    }
    if (entitlementsLoading) {
      setHydratingHistory(true);
      return;
    }
    if (!coachEntitled) {
      // Avoid noisy permission-denied loops when a user truly isn't eligible.
      setThreads([]);
      setActiveThreadId(null);
      setMessages([]);
      setHydratingHistory(false);
      setCoachError(
        isNative()
          ? "Coach is a Pro feature. Upgrade to Pro to unlock Coach."
          : "Coach is a Pro feature. Visit Plans to upgrade and unlock Coach."
      );
      return;
    }
    setHydratingHistory(true);
    let warned = false;
    let retriedAuth = false;
    const threadsQuery = query(
      coachThreadsCollection(uid),
      orderBy("updatedAt", "desc"),
      limit(20)
    );
    const subscribe = () =>
      onSnapshot(
        threadsQuery,
        (snapshot) => {
          const now = new Date();
          const nextThreads: ThreadMeta[] = snapshot.docs
            .map((snap) => {
              const data = (snap.data?.() as any) ?? null;
              if (!data) return null;
              const createdAtRaw = data?.createdAt;
              const updatedAtRaw = data?.updatedAt;
              const createdAt = toDateOrNull(createdAtRaw) ?? now;
              const updatedAt = toDateOrNull(updatedAtRaw) ?? createdAt;
              if (!toDateOrNull(updatedAtRaw)) {
                const key = snap.id;
                if (!missingThreadUpdatedAtRef.current.has(key)) {
                  missingThreadUpdatedAtRef.current.add(key);
                  void reportError({
                    kind: "data_missing",
                    message: "coachThread missing updatedAt",
                    extra: { threadId: snap.id },
                  });
                }
              }
              return {
                id: snap.id,
                createdAt,
                updatedAt,
                lastMessagePreview:
                  typeof data?.lastMessagePreview === "string"
                    ? data.lastMessagePreview
                    : null,
              } satisfies ThreadMeta;
            })
            .filter((t): t is ThreadMeta => Boolean(t))
            .sort((a, b) => {
              const am = a.updatedAt?.getTime?.() ?? a.createdAt?.getTime?.() ?? 0;
              const bm = b.updatedAt?.getTime?.() ?? b.createdAt?.getTime?.() ?? 0;
              if (am !== bm) return bm - am;
              const ac = a.createdAt?.getTime?.() ?? 0;
              const bc = b.createdAt?.getTime?.() ?? 0;
              if (ac !== bc) return bc - ac;
              return a.id.localeCompare(b.id);
            });

          // If no threads exist yet, fall back to legacy chat history (read-only)
          // so existing users don't "lose" their stored messages.
          if (!nextThreads.length) {
            setThreads([
              {
                id: "__legacy",
                createdAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
                updatedAt: new Date(),
                lastMessagePreview: "Previous chats",
              },
            ]);
            setActiveThreadId((prev) => prev ?? "__legacy");
            setHydratingHistory(false);
            return;
          }

          setThreads(nextThreads);
          setHydratingHistory(false);

          const stored =
            threadStorageKey && typeof window !== "undefined"
              ? window.localStorage.getItem(threadStorageKey)
              : null;
          const storedValid = stored && nextThreads.some((t) => t.id === stored);
          setActiveThreadId((prev) => {
            if (prev && nextThreads.some((t) => t.id === prev)) return prev;
            if (storedValid) return stored!;
            return nextThreads[0]!.id;
          });
        },
        async (err) => {
          console.warn("coachThreads.snapshot_failed", err);
          recordPermissionDenied(err, {
            op: "coachThreads.onSnapshot",
            path: uid ? `users/${uid}/coachThreads` : undefined,
          });
          void reportError({
            kind: "coach_threads_snapshot_failed",
            message: err?.message || "coachThreads snapshot failed",
            code: err?.code || "snapshot_failed",
            extra: { uid, entitled: coachEntitled },
          });
          setHydratingHistory(false);
          if (isPermissionDenied(err) && !retriedAuth) {
            retriedAuth = true;
            await refreshAuthTokenSoft();
            unsubscribe();
            unsubscribe = subscribe();
            return;
          }
          if (!warned) {
            warned = true;
            // Keep this inline (not a scary global toast) so the rest of the page remains usable.
            setCoachError(
              isPermissionDenied(err)
                ? "Coach is temporarily unavailable. Please try again later or contact support."
                : "Unable to load coach chats. Please try again in a moment."
            );
          }
        }
      );

    let unsubscribe = subscribe();
    return () => unsubscribe();
  }, [
    authReady,
    uid,
    demo,
    threadStorageKey,
    toast,
    refreshAuthTokenSoft,
    coachEntitled,
  ]);

  useEffect(() => {
    if (demo) {
      setMessages(DEMO_CHAT_MESSAGES);
      return;
    }
    if (!authReady || !uid || !activeThreadId) {
      setMessages([]);
      return;
    }

    // Legacy read-only view (previous schema).
    if (activeThreadId === "__legacy") {
      let warned = false;
      let retriedAuth = false;
      const chatPath = coachChatCollectionPath(uid);
      if (import.meta.env.DEV) {
        const segmentCount = chatPath.split("/").length;
        console.assert(
          segmentCount === 5,
          `[coach-chat] expected 5 segments, received ${segmentCount}`
        );
      }
      const legacyQuery = query(
        coachChatCollection(uid),
        orderBy("createdAt", "desc"),
        limit(10)
      );
      const subscribeLegacy = () =>
        onSnapshot(
          legacyQuery,
          (snapshot) => {
            const next = snapshot.docs.flatMap((snap) => {
              const data = snap.data() as any;
              const created = toDateOrNull(data?.createdAt) ?? new Date();
              const suggestions = Array.isArray(data?.suggestions)
                ? data.suggestions
                    .map((entry: any) =>
                      typeof entry === "string" ? entry.trim() : ""
                    )
                    .filter((entry: string) => entry.length > 0)
                : undefined;
              const text = typeof data?.text === "string" ? data.text : "";
              const response =
                typeof data?.response === "string" ? data.response : "";
              const usedLLM = Boolean(data?.usedLLM);
              return [
                {
                  id: `${snap.id}-u`,
                  role: "user" as const,
                  content: text,
                  createdAt: created,
                },
                {
                  id: `${snap.id}-a`,
                  role: "assistant" as const,
                  content: response,
                  createdAt: new Date(created.getTime() + 1000),
                  usedLLM,
                  suggestions: suggestions ?? null,
                },
              ] satisfies ThreadMessage[];
            });
            setMessages(sortMessages(next));
          },
          async (err) => {
            console.warn("coachChat.snapshot_failed", err);
          recordPermissionDenied(err, {
            op: "coachChatLegacy.onSnapshot",
            path: uid ? coachChatCollectionPath(uid) : undefined,
          });
            void reportError({
              kind: "coach_legacy_snapshot_failed",
              message: err?.message || "coachChat legacy snapshot failed",
              code: err?.code || "snapshot_failed",
              extra: { uid, entitled: coachEntitled },
            });
            if (isPermissionDenied(err) && !retriedAuth) {
              retriedAuth = true;
              await refreshAuthTokenSoft();
              unsubscribe();
              unsubscribe = subscribeLegacy();
              return;
            }
            if (!warned) {
              warned = true;
              setCoachError(
                isPermissionDenied(err)
                  ? "Coach is temporarily unavailable. Please try again later or contact support."
                  : "Unable to load recent coach messages."
              );
            }
          }
        );
      let unsubscribe = subscribeLegacy();
      return () => unsubscribe();
    }

    if (threadStorageKey && typeof window !== "undefined") {
      window.localStorage.setItem(threadStorageKey, activeThreadId);
    }

    const messagesQuery = query(
      coachThreadMessagesCollection(uid, activeThreadId),
      orderBy("createdAt", "asc"),
      limit(80)
    );
    let warned = false;
    let retriedAuth = false;
    const subscribeMessages = () =>
      onSnapshot(
        messagesQuery,
        (snapshot) => {
          const next = snapshot.docs.map((snap) => {
            const data = snap.data() as any;
            const createdAtRaw = data?.createdAt;
            const created = toDateOrNull(createdAtRaw) ?? new Date();
            if (!toDateOrNull(createdAtRaw)) {
              const key = `${activeThreadId}:${snap.id}`;
              if (!missingMessageCreatedAtRef.current.has(key)) {
                missingMessageCreatedAtRef.current.add(key);
                void reportError({
                  kind: "data_missing",
                  message: "coachThread message missing createdAt",
                  extra: { threadId: activeThreadId, messageId: snap.id },
                });
              }
            }
            const role = data?.role === "assistant" ? "assistant" : "user";
            const suggestions = Array.isArray(data?.suggestions)
              ? data.suggestions
                  .map((entry: any) =>
                    typeof entry === "string" ? entry.trim() : ""
                  )
                  .filter((entry: string) => entry.length > 0)
              : null;
            return {
              id: snap.id,
              role,
              content: typeof data?.content === "string" ? data.content : "",
              createdAt: created,
              usedLLM: role === "assistant",
              suggestions,
            } satisfies ThreadMessage;
          });
          setMessages(next);
        },
        async (err) => {
          console.warn("coachThread.messages.snapshot_failed", err);
          recordPermissionDenied(err, {
            op: "coachThreadMessages.onSnapshot",
            path:
              uid && activeThreadId
                ? `users/${uid}/coachThreads/${activeThreadId}/messages`
                : undefined,
          });
          void reportError({
            kind: "coach_thread_messages_snapshot_failed",
            message: err?.message || "coachThread messages snapshot failed",
            code: err?.code || "snapshot_failed",
            extra: { uid, threadId: activeThreadId, entitled: coachEntitled },
          });
          if (isPermissionDenied(err) && !retriedAuth) {
            retriedAuth = true;
            await refreshAuthTokenSoft();
            unsubscribe();
            unsubscribe = subscribeMessages();
            return;
          }
          if (!warned) {
            warned = true;
            setCoachError(
              isPermissionDenied(err)
                ? "Coach is temporarily unavailable. Please try again later or contact support."
                : "Unable to load coach thread."
            );
          }
        }
      );
    let unsubscribe = subscribeMessages();

    return () => unsubscribe();
  }, [
    authReady,
    uid,
    demo,
    activeThreadId,
    threadStorageKey,
    refreshAuthTokenSoft,
    coachEntitled,
  ]);

  const hasMessages = messages.length > 0;
  const readOnlyDemo = demo && !user;
  const showPlanMissing = !demo && !plan;

  const handleNewChat = async () => {
    if (demo) {
      demoToast();
      return;
    }
    if (!authReady || !uid) {
      toast({
        title: "Sign in required",
        description: "Sign in to start a new coach chat.",
        variant: "destructive",
      });
      return;
    }
    const threadId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `thread-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    try {
      const payload = {
        uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        status: "active",
      } as any;
      try {
        await setDoc(coachThreadDoc(uid, threadId), payload, {
          merge: true,
        } as any);
      } catch (err: any) {
        if (isPermissionDenied(err)) {
          await refreshAuthTokenSoft();
          await setDoc(coachThreadDoc(uid, threadId), payload, {
            merge: true,
          } as any);
        } else {
          throw err;
        }
      }
    } catch (err: any) {
      console.warn("coachChat.new_thread_failed", err);
      toast({
        title: "Unable to start a new chat",
        description: isPermissionDenied(err)
          ? "We couldn’t start a new coach chat. Please try again, and contact support if this continues."
          : "Please try again in a moment.",
        variant: "destructive",
      });
      setCoachError(
        isPermissionDenied(err)
          ? "We couldn’t start a new coach chat. Please try again, and contact support if this continues."
          : "Unable to start a new coach chat."
      );
      return;
    }
    setThreads((prev) => [
      {
        id: threadId,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastMessagePreview: null,
      },
      ...prev.filter((t) => t.id !== "__legacy" && t.id !== threadId),
    ]);
    setActiveThreadId(threadId);
    setInput("");
    setCoachError(null);
  };

  const handleSend = async () => {
    if (pending) {
      return;
    }
    if (demo) {
      demoToast();
      return;
    }
    if (!coachAvailable) {
      const message =
        coachPrereqMessage ??
        "Coach chat is disabled until it is fully configured.";
      setCoachError(message);
      return;
    }
    if (!demoGuard("coach chat")) {
      return;
    }

    const sanitized = input
      .split("")
      .map((ch) => {
        const code = ch.codePointAt(0) ?? 0;
        if (code < 32 || code === 127) return " ";
        return ch;
      })
      .join("")
      .replace(/\s+/g, " ")
      .trim();

    if (!sanitized) {
      setInput("");
      return;
    }

    if (initializing) {
      toast({
        title: "Still connecting",
        description: "Secure chat is initializing. Try again shortly.",
      });
      return;
    }

    setPending(true);
    setCoachError(null);
    try {
      if (!uid) {
        throw new Error("auth_required");
      }

      const ensureId = () =>
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

      // If we're viewing legacy history, or no thread exists yet, start a new thread.
      let threadId =
        activeThreadId && activeThreadId !== "__legacy" ? activeThreadId : null;
      if (!threadId) {
        threadId = ensureId();
        await setDoc(coachThreadDoc(uid, threadId), {
          uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          status: "active",
        } as any);
        setThreads((prev) => {
          const next: ThreadMeta[] = [
            {
              id: threadId!,
              createdAt: new Date(),
              updatedAt: new Date(),
              lastMessagePreview: null,
            },
            ...prev.filter((t) => t.id !== "__legacy"),
          ];
          return next;
        });
        setActiveThreadId(threadId);
      }

      const messageId = ensureId();
      // Optimistic UI: add the user message immediately so the chat feels responsive.
      // Firestore snapshot will reconcile this once the write lands.
      setMessages((prev) =>
        sortMessages([
          ...prev,
          {
            id: messageId,
            role: "user",
            content: sanitized,
            createdAt: new Date(),
          },
        ])
      );
      await setDoc(
        doc(
          coachThreadMessagesCollection(uid, threadId),
          messageId
        ) as any,
        {
          role: "user",
          content: sanitized,
          createdAt: serverTimestamp(),
        } as any,
        { merge: true } as any
      ).catch(async (err: any) => {
        // Safari/Auth edge: if token is stale, refresh once then retry.
        // (The messageId is deterministic so this is idempotent.)
        if (isPermissionDenied(err)) {
          await refreshAuthTokenSoft();
          return setDoc(
            doc(
              coachThreadMessagesCollection(uid, threadId),
              messageId
            ) as any,
            {
              role: "user",
              content: sanitized,
              createdAt: serverTimestamp(),
            } as any,
            { merge: true } as any
          );
        }
        throw err;
      });

      const payload: CoachChatRequest = {
        threadId,
        messageId,
        message: sanitized,
        // Optional context: keep the client thin by only sending values we already have
        // (today totals + plan goals + last scan). The server will fill any missing fields.
        context: demo
          ? undefined
          : {
              todayCalories: totals.calories,
              todayCaloriesGoal: plan?.calorieTarget,
              todayProteinGrams: totals.proteinGrams,
              todayCarbGrams: totals.carbGrams,
              todayFatGrams: totals.fatGrams,
              todayProteinGoalGrams: plan?.proteinFloor,
              lastScanDate: latestScan?.createdAt?.toISOString(),
              lastScanBodyFatPercent: latestScan?.bodyFatPercent,
            },
      };
      await coachChatApi(payload);
      setInput("");
    } catch (error: any) {
      console.error("coachChat error", error);
      recordPermissionDenied(error, { op: "coachChat.callable" });
      const code = (error as any)?.code as string | undefined;
      const errMessage =
        typeof error?.message === "string" && error.message !== "Bad Request"
          ? error.message
          : "";
      const fallback =
        code === "invalid_message"
          ? "Please enter a question for the coach."
          : "Coach is unavailable right now; please try again shortly.";
      const debugId = (error as any)?.debugId;
      const message = debugId
        ? `${errMessage || fallback} (ref ${debugId.slice(0, 8)})`
        : errMessage || fallback;
      setCoachError(message);
      void reportError({
        kind: "client_error",
        message: errMessage || "coachChat failed",
        code: error?.code || "client_error",
        extra: { fn: "coachChat" },
      });
    } finally {
      setPending(false);
    }
  };

  const regeneratePlan = async () => {
    if (demo) {
      demoToast();
      return;
    }
    if (!authReady) {
      toast({
        title: "Initializing",
        description: "Secure services are almost ready. Try again in a moment.",
      });
      return;
    }
    setRegenerating(true);
    try {
      await call("generatePlan", {});
      toast({
        title: "Weekly plan updated",
        description: "Your coach plan was regenerated.",
      });
    } catch (error) {
      toast(
        buildErrorToast(error, {
          fallback: {
            title: "Unable to regenerate",
            description: "Please try again in a moment.",
            variant: "destructive",
          },
        })
      );
    } finally {
      setRegenerating(false);
    }
  };

  const formattedMessages = useMemo(() => sortMessages(messages), [messages]);

  return (
    <div
      className="min-h-screen bg-background pb-16 md:pb-0"
      data-testid="route-coach"
    >
      <Seo
        title="Coach Chat ? MyBodyScan"
        description="Talk to your AI coach and refresh your weekly plan."
      />
      <ErrorBoundary
        title="Coach chat crashed"
        description="Retry to reload your recent messages."
      >
        <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
          <NotMedicalAdviceBanner />
          {readOnlyDemo ? (
            <Alert variant="default" data-testid="coach-demo-intro">
              <AlertTitle>Demo preview</AlertTitle>
              <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span>{demoCoach.intro}</span>
                <Button asChild size="sm" variant="outline">
                  <a href={signUpHref}>Sign up to use this feature</a>
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
          {showPlanMissing ? (
            <Alert variant="default" data-testid="coach-plan-missing">
              <AlertTitle>No plan yet ? create one</AlertTitle>
              <AlertDescription>
                Start a conversation or regenerate the weekly plan below to get
                your first program.
              </AlertDescription>
            </Alert>
          ) : null}
          {initializing && (
            <Card className="border border-dashed border-primary/40 bg-primary/5">
              <CardContent className="text-sm text-primary">
                Preparing secure chat? replies will appear once verification
                completes.
              </CardContent>
            </Card>
          )}
          {!demo &&
          authReady &&
          appCheckReady &&
          !hasMessages &&
          hydratingHistory ? (
            <Card className="border border-dashed">
              <CardContent className="text-sm text-muted-foreground">
                Loading your recent coach messages…
              </CardContent>
            </Card>
          ) : null}
          <div className="grid gap-6 lg:grid-cols-[1.75fr,1fr]">
            <Card className="border bg-card/60">
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-xl">Coach chat</CardTitle>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className="h-9 rounded-md border bg-background px-3 text-sm"
                      value={activeThreadId ?? ""}
                      onChange={(e) => {
                        const next = e.target.value || null;
                        setActiveThreadId(next);
                        setCoachError(null);
                      }}
                      disabled={!threads.length || readOnlyDemo}
                      aria-label="Select chat thread"
                    >
                      {threads.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.id === "__legacy"
                            ? "Previous chats"
                            : t.lastMessagePreview
                              ? t.lastMessagePreview.slice(0, 28)
                              : `Chat ${t.id.slice(0, 8)}`}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleNewChat}
                      disabled={readOnlyDemo || initializing || !coachAvailable}
                      title={
                        readOnlyDemo
                          ? "Demo preview"
                          : !coachAvailable
                            ? coachPrereqMessage ?? "Coach unavailable"
                            : undefined
                      }
                    >
                      New chat
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div
                  className="rounded-lg border bg-background/60 p-4"
                  data-testid="coach-chat-path"
                  data-path={uid ? coachChatCollectionPath(uid) : ""}
                >
                  {hasMessages ? (
                    <div className="space-y-4">
                      {formattedMessages.map((message) => (
                        <div key={message.id} className="space-y-2">
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">
                            {message.role === "user" ? "You" : "Coach"} ?{" "}
                            {formatDistanceToNow(message.createdAt, {
                              addSuffix: true,
                            })}
                          </div>
                          <div
                            className={
                              message.role === "user"
                                ? "rounded-lg bg-primary/5 p-3 text-sm text-foreground shadow-sm"
                                : "rounded-lg border border-primary/20 bg-background p-3 text-sm leading-relaxed text-foreground"
                            }
                          >
                            {message.content}
                          </div>
                          {message.role === "assistant" ? (
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>Coach</span>
                              <Badge
                                variant={message.usedLLM ? "default" : "secondary"}
                                className="uppercase tracking-wide"
                              >
                                {message.usedLLM ? "LLM" : "Rules"}
                              </Badge>
                            </div>
                          ) : null}
                          {message.role === "assistant" &&
                          message.suggestions &&
                          message.suggestions.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {message.suggestions.map(
                                (suggestion, suggestionIndex) => (
                                  <span
                                    key={`${message.id}-suggestion-${suggestionIndex}`}
                                    className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                                  >
                                    {suggestion}
                                  </span>
                                )
                              )}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No messages yet. Ask a question to get personalized training
                      and nutrition tips.
                    </p>
                  )}
                </div>
                <div className="space-y-3">
                  {!coachAvailable && (
                    <Alert variant="default">
                      <AlertTitle>Coach setup incomplete</AlertTitle>
                      <AlertDescription>
                        {coachPrereqMessage ??
                          "Coach chat is unavailable right now."}
                      </AlertDescription>
                    </Alert>
                  )}
                  {coachError ? (
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                      {coachError}
                    </div>
                  ) : null}
                  <Textarea
                    value={input}
                    onChange={(event) => {
                      setInput(event.target.value);
                      if (coachError) {
                        setCoachError(null);
                      }
                    }}
                    placeholder={
                      readOnlyDemo
                        ? "Demo preview — chat is read-only."
                        : "Share wins or ask for tweaks..."
                    }
                    rows={4}
                    disabled={
                      pending || readOnlyDemo || initializing || !coachAvailable
                    }
                    data-testid="coach-message-input"
                  />
                  <div className="flex justify-end">
                    <div className="flex gap-2 items-center">
                      <Button
                        variant="secondary"
                        onClick={listening ? stopListening : startListening}
                        disabled={
                          !supportsSpeech ||
                          pending ||
                          readOnlyDemo ||
                          initializing ||
                          !coachAvailable
                        }
                        data-testid="coach-mic"
                      >
                        {supportsSpeech
                          ? listening
                            ? "? Stop"
                            : "?? Speak"
                          : "?? N/A"}
                      </Button>
                      {pending ? (
                        <Button disabled data-testid="coach-send-button">
                          Sending...
                        </Button>
                      ) : readOnlyDemo ? (
                        <Button asChild data-testid="coach-send-button">
                          <a href={signUpHref}>Sign up to chat</a>
                        </Button>
                      ) : (
                        <Button
                          onClick={handleSend}
                          disabled={
                            pending ||
                            !input.trim() ||
                            initializing ||
                            !coachAvailable
                          }
                          data-testid="coach-send-button"
                        >
                          Send
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card className="border bg-card/60">
                <CardHeader className="space-y-2">
                  <CardTitle className="text-xl">Weekly plan</CardTitle>
                  {plan ? (
                    <p className="text-sm text-muted-foreground">
                      {plan.days} days ? {plan.split} ? Protein ?{" "}
                      {plan.proteinFloor} g ? Calories ? {plan.calorieTarget}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Generate a plan to see your structured week.
                    </p>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  {readOnlyDemo ? (
                    <Button asChild className="w-full" variant="outline">
                      <a href={signUpHref}>Sign up to use this feature</a>
                    </Button>
                  ) : (
                    <Button
                      onClick={regeneratePlan}
                      disabled={regenerating || initializing}
                      className="w-full"
                    >
                      {regenerating
                        ? plan
                          ? "Regenerating..."
                          : "Creating..."
                        : plan
                          ? "Regenerate weekly plan"
                          : "Create plan"}
                    </Button>
                  )}
                  {plan ? (
                    <div className="space-y-3 text-sm text-muted-foreground">
                      <p>
                        {plan.disclaimer ??
                          "Training guidance for educational use only. Estimates only ? not medical advice."}
                      </p>
                      <div className="space-y-3">
                        {plan.sessions.slice(0, plan.days).map((session) => (
                          <PlanSession key={session.day} session={session} />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Tap regenerate after onboarding to receive a day-by-day
                      split with sets ? reps and RPE.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
        <BottomNav />
      </ErrorBoundary>
    </div>
  );
}
