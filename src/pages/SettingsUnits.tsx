import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { useUnits } from "@/hooks/useUnits";
import { useToast } from "@/hooks/use-toast";

const SettingsUnits = () => {
  const { units, loading, saving, error, setUnits } = useUnits();
  const { toast } = useToast();
  const options = useMemo(
    () => [
      {
        value: "us",
        label: "US (lb, ft/in)",
        description: "Default for most users",
      },
      {
        value: "metric",
        label: "Metric (kg, cm)",
        description: "Use SI units for measurements",
      },
    ],
    []
  );

  const handleChange = async (value: string) => {
    const next = value === "metric" ? "metric" : "us";
    try {
      await setUnits(next);
      toast({
        title: "Units updated",
        description: `Now showing ${next === "metric" ? "metric" : "US"} units.`,
      });
    } catch (err: any) {
      toast({
        title: "Unable to save units",
        description: err?.message || error || "Try again",
        variant: "destructive",
      });
    }
  };

  return (
    <main className="p-6 max-w-md mx-auto space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Units</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup
            value={units}
            onValueChange={handleChange}
            className="space-y-3"
            disabled={loading || saving}
          >
            {options.map((option) => (
              <Label
                key={option.value}
                className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-muted/50"
                htmlFor={`units-${option.value}`}
              >
                <RadioGroupItem
                  value={option.value}
                  id={`units-${option.value}`}
                  className="mt-1"
                />
                <div>
                  <div className="font-medium text-foreground">
                    {option.label}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {option.description}
                  </div>
                </div>
              </Label>
            ))}
          </RadioGroup>

          {error && <div className="text-xs text-destructive">{error}</div>}

          <Button
            variant="outline"
            size="sm"
            disabled
            className="w-full justify-center"
          >
            {loading || saving ? "Saving…" : "Changes save automatically"}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
};

export default SettingsUnits;
