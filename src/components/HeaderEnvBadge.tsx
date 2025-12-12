import { Badge } from "@/components/ui/badge";
import { describeStripeEnvironment } from "@/lib/env";
import { cn } from "@/lib/utils";

export type HeaderEnvBadgeProps = {
  className?: string;
};

export function HeaderEnvBadge({ className }: HeaderEnvBadgeProps) {
  const env = describeStripeEnvironment();

  if (env === "live") {
    return null;
  }

  const label =
    env === "test" ? "TEST" : env === "custom" ? "STRIPE" : "NO KEY";
  const tone =
    env === "test"
      ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
      : env === "custom"
        ? "bg-sky-500/10 text-sky-600 dark:text-sky-300"
        : "bg-destructive/10 text-destructive";

  return (
    <Badge
      className={cn("uppercase tracking-wide", tone, className)}
      aria-label={`Stripe mode ${label}`}
    >
      {label}
    </Badge>
  );
}

export default HeaderEnvBadge;
