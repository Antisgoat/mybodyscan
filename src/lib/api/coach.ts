import { apiFetchWithFallback } from "@/lib/http";
import { preferRewriteUrl } from "@/lib/api/urls";

export async function askCoach(message: string) {
  const url = preferRewriteUrl("coachChat");
  return apiFetchWithFallback("coachChat", url, { method: "POST", body: { message } });
}
