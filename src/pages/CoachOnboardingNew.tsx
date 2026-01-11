import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { db } from "@/lib/firebase";
import { setDoc } from "@/lib/dbWrite";
import { doc } from "firebase/firestore";
import { useComputePlan } from "@/hooks/useComputePlan";
import { useToast } from "@/hooks/use-toast";
import { Seo } from "@/components/Seo";
import HeightInputUS from "@/components/HeightInputUS";
import { kgToLb, lbToKg } from "@/lib/units";
import { useUnits } from "@/hooks/useUnits";
import { DemoWriteButton } from "@/components/DemoWriteGuard";
import { useAuthUser } from "@/auth/client";

interface OnboardingData {
  sex?: "male" | "female";
  age?: number;
  height_cm?: number;
  weight_kg?: number;
  activity_level?: "sedentary" | "light" | "moderate" | "very" | "extra";
  goal?: "lose_fat" | "gain_muscle" | "improve_heart";
  timeframe_weeks?: number;
  style?: "ease_in" | "all_in";
  medical_flags?: Record<string, boolean>;
}

const steps = [
  "basics",
  "measurements",
  "activity",
  "goals",
  "medical",
  "plan",
] as const;

type Step = (typeof steps)[number];

export default function CoachOnboardingNew() {
  const [currentStep, setCurrentStep] = useState<Step>("basics");
  const [data, setData] = useState<OnboardingData>({});
  const [computing, setComputing] = useState(false);
  const [plan, setPlan] = useState<any>(null);

  const navigate = useNavigate();
  const { user } = useAuthUser();
  const { computePlan } = useComputePlan();
  const { toast } = useToast();
  const { units } = useUnits();

  const updateData = (updates: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...updates }));
  };

  const nextStep = () => {
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex < steps.length - 1) {
      setCurrentStep(steps[currentIndex + 1]);
    }
  };

  const prevStep = () => {
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(steps[currentIndex - 1]);
    }
  };

  const handleComputePlan = async () => {
    if (!user) return;

    setComputing(true);
    try {
      // Save profile
      const profileRef = doc(
        db,
        "users",
        user.uid,
        "coach",
        "profile"
      );
      await setDoc(profileRef, data);

      // Compute plan
      const planResult = await computePlan(data);
      setPlan(planResult);

      setCurrentStep("plan");

      toast({
        title: "Plan computed",
        description: "Your personalized plan is ready!",
      });
    } catch (error) {
      console.error("Error computing plan:", error);
      toast({
        title: "Error",
        description: "Failed to compute plan. Please try again.",
        variant: "destructive",
      });
    } finally {
      setComputing(false);
    }
  };

  const finish = () => {
    navigate("/coach/tracker");
  };

  const renderBasics = () => (
    <Card>
      <CardHeader>
        <CardTitle>Basic Information</CardTitle>
        <CardDescription>Tell us a bit about yourself</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Sex</Label>
          <RadioGroup
            value={data.sex}
            onValueChange={(value: "male" | "female") =>
              updateData({ sex: value })
            }
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="male" id="male" />
              <Label htmlFor="male">Male</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="female" id="female" />
              <Label htmlFor="female">Female</Label>
            </div>
          </RadioGroup>
        </div>

        <div>
          <Label htmlFor="age">Age</Label>
          <Input
            id="age"
            type="number"
            placeholder="Enter your age"
            value={data.age || ""}
            onChange={(e) =>
              updateData({ age: parseInt(e.target.value) || undefined })
            }
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={nextStep} disabled={!data.sex || !data.age}>
            Next
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderMeasurements = () => (
    <Card>
      <CardHeader>
        <CardTitle>Measurements</CardTitle>
        <CardDescription>
          We need your height and weight for accurate calculations (Units:{" "}
          {units === "us" ? "US – lb, ft/in" : "Metric"})
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground">
              Height
            </Label>
            {units === "metric" ? (
              <Input
                id="height-cm"
                type="number"
                inputMode="decimal"
                placeholder="170"
                value={data.height_cm ?? ""}
                onChange={(e) => {
                  if (e.target.value === "") {
                    updateData({ height_cm: undefined });
                    return;
                  }
                  const val = Number(e.target.value);
                  if (!Number.isNaN(val)) updateData({ height_cm: val });
                }}
              />
            ) : (
              <HeightInputUS
                valueCm={data.height_cm}
                onChangeCm={(cm) => updateData({ height_cm: cm ?? undefined })}
              />
            )}
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="weight"
              className="text-sm font-medium text-foreground"
            >
              Weight ({units === "metric" ? "kg" : "lb"})
            </Label>
            <Input
              id="weight"
              type="number"
              inputMode="decimal"
              placeholder={units === "metric" ? "70" : "154"}
              value={
                units === "metric"
                  ? (data.weight_kg ?? "")
                  : data.weight_kg != null
                    ? Math.round(kgToLb(data.weight_kg))
                    : ""
              }
              onChange={(e) => {
                if (e.target.value === "") {
                  updateData({ weight_kg: undefined });
                  return;
                }
                const value = Number(e.target.value);
                if (Number.isNaN(value)) return;
                const normalized =
                  units === "metric" ? value : (lbToKg(value) ?? undefined);
                updateData({ weight_kg: normalized });
              }}
              className="h-11"
            />
          </div>
        </div>

        <div className="flex justify-between">
          <Button variant="outline" onClick={prevStep}>
            Back
          </Button>
          <Button
            onClick={nextStep}
            disabled={!data.height_cm || !data.weight_kg}
          >
            Next
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderActivity = () => (
    <Card>
      <CardHeader>
        <CardTitle>Activity Level</CardTitle>
        <CardDescription>How active are you typically?</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <RadioGroup
          value={data.activity_level}
          onValueChange={(value: typeof data.activity_level) =>
            updateData({ activity_level: value })
          }
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="sedentary" id="sedentary" />
            <Label htmlFor="sedentary">Sedentary - Little to no exercise</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="light" id="light" />
            <Label htmlFor="light">Light - Light exercise 1-3 days/week</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="moderate" id="moderate" />
            <Label htmlFor="moderate">
              Moderate - Moderate exercise 3-5 days/week
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="very" id="very" />
            <Label htmlFor="very">
              Very Active - Hard exercise 6-7 days/week
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="extra" id="extra" />
            <Label htmlFor="extra">
              Extra Active - Very hard exercise, physical job
            </Label>
          </div>
        </RadioGroup>

        <div className="flex justify-between">
          <Button variant="outline" onClick={prevStep}>
            Back
          </Button>
          <Button onClick={nextStep} disabled={!data.activity_level}>
            Next
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderGoals = () => (
    <Card>
      <CardHeader>
        <CardTitle>Goals & Approach</CardTitle>
        <CardDescription>What are you looking to achieve?</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Primary Goal</Label>
          <RadioGroup
            value={data.goal}
            onValueChange={(value: typeof data.goal) =>
              updateData({ goal: value })
            }
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="lose_fat" id="lose_fat" />
              <Label htmlFor="lose_fat">Lose body fat</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="gain_muscle" id="gain_muscle" />
              <Label htmlFor="gain_muscle">Build muscle</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="improve_heart" id="improve_heart" />
              <Label htmlFor="improve_heart">
                Improve cardiovascular health
              </Label>
            </div>
          </RadioGroup>
        </div>

        <div>
          <Label htmlFor="timeframe">Timeframe (weeks)</Label>
          <Input
            id="timeframe"
            type="number"
            placeholder="12"
            value={data.timeframe_weeks || ""}
            onChange={(e) =>
              updateData({
                timeframe_weeks: parseInt(e.target.value) || undefined,
              })
            }
          />
        </div>

        <div>
          <Label>Approach</Label>
          <RadioGroup
            value={data.style}
            onValueChange={(value: typeof data.style) =>
              updateData({ style: value })
            }
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="ease_in" id="ease_in" />
              <Label htmlFor="ease_in">Ease in - Gradual changes</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="all_in" id="all_in" />
              <Label htmlFor="all_in">All in - Aggressive approach</Label>
            </div>
          </RadioGroup>
        </div>

        <div className="flex justify-between">
          <Button variant="outline" onClick={prevStep}>
            Back
          </Button>
          <Button
            onClick={nextStep}
            disabled={!data.goal || !data.timeframe_weeks || !data.style}
          >
            Next
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderMedical = () => (
    <Card>
      <CardHeader>
        <CardTitle>Health & Safety</CardTitle>
        <CardDescription>
          Please check any that apply (consult a healthcare professional for
          medical advice)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {[
            "diabetes",
            "heart_condition",
            "high_blood_pressure",
            "joint_issues",
            "eating_disorder_history",
            "pregnancy",
            "medications",
          ].map((flag) => (
            <div key={flag} className="flex items-center space-x-2">
              <Checkbox
                id={flag}
                checked={data.medical_flags?.[flag] || false}
                onCheckedChange={(checked) =>
                  updateData({
                    medical_flags: {
                      ...data.medical_flags,
                      [flag]: !!checked,
                    },
                  })
                }
              />
              <Label htmlFor={flag} className="capitalize">
                {flag.replace(/_/g, " ")}
              </Label>
            </div>
          ))}
        </div>

        <div className="p-4 bg-muted rounded-lg text-sm">
          <strong>Disclaimer:</strong> MyBodyScan is not a medical device. This
          information is for educational purposes only and should not replace
          professional medical advice. Consult your healthcare provider before
          making significant dietary or exercise changes.
        </div>

        <div className="flex justify-between">
          <Button variant="outline" onClick={prevStep}>
            Back
          </Button>
          <DemoWriteButton onClick={handleComputePlan} disabled={computing}>
            {computing ? "Computing Plan..." : "Compute Plan"}
          </DemoWriteButton>
        </div>
      </CardContent>
    </Card>
  );

  const renderPlan = () => (
    <Card>
      <CardHeader>
        <CardTitle>Your Personal Plan</CardTitle>
        <CardDescription>
          Here's your customized nutrition and fitness plan
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {plan && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-primary/10 rounded-lg">
                <div className="text-2xl font-bold">{plan.target_kcal}</div>
                <div className="text-sm text-muted-foreground">
                  Daily Calories
                </div>
              </div>
              <div className="p-4 bg-accent/10 rounded-lg">
                <div className="text-2xl font-bold">{plan.tdee}</div>
                <div className="text-sm text-muted-foreground">TDEE</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="p-3 bg-muted rounded-lg text-center">
                <div className="font-semibold">{plan.protein_g}g</div>
                <div className="text-xs text-muted-foreground">Protein</div>
              </div>
              <div className="p-3 bg-muted rounded-lg text-center">
                <div className="font-semibold">{plan.carbs_g}g</div>
                <div className="text-xs text-muted-foreground">Carbs</div>
              </div>
              <div className="p-3 bg-muted rounded-lg text-center">
                <div className="font-semibold">{plan.fat_g}g</div>
                <div className="text-xs text-muted-foreground">Fat</div>
              </div>
            </div>

            <div className="p-4 bg-warning/10 rounded-lg text-sm">
              <strong>Safety Note:</strong> Minimum recommended daily intake is
              1200 calories. Always stay hydrated, get adequate rest, and listen
              to your body.
              <a
                href="/legal/disclaimer"
                className="text-primary hover:underline ml-1"
              >
                View full health disclaimers
              </a>
            </div>
          </div>
        )}

        <div className="flex justify-between">
          <Button variant="outline" onClick={prevStep}>
            Back
          </Button>
          <DemoWriteButton onClick={finish}>Start Tracking</DemoWriteButton>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Seo
        title="Coach Onboarding - MyBodyScan"
        description="Set up your personalized nutrition and fitness plan"
      />

      <div>
        <h1 className="text-3xl font-bold mb-2">Coach Setup</h1>
        <p className="text-muted-foreground">
          Let's create your personalized nutrition and fitness plan
        </p>
      </div>

      {/* Progress indicator */}
      <div className="flex items-center space-x-2">
        {steps.map((step, index) => (
          <div key={step} className="flex items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                steps.indexOf(currentStep) >= index
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {index + 1}
            </div>
            {index < steps.length - 1 && (
              <div
                className={`w-12 h-0.5 ${
                  steps.indexOf(currentStep) > index ? "bg-primary" : "bg-muted"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {currentStep === "basics" && renderBasics()}
      {currentStep === "measurements" && renderMeasurements()}
      {currentStep === "activity" && renderActivity()}
      {currentStep === "goals" && renderGoals()}
      {currentStep === "medical" && renderMedical()}
      {currentStep === "plan" && renderPlan()}
    </div>
  );
}
