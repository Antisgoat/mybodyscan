import { useState } from "react";
import { kgToLb, lbToKg, cmToIn, inToFtIn } from "@/lib/units";
import { app } from "@/lib/firebase";
import { getFunctions, httpsCallable } from "firebase/functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useNavigate, Link } from "react-router-dom";
import { ChevronRight, Target, Clock, User } from "lucide-react";
import HeightInputUS from "@/components/HeightInputUS";

type Step = 1 | 2 | 3 | 4;

const CoachOnboarding = () => {
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<any>({
    goal: "lose_fat",
    style: "ease_in",
    timeframe_weeks: 12,
    sex: "male",
    age: 30,
    height_cm: 170,
    weight_kg: 70,
    activity_level: "light",
    medical_flags: {},
    ack: { disclaimer: false },
  });
  const [plan, setPlan] = useState<any>(null);
  const navigate = useNavigate();

  const update = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  async function finish() {
    const functions = getFunctions(app);
    const save = httpsCallable(functions, "saveOnboarding");
    const compute = httpsCallable(functions, "computePlan");
    const payload: any = { ...form };
    const heightCm = form.height_cm ?? 0;
    const weightKg = form.weight_kg ?? 0;
    const { ft, inches: inch } = inToFtIn(cmToIn(heightCm));
    payload.units = "us";
    payload.height_ft = ft;
    payload.height_in = inch;
    payload.weight_lb = kgToLb(weightKg);
    await save(payload);
    const { data } = await compute({});
    setPlan(data);
    setStep(4);
  }

  const progress = (step / 4) * 100;

  return (
    <div className="max-w-md mx-auto p-4 space-y-6">
      {/* Progress Header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Step {step} of 4</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              What's your main goal?
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Let's start with what you want to achieve. We'll create a personalized plan just for you.
            </p>
            
            <div className="space-y-3">
              {[
                { value: "lose_fat", label: "Lose body fat", desc: "Reduce fat while maintaining muscle" },
                { value: "gain_muscle", label: "Build muscle", desc: "Increase lean mass and strength" },
                { value: "improve_heart", label: "Improve cardiovascular health", desc: "Focus on heart health and endurance" }
              ].map((goal) => (
                <label key={goal.value} className={`block p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors ${form.goal === goal.value ? 'border-primary bg-primary/5' : ''}`}>
                  <input
                    type="radio"
                    name="goal"
                    value={goal.value}
                    checked={form.goal === goal.value}
                    onChange={(e) => update("goal", e.target.value)}
                    className="sr-only"
                  />
                  <div className="font-medium">{goal.label}</div>
                  <div className="text-sm text-muted-foreground">{goal.desc}</div>
                </label>
              ))}
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="text-sm font-medium">How intense do you want to go?</span>
                <select
                  className="mt-1 w-full p-2 border rounded-md"
                  value={form.style}
                  onChange={(e) => update("style", e.target.value)}
                >
                  <option value="ease_in">Take it easy - gradual changes</option>
                  <option value="all_in">Go all in - aggressive approach</option>
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-medium">Timeframe (weeks)</span>
                <Input
                  type="number"
                  min="4"
                  max="52"
                  value={form.timeframe_weeks}
                  onChange={(e) => update("timeframe_weeks", Number(e.target.value))}
                  className="mt-1"
                />
              </label>
            </div>

            <Button onClick={() => setStep(2)} className="w-full">
              Continue <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Tell us about yourself
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              These details help us calculate your personalized calorie and macro targets.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-medium">Sex</span>
                <select
                  className="mt-1 w-full p-2 border rounded-md"
                  value={form.sex}
                  onChange={(e) => update("sex", e.target.value)}
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-medium">Age</span>
                <Input
                  type="number"
                  min="18"
                  max="100"
                  value={form.age}
                  onChange={(e) => update("age", Number(e.target.value))}
                  className="mt-1"
                />
              </label>
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="text-sm font-medium">Height</span>
                <div className="mt-1">
                  <HeightInputUS
                    valueCm={form.height_cm}
                    onChangeCm={(cm) => update("height_cm", cm)}
                  />
                </div>
              </label>

              <label className="block">
                <span className="text-sm font-medium">Weight (lb)</span>
                <Input
                  type="number"
                  min="70"
                  max="600"
                  value={form.weight_kg ? Math.round(kgToLb(form.weight_kg)) : ""}
                  onChange={(e) => {
                    if (e.target.value === "") {
                      update("weight_kg", undefined);
                      return;
                    }
                    const value = Number(e.target.value);
                    if (Number.isNaN(value)) return;
                    update("weight_kg", lbToKg(value));
                  }}
                  className="mt-1"
                />
              </label>
            </div>

            <label className="block">
              <span className="text-sm font-medium">How active are you?</span>
              <select
                className="mt-1 w-full p-2 border rounded-md"
                value={form.activity_level}
                onChange={(e) => update("activity_level", e.target.value)}
              >
                <option value="sedentary">Sedentary (desk job, no exercise)</option>
                <option value="light">Light (1-3 days/week light exercise)</option>
                <option value="moderate">Moderate (3-5 days/week exercise)</option>
                <option value="very">Very active (6-7 days/week exercise)</option>
                <option value="extra">Extremely active (2x/day or physical job)</option>
              </select>
            </label>

            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setStep(1)} className="flex-1">
                Back
              </Button>
              <Button onClick={() => setStep(3)} className="flex-1">
                Continue <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Health & Safety</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">
                Your safety is our priority. Please let us know about any conditions that might affect your nutrition plan.
              </p>
            </div>

            <div className="space-y-3">
              {[
                { key: "pregnant", label: "Currently pregnant or breastfeeding" },
                { key: "under18", label: "Under 18 years old" },
                { key: "eating_disorder_history", label: "History of eating disorders" },
                { key: "heart_condition", label: "Heart condition or cardiac issues" },
              ].map((condition) => (
                <label key={condition.key} className="flex items-start gap-3 p-2 hover:bg-muted/30 rounded-md cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.medical_flags[condition.key] || false}
                    onChange={(e) =>
                      update("medical_flags", {
                        ...form.medical_flags,
                        [condition.key]: e.target.checked,
                      })
                    }
                    className="mt-1"
                  />
                  <span className="text-sm">{condition.label}</span>
                </label>
              ))}
            </div>

            <div className="border-t pt-4">
              <label className="flex items-start gap-3 p-2 hover:bg-muted/30 rounded-md cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.ack.disclaimer}
                  onChange={(e) =>
                    update("ack", { ...form.ack, disclaimer: e.target.checked })
                  }
                  className="mt-1"
                />
                <span className="text-sm">
                  I understand this is not medical advice and I accept the{" "}
                  <Link to="/legal/disclaimer" className="text-primary hover:underline">
                    full disclaimer
                  </Link>
                </span>
              </label>
            </div>

            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setStep(2)} className="flex-1">
                Back
              </Button>
              <Button 
                onClick={finish} 
                disabled={!form.ack.disclaimer}
                className="flex-1"
              >
                Create My Plan <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 4 && plan && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-accent" />
              Your Personalized Plan
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-primary">{plan.target_kcal}</div>
              <div className="text-muted-foreground">calories per day</div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 bg-primary/5 rounded-lg">
                <Badge variant="secondary" className="mb-2">Protein</Badge>
                <div className="font-semibold">{plan.protein_g}g</div>
              </div>
              <div className="text-center p-3 bg-accent/5 rounded-lg">
                <Badge variant="secondary" className="mb-2">Fat</Badge>
                <div className="font-semibold">{plan.fat_g}g</div>
              </div>
              <div className="text-center p-3 bg-warning/5 rounded-lg">
                <Badge variant="secondary" className="mb-2">Carbs</Badge>
                <div className="font-semibold">{plan.carbs_g}g</div>
              </div>
            </div>

            <div className="text-center text-sm text-muted-foreground">
              <div>Weight: {Math.round(plan.weight_lb)} lb</div>
              <div>
                Height: {plan.height_ft}ft {plan.height_in}in
              </div>
            </div>

            {plan.needs_clearance && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <div className="font-medium text-destructive text-sm">Important</div>
                <div className="text-destructive text-sm">{plan.message}</div>
              </div>
            )}

            <div className="space-y-3">
              <Button onClick={() => navigate("/coach/tracker")} className="w-full" size="lg">
                Start Tracking
              </Button>
              <Button variant="secondary" onClick={() => setStep(1)} className="w-full">
                Edit My Answers
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CoachOnboarding;

