import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { apiFetch } from "@/lib/apiFetch";
import { toast } from "@/hooks/use-toast";

export async function coachAsk(message: string) {
  try {
    const callable = httpsCallable(functions, "coachChat");
    const response: any = await callable({ message });
    return response?.data?.text || response?.data?.answer || "";
  } catch (error: any) {
    if (error?.code === "app_check_required") {
      toast({ title: "Coach requires App Check", description: "Retrying via API." });
    }
    try {
      const resp = await apiFetch("/api/coach/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!resp.ok) {
        toast({ title: "Coach unavailable", description: `HTTP ${resp.status}`, variant: "destructive" });
        return "";
      }
      const data = await resp.json().catch(() => ({}));
      return data?.answer || data?.text || "";
    } catch (httpError: any) {
      toast({
        title: "Coach request failed",
        description: httpError?.message || "Please try again.",
        variant: "destructive",
      });
      return "";
    }
  }
}
