import { apiFetchWithFallback } from "@/lib/http";
import { resolveFunctionUrl } from "@/lib/api/functionsBase";

export async function askCoach(message: string) {
  const url = resolveFunctionUrl("VITE_COACH_URL", "coachChat");
  return apiFetchWithFallback("coachChat", url, { method: "POST", body: { message } });
}
