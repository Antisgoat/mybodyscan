import { FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Seo } from "@/components/Seo";
import {
  getLastGoalWeight,
  getLastWeight,
  setLastGoalWeight,
  setLastWeight,
} from "@/lib/userState";
import { useDemoMode } from "@/components/DemoModeProvider";
import { demoToast } from "@/lib/demoToast";
import { useAuthUser } from "@/auth/mbs-auth";
import { useUnits } from "@/hooks/useUnits";
import { kgToLb, lbToKg } from "@/lib/units";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useSystemHealth } from "@/hooks/useSystemHealth";
import { computeFeatureStatuses } from "@/lib/envStatus";
import {
  clearCaptureFiles,
  resetCaptureFlow,
  setCaptureSession,
  setCaptureWeights,
} from "./scanCaptureStore";

function formatWeight(weight: number): string {
  return Number.isInteger(weight) ? weight.toFixed(0) : weight.toFixed(1);
}

export default function ScanStart() {
  const navigate = useNavigate();
  const storedWeightRef = useRef<number | null>(getLastWeight());
  const initialWeight = storedWeightRef.current;
  const storedGoalWeightRef = useRef<number | null>(getLastGoalWeight());
  const initialGoalWeight = storedGoalWeightRef.current;
  const [storedWeight, setStoredWeight] = useState<number | null>(
    initialWeight
  );
  const [storedGoalWeight, setStoredGoalWeight] = useState<number | null>(
    initialGoalWeight
  );
  const [mode, setMode] = useState<"confirm" | "input">(
    initialWeight == null ? "input" : "confirm"
  );
  const { units } = useUnits();
  const [weightInput, setWeightInput] = useState<string>(() => {
    if (initialWeight == null) return "";
    const value = units === "metric" ? lbToKg(initialWeight) : initialWeight;
    return value.toString();
  });
  const [goalWeightInput, setGoalWeightInput] = useState<string>(() => {
    if (initialGoalWeight == null) return "";
    const value =
      units === "metric" ? lbToKg(initialGoalWeight) : initialGoalWeight;
    return value.toString();
  });
  const [error, setError] = useState<string | null>(null);
  const demo = useDemoMode();
  const { user } = useAuthUser();
  const readOnlyDemo = demo && !user;
  const { health: systemHealth } = useSystemHealth();
  const { scanConfigured } = computeFeatureStatuses(systemHealth ?? undefined);
  const scanOffline =
    !scanConfigured ||
    systemHealth?.scanConfigured === false ||
    systemHealth?.openaiConfigured === false ||
    systemHealth?.openaiKeyPresent === false;
  const scanPrereqMessage = scanOffline
    ? systemHealth?.openaiConfigured === false ||
      systemHealth?.openaiKeyPresent === false
      ? "Scans require the OpenAI key (OPENAI_API_KEY) to be set on Cloud Functions."
      : "Scanning endpoints are offline until the Cloud Functions base URL is configured."
    : null;

  useEffect(() => {
    resetCaptureFlow();
  }, []);

  const goToCapture = () => {
    if (readOnlyDemo) {
      demoToast();
      return;
    }
    if (scanOffline) {
      setError("Scans are offline for maintenance. Please try again later.");
      return;
    }
    navigate("/scan/capture");
  };

  const confirmStoredWeightsAndContinue = () => {
    if (storedWeight == null || storedGoalWeight == null) {
      setError("Update your current and goal weight before continuing.");
      return;
    }
    const currentWeightKg = lbToKg(storedWeight);
    const goalWeightKg = lbToKg(storedGoalWeight);
    setCaptureWeights({ currentWeightKg, goalWeightKg });
    goToCapture();
  };

  const handleSave = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    setError(null);

    if (readOnlyDemo) {
      demoToast();
      return;
    }

    const parsedCurrent = Number(weightInput.trim());
    if (!Number.isFinite(parsedCurrent) || parsedCurrent <= 0) {
      setError(
        `Enter a valid current weight in ${units === "metric" ? "kilograms" : "pounds"}.`
      );
      return;
    }
    const parsedGoal = Number(goalWeightInput.trim());
    if (!Number.isFinite(parsedGoal) || parsedGoal <= 0) {
      setError(
        `Enter a valid goal weight in ${units === "metric" ? "kilograms" : "pounds"}.`
      );
      return;
    }

    const currentLb =
      units === "metric" ? kgToLb(parsedCurrent) : parsedCurrent;
    const goalLb = units === "metric" ? kgToLb(parsedGoal) : parsedGoal;
    setLastWeight(currentLb);
    setLastGoalWeight(goalLb);
    const normalizedCurrent = Math.round(currentLb * 10) / 10;
    const normalizedGoal = Math.round(goalLb * 10) / 10;
    setStoredWeight(normalizedCurrent);
    setStoredGoalWeight(normalizedGoal);
    setMode("confirm");
    const currentWeightKg =
      units === "metric" ? parsedCurrent : lbToKg(parsedCurrent);
    const goalWeightKg = units === "metric" ? parsedGoal : lbToKg(parsedGoal);
    clearCaptureFiles();
    setCaptureSession(null);
    setCaptureWeights({ currentWeightKg, goalWeightKg });
    if (scanOffline) {
      setError(
        "Scan services are unavailable right now. Please try again later."
      );
      return;
    }
    goToCapture();
  };

  const showInput = mode === "input";
  const formattedCurrentWeight =
    storedWeight != null
      ? formatWeight(units === "metric" ? lbToKg(storedWeight) : storedWeight)
      : null;
  const formattedGoalWeight =
    storedGoalWeight != null
      ? formatWeight(
          units === "metric" ? lbToKg(storedGoalWeight) : storedGoalWeight
        )
      : null;

  return (
    <div className="space-y-6">
      <Seo
        title="Start Scan – MyBodyScan"
        description="Begin your next body scan."
      />
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">Start a Scan</h1>
        <p className="text-muted-foreground">
          Get set to capture four clear progress photos.
        </p>
      </div>

      {scanPrereqMessage ? (
        <Alert variant="destructive">
          <AlertTitle>Scan unavailable</AlertTitle>
          <AlertDescription>{scanPrereqMessage}</AlertDescription>
        </Alert>
      ) : null}

      {showInput ? (
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="current-weight">
                Current weight ({units === "metric" ? "kg" : "lb"})
              </Label>
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
            </div>
            <div className="space-y-2">
              <Label htmlFor="goal-weight">
                Goal weight ({units === "metric" ? "kg" : "lb"})
              </Label>
              <Input
                id="goal-weight"
                type="number"
                inputMode="decimal"
                step="0.1"
                min="1"
                required
                value={goalWeightInput}
                onChange={(event) => setGoalWeightInput(event.target.value)}
              />
            </div>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {readOnlyDemo ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span onClick={() => demoToast()}>
                  <Button
                    type="button"
                    size="lg"
                    disabled
                    className="pointer-events-none"
                  >
                    Save and continue
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Sign up to save progress</TooltipContent>
            </Tooltip>
          ) : (
            <Button type="submit" size="lg" disabled={scanOffline}>
              Save and continue
            </Button>
          )}
        </form>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1">
            <p className="text-lg font-medium">
              Is your current weight still {formattedCurrentWeight}{" "}
              {units === "metric" ? "kg" : "lb"}?
            </p>
            {formattedGoalWeight ? (
              <p className="text-sm text-muted-foreground">
                Goal weight: {formattedGoalWeight}{" "}
                {units === "metric" ? "kg" : "lb"}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-3">
            {readOnlyDemo ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span onClick={() => demoToast()}>
                    <Button size="lg" disabled className="pointer-events-none">
                      Yes
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Sign up to save progress</TooltipContent>
              </Tooltip>
            ) : (
              <Button
                size="lg"
                onClick={confirmStoredWeightsAndContinue}
                disabled={scanOffline}
              >
                Yes
              </Button>
            )}
            <Button
              type="button"
              size="lg"
              variant="outline"
              onClick={() => {
                setMode("input");
                setWeightInput(
                  storedWeight != null
                    ? (units === "metric"
                        ? lbToKg(storedWeight)
                        : storedWeight
                      ).toString()
                    : ""
                );
                setGoalWeightInput(
                  storedGoalWeight != null
                    ? (units === "metric"
                        ? lbToKg(storedGoalWeight)
                        : storedGoalWeight
                      ).toString()
                    : ""
                );
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
