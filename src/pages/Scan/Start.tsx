import { FormEvent, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Seo } from "@/components/Seo";
import { getLastWeight, setLastWeight } from "@/lib/userState";

function formatWeight(weight: number): string {
  return Number.isInteger(weight) ? weight.toFixed(0) : weight.toFixed(1);
}

export default function ScanStart() {
  const navigate = useNavigate();
  const storedWeightRef = useRef<number | null>(getLastWeight());
  const initialWeight = storedWeightRef.current;
  const [storedWeight, setStoredWeight] = useState<number | null>(initialWeight);
  const [mode, setMode] = useState<"confirm" | "input">(initialWeight == null ? "input" : "confirm");
  const [weightInput, setWeightInput] = useState<string>(initialWeight != null ? initialWeight.toString() : "");
  const [error, setError] = useState<string | null>(null);

  const goToCapture = () => navigate("/scan/capture");

  const handleSave = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    setError(null);

    const parsed = Number(weightInput.trim());
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Enter a valid weight in pounds.");
      return;
    }

    setLastWeight(parsed);
    const normalized = Math.round(parsed * 10) / 10;
    setStoredWeight(normalized);
    setMode("confirm");
    goToCapture();
  };

  const showInput = mode === "input";

  return (
    <div className="space-y-6">
      <Seo title="Start Scan – MyBodyScan" description="Begin your next body scan." />
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">Start a Scan</h1>
        <p className="text-muted-foreground">Get set to capture your next progress photos.</p>
      </div>

      {showInput ? (
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-weight">Current weight (lb)</Label>
            <Input
              id="current-weight"
              type="number"
              inputMode="decimal"
              step="0.1"
              min="1"
              required
              value={weightInput}
              onChange={(event) => setWeightInput(event.target.value)}
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
          <Button type="submit" size="lg">
            Save and continue
          </Button>
        </form>
      ) : (
        <div className="space-y-4">
          <p className="text-lg font-medium">Is your weight still {formatWeight(storedWeight!)} lb?</p>
          <div className="flex flex-wrap gap-3">
            <Button size="lg" onClick={goToCapture}>
              Yes
            </Button>
            <Button
              type="button"
              size="lg"
              variant="outline"
              onClick={() => {
                setMode("input");
                setWeightInput(storedWeight != null ? storedWeight.toString() : "");
                setError(null);
              }}
            >
              Update
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
