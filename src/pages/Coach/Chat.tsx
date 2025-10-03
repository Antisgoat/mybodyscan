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
import { auth, db, functions } from "@/lib/firebase";
import { useUserProfile } from "@/hooks/useUserProfile";
import type { CoachPlanSession } from "@/hooks/useUserProfile";
import { formatDistanceToNow } from "date-fns";
import { fetchAppCheckToken } from "@/lib/appCheck";

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
  const uid = auth.currentUser?.uid ?? null;

  useEffect(() => {
    if (!uid) {
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
  }, [uid]);

  const hasMessages = messages.length > 0;

  const handleSend = async () => {
    if (pending || demo) {
      if (demo) demoToast();
      return;
    }
    const trimmed = input.trim();
    if (!trimmed) return;
    setPending(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("auth");
      const [token, appCheckToken] = await Promise.all([
        user.getIdToken(),
        fetchAppCheckToken(),
      ]);
      if (!appCheckToken) {
        const error: any = new Error("App Check required");
        error.code = "app_check";
        throw error;
      }
      const response = await fetch("/api/coach/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Firebase-AppCheck": appCheckToken,
        },
        body: JSON.stringify({ text: trimmed }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const description = typeof data?.error === "string" ? data.error : "Unable to send message.";
        toast({ title: "Message not sent", description, variant: "destructive" });
        return;
      }
      setInput("");
    } catch (error: any) {
      const description =
        error?.code === "app_check"
          ? "We couldn’t verify your App Check token. Refresh and try again."
          : error?.message ?? "Check your connection.";
      toast({ title: "Message not sent", description, variant: "destructive" });
    } finally {
      setPending(false);
    }
  };

  const regeneratePlan = async () => {
    if (demo) {
      demoToast();
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
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <Seo title="Coach Chat – MyBodyScan" description="Talk to your AI coach and refresh your weekly plan." />
      <AppHeader />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
        <NotMedicalAdviceBanner />
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
                <Textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder={demo ? "Sign in to chat with your coach" : "Share wins or ask for tweaks..."}
                  rows={4}
                  disabled={pending || demo}
                />
                <div className="flex justify-end">
                  <Button onClick={handleSend} disabled={pending || demo || !input.trim()}>
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
                <Button onClick={regeneratePlan} disabled={regenerating || demo} className="w-full">
                  {regenerating ? "Regenerating..." : "Regenerate weekly plan"}
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
    </div>
  );
}
