import { useEffect, useMemo, useRef, useState } from "react";
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
  const [micSupported, setMicSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

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
    const chatQuery = query(
      collection(db, "users", uid, "coach", "chat"),
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

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      return;
    }
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;
    setMicSupported(true);

    const handleResult = (event: any) => {
      try {
        const transcript = Array.from(event.results || [])
          .map((result: any) => result?.[0]?.transcript)
          .filter(Boolean)
          .join(" ")
          .trim();
        if (transcript) {
          setInput((prev) => {
            const existing = prev.trim();
            if (!existing) return transcript;
            return `${existing} ${transcript}`.trim();
          });
        }
      } catch (error) {
        console.warn("coach_mic_parse_error", error);
      }
    };

    const handleEnd = () => {
      setListening(false);
    };

    const handleError = (event: any) => {
      console.warn("coach_mic_error", event?.error || event);
      setListening(false);
    };

    recognition.addEventListener("result", handleResult);
    recognition.addEventListener("end", handleEnd);
    recognition.addEventListener("error", handleError);

    return () => {
      recognition.removeEventListener("result", handleResult);
      recognition.removeEventListener("end", handleEnd);
      recognition.removeEventListener("error", handleError);
      try {
        recognition.stop();
      } catch (error) {
        console.warn("coach_mic_stop_error", (error as Error)?.message);
      }
    };
  }, []);

  const hasMessages = messages.length > 0;

  const handleSend = async () => {
    if (pending || demo) {
      if (demo) demoToast();
      return;
    }

    const sanitized = input
      .replace(/[\u0000-\u001F\u007F]/g, " ") // strip control chars
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

  const toggleMic = () => {
    if (!micSupported) {
      return;
    }
    const recognition = recognitionRef.current;
    if (!recognition) {
      return;
    }
    if (listening) {
      try {
        recognition.stop();
      } catch (error) {
        console.warn("coach_mic_stop_failed", (error as Error)?.message);
      }
      setListening(false);
      return;
    }
    try {
      recognition.start();
      setListening(true);
    } catch (error) {
      console.warn("coach_mic_start_failed", (error as Error)?.message);
      setListening(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0" data-testid="route-coach">
      <Seo title="Coach Chat – MyBodyScan" description="Talk to your AI coach and refresh your weekly plan." />
      <AppHeader />
      <ErrorBoundary title="Coach chat crashed" description="Retry to reload your recent messages.">
        <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
          <NotMedicalAdviceBanner />
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
              <div className="rounded-lg border bg-background/60 p-4">
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
                  data-testid="coach-input"
                />
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <Button
                    type="button"
                    variant={listening ? "destructive" : "outline"}
                    onClick={toggleMic}
                    disabled={!micSupported || pending || demo || initializing}
                    data-testid="coach-mic"
                  >
                    {micSupported ? (listening ? "Stop recording" : "Speak") : "Mic unsupported"}
                  </Button>
                  <Button
                    onClick={handleSend}
                    disabled={pending || demo || !input.trim() || initializing}
                    data-testid="coach-send"
                  >
                    {pending ? "Sending..." : "Send"}
                  </Button>
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
