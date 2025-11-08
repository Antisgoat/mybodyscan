import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { apiFetch } from "@/lib/apiFetch";
import { toast } from "@/hooks/use-toast";

export async function nutritionSearchClient(query: string) {
  try {
    const callable = httpsCallable(functions, "nutritionSearch");
    const response: any = await callable({ q: query });
    return response?.data?.items || [];
  } catch (error: any) {
    if (error?.code === "app_check_required") {
      toast({
        title: "App Check required",
        description: "Falling back to nutrition API.",
      });
    }
    try {
      const resp = await apiFetch(`/api/nutrition/search?q=${encodeURIComponent(query)}`);
      if (!resp.ok) {
        toast({ title: "Nutrition search failed", description: `HTTP ${resp.status}`, variant: "destructive" });
        return [];
      }
      const data = await resp.json().catch(() => ({}));
      return data?.items || [];
    } catch (httpError: any) {
      toast({
        title: "Nutrition search unavailable",
        description: httpError?.message || "Please try again.",
        variant: "destructive",
      });
      return [];
    }
  }
}
