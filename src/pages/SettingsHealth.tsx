import { useState } from "react";
import { format, subDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { useHealthDaily } from "@/hooks/useHealthDaily";
import type { DailySummary } from "@/integrations/health/HealthAdapter";

const SettingsHealth = () => {
  const { platform, connect, syncDay } = useHealthDaily();
  const [last, setLast] = useState<(DailySummary & { date: string }) | null>(null);

  async function sync(offset: number) {
    const date = format(subDays(new Date(), offset), "yyyy-MM-dd");
    const s = await syncDay(date);
    setLast({ date, ...s });
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Health Integrations</h1>
      {platform === "ios" && (
        <Button onClick={connect}>Connect Apple Health</Button>
      )}
      {platform === "android" && (
        <Button onClick={connect}>Connect Google Fit</Button>
      )}
      {platform === "web" && (
        <div className="text-sm text-muted-foreground">
          Connect on mobile to import activity.
        </div>
      )}
      <div className="flex gap-2">
        <Button onClick={() => sync(1)}>Sync yesterday</Button>
        <Button onClick={() => sync(0)}>Sync today</Button>
      </div>
      {last && (
        <div className="text-sm">
          Last sync {last.date}: {last.activeEnergyKcal ?? ""} kcal burn
        </div>
      )}
    </div>
  );
};

export default SettingsHealth;

