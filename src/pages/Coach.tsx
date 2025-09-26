import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dumbbell, CheckCircle2, Target } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Seo } from "@/components/Seo";
import { NotMedicalAdviceBanner } from "@/components/NotMedicalAdviceBanner";
import { useI18n } from "@/lib/i18n";
import { toast } from "@/hooks/use-toast";
import { isDemoGuest } from "@/lib/demoFlag";
import { kgToLb, lbToKg, cmToIn, inToFtIn, ftInToCm } from "@/lib/units";
import numberInputStyles from "./coach-number-inputs.module.css";

interface CoachPlan {
  id: string;
  weeks: Array<{
    number: number;
    days: Array<{
      name: string;
      exercises: Array<{
        id: string;
        name: string;
        sets: number;
        reps: string;
        rir: number;
        rest: string;
        tips?: string;
      }>;
    }>;
  }>;
}

interface OnboardingData {
  height?: number;
  weight?: number;
  age?: number;
  sex?: 'male' | 'female';
  goal?: 'cut' | 'recomp' | 'gain';
  difficulty?: 'easy' | 'moderate' | 'aggressive';
  daysPerWeek?: number;
  sessionLength?: number;
  equipment?: string[];
  injuries?: string;
  weakSpots?: string[];
  cardio?: string;
  dietType?: string;
}

export default function Coach() {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [plan, setPlan] = useState<CoachPlan | null>(null);
  const [onboardingData, setOnboardingData] = useState<OnboardingData>({});
  const [isLoading, setIsLoading] = useState(false);
  const [heightFtInput, setHeightFtInput] = useState<string>("");
  const [heightInInput, setHeightInInput] = useState<string>("");

  useEffect(() => {
    if (onboardingData.height == null) {
      setHeightFtInput("");
      setHeightInInput("");
      return;
    }
    const { ft, inches } = inToFtIn(cmToIn(onboardingData.height));
    setHeightFtInput(ft.toString());
    setHeightInInput(inches.toString());
  }, [onboardingData.height]);

  const updateHeightInputs = (nextFt: string, nextIn: string) => {
    setOnboardingData((prev) => {
      const parsedFt = nextFt === "" ? 0 : Number(nextFt);
      if (nextFt !== "" && Number.isNaN(parsedFt)) {
        return prev;
      }
      const parsedIn = nextIn === "" ? 0 : Number(nextIn);
      if (nextIn !== "" && Number.isNaN(parsedIn)) {
        return prev;
      }
      const clampedFt = Math.max(0, parsedFt);
      const clampedIn = Math.max(0, Math.min(11, parsedIn));
      if ((nextFt === "" && nextIn === "") || (clampedFt === 0 && clampedIn === 0)) {
        return { ...prev, height: undefined };
      }
      return { ...prev, height: ftInToCm(clampedFt, clampedIn) };
    });
  };

  useEffect(() => {
    // Try to load existing plan
    if (!isDemoGuest()) {
      // Call getCurrentPlan() from backend
      loadExistingPlan();
    }
  }, []);

  const loadExistingPlan = async () => {
    try {
      // Backend call: getCurrentPlan()
      const existingPlan = null; // Placeholder
      if (existingPlan) {
        setPlan(existingPlan);
      }
    } catch (err) {
      console.log('No existing plan found');
    }
  };

  const handleGeneratePlan = async () => {
    if (isDemoGuest()) {
      toast({
        title: "Sign up to use this feature",
        description: "Create a free account to get your personalized plan.",
      });
      return;
    }

    setIsLoading(true);
    try {
      // Backend call: generatePlan(onboardingData)
      const newPlan: CoachPlan = {
        id: 'demo-plan',
        weeks: [
          {
            number: 1,
            days: [
              {
                name: 'Monday',
                exercises: [
                  { id: '1', name: 'Push-ups', sets: 3, reps: '8-12', rir: 2, rest: '60s', tips: 'Keep core tight' },
                  { id: '2', name: 'Squats', sets: 3, reps: '12-15', rir: 2, rest: '90s' },
                  { id: '3', name: 'Plank', sets: 3, reps: '30-60s', rir: 1, rest: '60s' },
                ]
              }
            ]
          }
        ]
      };
      
      setPlan(newPlan);
      toast({ title: "Your personalized plan is ready!" });
    } catch (err: any) {
      toast({
        title: "Error generating plan",
        description: err?.message || "Please try again",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const onboardingSteps = [
    'Basic Info',
    'Goals', 
    'Preferences',
    'Equipment',
    'Final Details'
  ];

  if (plan) {
    return (
      <div className="min-h-screen bg-background pb-16 md:pb-0">
        <Seo title="Coach - MyBodyScan" description="Your personalized fitness plan" />
        <AppHeader />
        <main className="max-w-md mx-auto p-6 space-y-6">
          <NotMedicalAdviceBanner />
          
          <div className="text-center space-y-2">
            <Target className="w-8 h-8 text-primary mx-auto" />
            <h1 className="text-2xl font-semibold text-foreground">{t('coach.title')}</h1>
            <p className="text-sm text-muted-foreground">Week 1 of 4</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>This Week's Plan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {plan.weeks[0].days.map((day) => (
                <Card key={day.name}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{day.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-3">
                      {day.exercises.map((exercise) => (
                        <div key={exercise.id} className="flex items-start justify-between">
                          <div className="flex-1">
                            <h4 className="font-medium text-sm">{exercise.name}</h4>
                            <p className="text-xs text-muted-foreground">
                              {exercise.sets} sets × {exercise.reps} • RIR {exercise.rir} • Rest {exercise.rest}
                            </p>
                            {exercise.tips && (
                              <p className="text-xs text-accent mt-1">{exercise.tips}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <Button className="w-full" variant="outline">
                Weekly Check-in (Coming Soon)
              </Button>
            </CardContent>
          </Card>
        </main>
        <BottomNav />
      </div>
    );
  }

  // Onboarding flow
  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <Seo title="Coach Setup - MyBodyScan" description="Set up your personalized coaching plan" />
      <AppHeader />
      <main className="max-w-md mx-auto p-6 space-y-6">
        <NotMedicalAdviceBanner />
        
        <div className="text-center space-y-2">
          <Dumbbell className="w-8 h-8 text-primary mx-auto" />
          <h1 className="text-2xl font-semibold text-foreground">{t('coach.onboarding')}</h1>
          <p className="text-sm text-muted-foreground">Step {step + 1} of {onboardingSteps.length}</p>
        </div>

        <Progress value={(step / onboardingSteps.length) * 100} />

        {step === 0 && (
          <Card className={numberInputStyles.numberCard}>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Height</label>
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={heightFtInput}
                      onChange={(e) => {
                        const next = e.target.value;
                        if (next === "") {
                          setHeightFtInput("");
                          updateHeightInputs("", heightInInput);
                          return;
                        }
                        const numeric = Number(next);
                        if (Number.isNaN(numeric)) return;
                        const sanitized = Math.max(0, numeric);
                        const stringValue = sanitized.toString();
                        setHeightFtInput(stringValue);
                        updateHeightInputs(stringValue, heightInInput);
                      }}
                      className="h-11"
                      placeholder="ft"
                    />
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={heightInInput}
                      onChange={(e) => {
                        const next = e.target.value;
                        if (next === "") {
                          setHeightInInput("");
                          updateHeightInputs(heightFtInput, "");
                          return;
                        }
                        const numeric = Number(next);
                        if (Number.isNaN(numeric)) return;
                        const clamped = Math.max(0, Math.min(11, numeric));
                        const stringValue = clamped.toString();
                        setHeightInInput(stringValue);
                        updateHeightInputs(heightFtInput, stringValue);
                      }}
                      className="h-11"
                      placeholder="in"
                    />
                    <div className="hidden md:block" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Weight (lb)</label>
                  <div className="relative">
                    <Input
                      type="number"
                      inputMode="decimal"
                      value={onboardingData.weight != null ? Math.round(kgToLb(onboardingData.weight)) : ""}
                      onChange={(e) => {
                        if (e.target.value === "") {
                          setOnboardingData({ ...onboardingData, weight: undefined });
                          return;
                        }
                        const value = Number(e.target.value);
                        if (Number.isNaN(value)) return;
                        setOnboardingData({ ...onboardingData, weight: lbToKg(value) });
                      }}
                      className="h-11 pr-12"
                      placeholder="160"
                    />
                    <span className="absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">lb</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Age</label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={onboardingData.age ?? ""}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === "") {
                        setOnboardingData({ ...onboardingData, age: undefined });
                        return;
                      }
                      const numeric = Number(value);
                      if (Number.isNaN(numeric)) return;
                      setOnboardingData({ ...onboardingData, age: numeric });
                    }}
                    className="h-11"
                    placeholder="Age"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Sex</label>
                  <Select value={onboardingData.sex} onValueChange={(value: 'male' | 'female') => setOnboardingData({ ...onboardingData, sex: value })}>
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>{t('coach.goal')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {[
                  { value: 'cut', label: t('coach.goalCut') },
                  { value: 'recomp', label: t('coach.goalRecomp') },
                  { value: 'gain', label: t('coach.goalGain') }
                ].map((goal) => (
                  <Button
                    key={goal.value}
                    variant={onboardingData.goal === goal.value ? "default" : "outline"}
                    className="w-full justify-start"
                    onClick={() => setOnboardingData({...onboardingData, goal: goal.value as any})}
                  >
                    {goal.label}
                  </Button>
                ))}
              </div>
              
              <div className="space-y-2">
                <Label>{t('coach.difficulty')}</Label>
                <div className="space-y-2">
                  {[
                    { value: 'easy', label: t('coach.difficultyEasy') },
                    { value: 'moderate', label: t('coach.difficultyModerate') },
                    { value: 'aggressive', label: t('coach.difficultyAggressive') }
                  ].map((diff) => (
                    <Button
                      key={diff.value}
                      variant={onboardingData.difficulty === diff.value ? "default" : "outline"}
                      className="w-full justify-start"
                      onClick={() => setOnboardingData({...onboardingData, difficulty: diff.value as any})}
                    >
                      {diff.label}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex gap-3">
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep(step - 1)} className="flex-1">
              {t('common.back')}
            </Button>
          )}
          {step < onboardingSteps.length - 1 ? (
            <Button onClick={() => setStep(step + 1)} className="flex-1">
              {t('common.next')}
            </Button>
          ) : (
            <Button onClick={handleGeneratePlan} disabled={isLoading} className="flex-1">
              {isLoading ? t('common.loading') : t('common.finish')}
            </Button>
          )}
        </div>
      </main>
      <BottomNav />
    </div>
  );
}