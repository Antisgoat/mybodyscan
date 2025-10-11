import { useEffect, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { AppHeader } from "@/components/AppHeader";
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
import { db, functions } from "@/lib/firebase";
import { useUserProfile } from "@/hooks/useUserProfile";
import type { CoachPlanSession } from "@/hooks/useUserProfile";
import { formatDistanceToNow } from "date-fns";
import { coachChat as sendCoachChat } from "@/lib/api";
import { useAuthUser } from "@/lib/auth";
import { useAppCheckReady } from "@/components/AppCheckProvider";
import { ErrorBoundary } from "@/components/system/ErrorBoundary";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { coachChatCollectionPath } from "@/lib/paths";

declare global {
  interface Window {
    webkitSpeechRecognition?: any;
    SpeechRecognition?: any;
  }
}

interface ChatMessage {
  id: string;
  text: string;
  response: string;
  createdAt: Date;
  usedLLM: boolean;
}

function sortMessages(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [input, setInput] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const [coachError, setCoachError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [recognizer, setRecognizer] = useState<any | null>(null);
  const getSpeechRecognitionCtor = () => (typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null);
  const supportsSpeech = Boolean(getSpeechRecognitionCtor());

  const startListening = () => {
    if (!supportsSpeech || listening) return;
    const Ctor: any = getSpeechRecognitionCtor();
    const rec = new Ctor();
    rec.lang = "en-US"; rec.interimResults = true; rec.continuous = true;
    rec.onresult = (e: any) => {
      let t = ""; for (let i = e.resultIndex; i < e.results.length; i++) { t += e.results[i][0].transcript; }
      setInput((prev) => (prev ? prev + " " : "") + t.trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.start(); setRecognizer(rec); setListening(true);
  };
  const stopListening = () => {
    try {
      recognizer?.stop?.();
    } catch {
      // ignore
    }
    setListening(false);
  };
  useEffect(() => () => {
    try {
      recognizer?.stop?.();
    } catch {
      // ignore
    }
  }, [recognizer]);

  // auth + app check from PR2 (keep!)
  const { user, authReady } = useAuthUser();
  const appCheckReady = useAppCheckReady();

  // derive uid only after auth is ready
  const uid = authReady ? (user?.uid ?? null) : null;
  const initializing = !authReady || !appCheckReady;

  useEffect(() => {
    if (!authReady || !appCheckReady || !uid) {
      setMessages([]);
      return;
    }
    const chatPath = coachChatCollectionPath(uid);
    if (import.meta.env.DEV) {
      const segmentCount = chatPath.split("/").length;
      console.assert(segmentCount === 3, `[coach-chat] expected 3 segments, received ${segmentCount}`);
    }
    const chatQuery = query(
      collection(db, chatPath),
      orderBy("createdAt", "desc"),
      limit(10)
    );
    const unsubscribe = onSnapshot(chatQuery, (snapshot) => {
      const next = snapshot.docs.map((doc) => {
        const data = doc.data() as {
          text?: string;
          response?: string;
          createdAt?: { toDate?: () => Date };
          usedLLM?: boolean;
        };
        const created = data.createdAt?.toDate?.() ?? new Date();
        return {
          id: doc.id,
          text: data.text ?? "",
          response: data.response ?? "",
          createdAt: created,
          usedLLM: Boolean(data.usedLLM),
        } satisfies ChatMessage;
      });
      setMessages(sortMessages(next));
    });
    return () => unsubscribe();
  }, [authReady, appCheckReady, uid]);

  const hasMessages = messages.length > 0;
  const showPlanMissing = !demo && !plan;

  const handleSend = async () => {
    if (pending || demo) {
      if (demo) demoToast();
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
      await sendCoachChat({ message: sanitized });
      setInput("");
    } catch (error: any) {
      const status = typeof error?.status === "number" ? error.status : null;
      if ((status !== null && status >= 400 && status < 500) || status === 501) {
        setCoachError("Coach temporarily unavailable; please try again.");
      }
    } finally {
      setPending(false);
    }
  };

  const regeneratePlan = async () => {
    if (demo) {
      demoToast();
      return;
    }
    if (!authReady || !appCheckReady) {
      toast({ title: "Initializing", description: "Secure services are almost ready. Try again in a moment." });
      return;
    }
    setRegenerating(true);
    try {
      const callable = httpsCallable(functions, "generatePlan");
      await callable({});
      toast({ title: "Weekly plan updated", description: "Your coach plan was regenerated." });
    } catch (error: any) {
      toast({
        title: "Unable to regenerate",
        description: error?.message ?? "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setRegenerating(false);
    }
  };

  const formattedMessages = useMemo(() => sortMessages(messages), [messages]);

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0" data-testid="route-coach">
      <Seo title="Coach Chat – MyBodyScan" description="Talk to your AI coach and refresh your weekly plan." />
      <AppHeader />
      <ErrorBoundary title="Coach chat crashed" description="Retry to reload your recent messages.">
        <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
          <NotMedicalAdviceBanner />
          {showPlanMissing ? (
            <Alert variant="outline" data-testid="coach-plan-missing">
              <AlertTitle>No plan yet — create one</AlertTitle>
              <AlertDescription>
                Start a conversation or regenerate the weekly plan below to get your first program.
              </AlertDescription>
            </Alert>
          ) : null}
          {initializing && (
            <Card className="border border-dashed border-primary/40 bg-primary/5">
              <CardContent className="text-sm text-primary">
                Preparing secure chat… replies will appear once verification completes.
              </CardContent>
            </Card>
          )}
          <div className="grid gap-6 lg:grid-cols-[1.75fr,1fr]">
          <Card className="border bg-card/60">
            <CardHeader>
              <CardTitle className="text-xl">Coach chat</CardTitle>
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
                          You · {formatDistanceToNow(message.createdAt, { addSuffix: true })}
                        </div>
                        <div className="rounded-lg bg-primary/5 p-3 text-sm text-foreground shadow-sm">
                          {message.text}
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Coach response</span>
                          <Badge variant={message.usedLLM ? "default" : "secondary"} className="uppercase tracking-wide">
                            {message.usedLLM ? "LLM" : "Rules"}
                          </Badge>
                        </div>
                        <div className="rounded-lg border border-primary/20 bg-background p-3 text-sm leading-relaxed text-foreground">
                          {message.response}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Ask a question to get personalized training and nutrition tips.</p>
                )}
              </div>
              <div className="space-y-3">
                {coachError && (
                  <p className="text-sm text-destructive">{coachError}</p>
                )}
                <Textarea
                  value={input}
                  onChange={(event) => {
                    setInput(event.target.value);
                    if (coachError) {
                      setCoachError(null);
                    }
                  }}
                  placeholder={demo ? "Sign in to chat with your coach" : "Share wins or ask for tweaks..."}
                  rows={4}
                  disabled={pending || demo || initializing}
                  data-testid="coach-message-input"
                />
                <div className="flex justify-end">
                  <div className="flex gap-2 items-center">
                    <Button
                      variant="secondary"
                      onClick={listening ? stopListening : startListening}
                      disabled={!supportsSpeech || pending || demo || initializing}
                      data-testid="coach-mic"
                    >
                      {supportsSpeech ? (listening ? "■ Stop" : "🎤 Speak") : "🎤 N/A"}
                    </Button>
                    <Button
                      onClick={handleSend}
                      disabled={pending || demo || !input.trim() || initializing}
                      data-testid="coach-send-button"
                    >
                      {pending ? "Sending..." : "Send"}
                    </Button>
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
                    {plan.days} days · {plan.split} · Protein ≥ {plan.proteinFloor} g · Calories ≈ {plan.calorieTarget}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">Generate a plan to see your structured week.</p>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <Button onClick={regeneratePlan} disabled={regenerating || demo || initializing} className="w-full">
                  {regenerating ? (plan ? "Regenerating..." : "Creating...") : (plan ? "Regenerate weekly plan" : "Create plan")}
                </Button>
                {plan ? (
                  <div className="space-y-3 text-sm text-muted-foreground">
                    <p>
                      {plan.disclaimer ?? "Training guidance for educational use only. Estimates only — not medical advice."}
                    </p>
                    <div className="space-y-3">
                      {plan.sessions.slice(0, plan.days).map((session) => (
                        <PlanSession key={session.day} session={session} />
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Tap regenerate after onboarding to receive a day-by-day split with sets × reps and RPE.
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
