import { toast } from "@/components/ui/use-toast";

function showToast(message: string) {
  toast({ title: message });
}

export const demoToast = () => showToast("Demo mode: sign in to save");
