import { toast } from "@app/components/ui/use-toast.ts";

function showToast(message: string) {
  toast({ title: message });
}

export const demoToast = () => showToast("Demo mode: sign in to save");
