import type { FormEvent, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Seo } from "@/components/Seo";
import type { ManualInputKey } from "./scanRefineStore";
import { commitManualInput, setManualInput, useScanRefineStore } from "./scanRefineStore";
import { useUnits } from "@/hooks/useUnits";

interface RefineMeasurementsFormProps {
  onSubmit?: () => void;
  footer?: ReactNode;
}

const FIELD_CONFIG: Array<{ key: ManualInputKey; id: string; help?: string; label: string }> = [
  { key: "neck", label: "Neck", id: "refine-neck" },
  { key: "waist", label: "Waist", id: "refine-waist" },
  { key: "hip", label: "Hip", id: "refine-hip" },
];

export function RefineMeasurementsForm({ onSubmit, footer }: RefineMeasurementsFormProps) {
  const { manualInputs } = useScanRefineStore();
  const { units } = useUnits();
  const unitLabel = units === "metric" ? "cm" : "in";

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit?.();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {FIELD_CONFIG.map(({ key, label, id, help }) => (
        <div key={key} className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor={id}>{`${label} (${unitLabel})`}</Label>
            {help ? <span className="text-xs text-muted-foreground">{help}</span> : null}
          </div>
          <Input
            id={id}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.1"
            value={manualInputs[key]}
            onChange={(event) => setManualInput(key, event.target.value)}
            onBlur={(event) => commitManualInput(key, event.target.value)}
          />
        </div>
      ))}
      {footer ?? null}
    </form>
  );
}

export default function ScanRefine() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <Seo title="Refine Estimate – MyBodyScan" description="Fine-tune your scan results with manual inputs." />
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">Refine measurements</h1>
        <p className="text-muted-foreground">Adjust the estimate with quick manual measurements.</p>
      </div>
      <RefineMeasurementsForm
        onSubmit={() => navigate("/scan/result")}
        footer={
          <div className="flex flex-col-reverse items-stretch justify-end gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button type="submit">Save and return</Button>
          </div>
        }
      />
    </div>
  );
}
