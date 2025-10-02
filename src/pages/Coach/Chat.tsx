import { FormEvent, useMemo, useState } from "react";
import { Send, Sparkles } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Seo } from "@/components/Seo";
import { NotMedicalAdviceBanner } from "@/components/NotMedicalAdviceBanner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { buildUrl, directFunctionUrl } from "@/lib/api";
import { auth } from "@/lib/firebase";
import { useUserProfile } from "@/hooks/useUserProfile";
import { toast } from "@/hooks/use-toast";

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
};

type ChatResponse = {
  messages?: Array<{ role: string; text: string }>;
  suggestions?: string[];
};

export default function CoachChat() {
  const { plan } = useUserProfile();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sleep, setSleep] = useState<string>("");
  const [stress, setStress] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [quickSuggestions, setQuickSuggestions] = useState<string[]>([]);

  const planSummary = useMemo(() => {
    if (!plan) return null;
    return {
      title: plan.programTitle,
      goal: plan.goal,
      days: plan.daysPerWeek,
      equipment: Array.isArray(plan.equipment) ? plan.equipment : [],
    };
  }, [plan]);

  const handleSuggestion = (text: string) => {
    setInput(text);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    const trimmed = input.trim();
    if (!trimmed) {
      toast({ title: "Enter a message", description: "Ask the coach a question before sending." });
      return;
    }
    const user = auth.currentUser;
    if (!user) {
      toast({ title: "Sign in required", description: "Log in to chat with the coach." });
      return;
    }

    const userMessage: ChatMessage = { role: "user", text: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    const payload = {
      text: trimmed,
      context: {
        goal: plan?.goal,
        daysPerWeek: plan?.daysPerWeek,
        equipment: Array.isArray(plan?.equipment) ? plan?.equipment : undefined,
        sleep: sleep ? Number(sleep) : undefined,
        stress: stress || undefined,
      },
    };

    try {
      const token = await user.getIdToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      };
      const body = JSON.stringify(payload);

      const attempt = async (url: string) => {
        const response = await fetch(url, {
          method: "POST",
          headers,
          body,
        });
        if (!response.ok) {
          const error: any = new Error(`chat_status_${response.status}`);
          error.status = response.status;
          throw error;
        }
        return response;
      };

      let response: Response;
      try {
        response = await attempt(buildUrl("/api/coach/chat"));
      } catch (error) {
        response = await attempt(directFunctionUrl("coachChat"));
      }

      const data = (await response.json()) as ChatResponse;
      if (Array.isArray(data?.messages)) {
        const assistant = data.messages.find((message) => message.role === "assistant");
        if (assistant?.text) {
          setMessages((prev) => [...prev, { role: "assistant", text: assistant.text }]);
        }
      }
      if (Array.isArray(data?.suggestions) && data.suggestions.length) {
        setQuickSuggestions(data.suggestions.slice(0, 3));
      }
    } catch (error: any) {
      const code = error?.status;
      if (code === 401) {
        toast({ title: "Session expired", description: "Please sign in again.", variant: "destructive" });
      } else {
        toast({ title: "Coach chat unavailable", description: "Please try again shortly.", variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <Seo title="Coach Chat – MyBodyScan" description="Chat with your AI coach for daily guidance." />
      <AppHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
        <NotMedicalAdviceBanner />
        <Card className="border bg-card/60">
          <CardHeader className="flex flex-col gap-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-primary" /> Coach Chat
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Coaching suggestions are estimates and not medical advice.
            </p>
            {planSummary && (
              <div className="text-xs text-muted-foreground">
                <p>
                  Current focus: <span className="font-semibold capitalize">{planSummary.goal ?? "—"}</span>
                </p>
                <p>
                  Weekly schedule: {planSummary.days ? `${planSummary.days} days` : "—"}
                  {planSummary.equipment?.length
                    ? ` • Equipment: ${planSummary.equipment.join(", ")}`
                    : ""}
                </p>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="sleep">Sleep (hours last night)</Label>
                  <Input
                    id="sleep"
                    type="number"
                    min={0}
                    max={12}
                    step={0.5}
                    placeholder="e.g. 6.5"
                    value={sleep}
                    onChange={(event) => setSleep(event.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="stress">Stress level</Label>
                  <Select value={stress} onValueChange={setStress}>
                    <SelectTrigger id="stress">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">No update</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="message">Ask the coach</Label>
                <Textarea
                  id="message"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="How should I adjust today's workout?"
                  rows={3}
                  className="resize-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button type="submit" disabled={loading}>
                  <Send className="mr-2 h-4 w-4" /> {loading ? "Sending" : "Send"}
                </Button>
                {loading && <span className="text-xs text-muted-foreground">Thinking…</span>}
              </div>
            </form>

            {quickSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-2 text-xs">
                {quickSuggestions.map((suggestion) => (
                  <Button
                    key={suggestion}
                    variant="outline"
                    size="sm"
                    onClick={() => handleSuggestion(suggestion)}
                  >
                    {suggestion}
                  </Button>
                ))}
              </div>
            )}

            <div className="space-y-3">
              {messages.length === 0 && !loading && (
                <p className="text-sm text-muted-foreground">
                  Ask about training adjustments, warm-ups, or recovery. The coach tailors responses to your plan when
                  available.
                </p>
              )}
              {messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 text-sm shadow-sm ${
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    {message.text}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>
      <BottomNav />
    </div>
  );
}
