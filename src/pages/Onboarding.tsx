import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Section } from "@/components/ui/section";
import { setDoc } from "@/lib/dbWrite";
import { doc, getDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { sanitizeReturnTo } from "@/lib/returnTo";
import { toast } from "@/hooks/use-toast";
import HeightInputUS from "@/components/HeightInputUS";
import { DemoWriteButton } from "@/components/DemoWriteGuard";
import { useAuthUser } from "@/auth/mbs-auth";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const STEP_TITLES = [
  "About You",
  "Your Goals",
  "Equipment & Injuries",
  "Activity Preferences",
  "Diet & Notifications",
] as const;

const POST_ONBOARDING_ROUTE = "/home";
const ONBOARDING_SCHEMA_VERSION = 1;
const EMPTY_SERIALIZED_PROGRESS = JSON.stringify({ step: 0, data: {} });

const SEX_OPTIONS = ["male", "female", "other"] as const;
const GOAL_OPTIONS = ["lose-fat", "gain-muscle", "maintain", "recomp"] as const;
const EQUIPMENT_OPTIONS = ["gym", "home-basic", "bodyweight", "none"] as const;
const EXPERIENCE_OPTIONS = ["beginner", "intermediate", "advanced"] as const;
const DIET_OPTIONS = [
  "balanced",
  "low-carb",
  "vegetarian",
  "vegan",
  "keto",
] as const;

type Sex = (typeof SEX_OPTIONS)[number];
type Goal = (typeof GOAL_OPTIONS)[number];
type Equipment = (typeof EQUIPMENT_OPTIONS)[number];
type Experience = (typeof EXPERIENCE_OPTIONS)[number];
type Diet = (typeof DIET_OPTIONS)[number];

type OnboardingForm = {
  age?: number;
  sex?: Sex;
  heightCm?: number;
  goal?: Goal;
  timeline?: number;
  equipment?: Equipment;
  injuries?: string;
  activities?: string;
  experience?: Experience;
  diet?: Diet;
  likes?: string;
  notifications?: boolean;
};

type OnboardingPayload = {
  age?: number;
  sex?: Sex;
  height?: number;
  goal?: Goal;
  timeline?: number;
  equipment?: Equipment;
  injuries?: string;
  activities?: string;
  experience?: Experience;
  diet?: Diet;
  likes?: string;
  notifications?: boolean;
};

type PersistMetaPayload = Partial<{
  step: number;
  completed: boolean;
  completedAt: unknown;
  draft: OnboardingPayload;
}>;

type DraftErrorState = {
  title: string;
  description: string;
  kind: "network" | "permission" | "unknown";
};

const DEFAULT_FORM: OnboardingForm = {};
const NETWORK_ERROR_CODES = new Set([
  "unavailable",
  "deadline-exceeded",
  "cancelled",
]);
const PERMISSION_ERROR_CODES = new Set([
  "permission-denied",
  "unauthenticated",
]);

const describeDraftError = (error: unknown): DraftErrorState => {
  const rawCode = (error as { code?: unknown } | undefined)?.code;
  const code = typeof rawCode === "string" ? rawCode : null;
  const rawMessage = (error as { message?: unknown } | undefined)?.message;
  const message =
    typeof rawMessage === "string" && rawMessage.trim().length
      ? rawMessage
      : null;
  if (code && PERMISSION_ERROR_CODES.has(code)) {
    return {
      title: "Permission required",
      description: "Sign out and back in.",
      kind: "permission",
    };
  }
  if (code && NETWORK_ERROR_CODES.has(code)) {
    return {
      title: "Offline?",
      description: "We’ll retry automatically.",
      kind: "network",
    };
  }
  return {
    title: "Save failed",
    description: message ?? "Can't save progress right now. Please try again.",
    kind: "unknown",
  };
};

const clampStep = (value: number) =>
  Math.min(Math.max(value, 0), STEP_TITLES.length - 1);

const isAllowedSex = (value: unknown): value is Sex =>
  SEX_OPTIONS.includes(value as Sex);
const isAllowedGoal = (value: unknown): value is Goal =>
  GOAL_OPTIONS.includes(value as Goal);
const isAllowedEquipment = (value: unknown): value is Equipment =>
  EQUIPMENT_OPTIONS.includes(value as Equipment);
const isAllowedExperience = (value: unknown): value is Experience =>
  EXPERIENCE_OPTIONS.includes(value as Experience);
const isAllowedDiet = (value: unknown): value is Diet =>
  DIET_OPTIONS.includes(value as Diet);

const coerceNumber = (
  value: unknown,
  min?: number,
  max?: number
): number | undefined => {
  if (typeof value !== "number" || Number.isNaN(value)) return undefined;
  if (min != null && value < min) return undefined;
  if (max != null && value > max) return undefined;
  return value;
};

const normalizeInteger = (
  value: number | undefined,
  min: number,
  max: number
): number | undefined => {
  if (typeof value !== "number" || Number.isNaN(value)) return undefined;
  const rounded = Math.round(value);
  if (rounded < min || rounded > max) return undefined;
  return rounded;
};

const sanitizeText = (value: unknown, maxLength = 280): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
};

const coerceFormFromStored = (raw: unknown): OnboardingForm => {
  if (!raw || typeof raw !== "object") return DEFAULT_FORM;
  const data = raw as Record<string, unknown>;
  return {
    age: coerceNumber(data.age, 13, 100),
    sex: isAllowedSex(data.sex) ? (data.sex as Sex) : undefined,
    heightCm: coerceNumber(data.height, 90, 260),
    goal: isAllowedGoal(data.goal) ? (data.goal as Goal) : undefined,
    timeline: coerceNumber(data.timeline, 1, 36),
    equipment: isAllowedEquipment(data.equipment)
      ? (data.equipment as Equipment)
      : undefined,
    injuries: sanitizeText(data.injuries),
    activities: sanitizeText(data.activities),
    experience: isAllowedExperience(data.experience)
      ? (data.experience as Experience)
      : undefined,
    diet: isAllowedDiet(data.diet) ? (data.diet as Diet) : undefined,
    likes: sanitizeText(data.likes),
    notifications:
      typeof data.notifications === "boolean"
        ? (data.notifications as boolean)
        : undefined,
  };
};

const mergeForms = (...forms: OnboardingForm[]): OnboardingForm =>
  forms.reduce<OnboardingForm>((acc, current) => {
    const next = { ...acc };
    (
      Object.entries(current) as [
        keyof OnboardingForm,
        OnboardingForm[keyof OnboardingForm],
      ][]
    ).forEach(([key, value]) => {
      if (value !== undefined) {
        next[key] = value;
      }
    });
    return next;
  }, {});

const normalizeForm = (form: OnboardingForm): OnboardingPayload => {
  const payload: OnboardingPayload = {};
  const age = normalizeInteger(form.age, 13, 100);
  if (age != null) payload.age = age;
  if (isAllowedSex(form.sex)) payload.sex = form.sex;
  const height = normalizeInteger(form.heightCm, 90, 260);
  if (height != null) payload.height = height;
  const goal = form.goal && isAllowedGoal(form.goal) ? form.goal : undefined;
  if (goal) payload.goal = goal;
  const timeline = normalizeInteger(form.timeline, 1, 36);
  if (timeline != null) payload.timeline = timeline;
  const equipment =
    form.equipment && isAllowedEquipment(form.equipment)
      ? form.equipment
      : undefined;
  if (equipment) payload.equipment = equipment;
  const experience =
    form.experience && isAllowedExperience(form.experience)
      ? form.experience
      : undefined;
  if (experience) payload.experience = experience;
  const diet = form.diet && isAllowedDiet(form.diet) ? form.diet : undefined;
  if (diet) payload.diet = diet;
  const injuries = sanitizeText(form.injuries);
  if (injuries) payload.injuries = injuries;
  const activities = sanitizeText(form.activities);
  if (activities) payload.activities = activities;
  const likes = sanitizeText(form.likes);
  if (likes) payload.likes = likes;
  if (typeof form.notifications === "boolean")
    payload.notifications = form.notifications;
  return payload;
};

const serializeProgress = (step: number, payload: OnboardingPayload) =>
  JSON.stringify({ step: clampStep(step), data: payload });

const validateStep = (step: number, form: OnboardingForm): string | null => {
  switch (step) {
    case 0:
      if (normalizeInteger(form.age, 13, 100) == null) return "Add your age.";
      if (!isAllowedSex(form.sex)) return "Select your sex.";
      if (normalizeInteger(form.heightCm, 90, 260) == null)
        return "Enter your height.";
      return null;
    case 1:
      if (!isAllowedGoal(form.goal)) return "Pick your primary goal.";
      return null;
    case 2:
      if (!isAllowedEquipment(form.equipment))
        return "Tell us about your equipment access.";
      return null;
    case 3:
      if (!isAllowedExperience(form.experience))
        return "Select your experience level.";
      return null;
    default:
      return null;
  }
};

const validateForCompletion = (form: OnboardingForm): string | null => {
  for (let i = 0; i < STEP_TITLES.length - 1; i += 1) {
    const stepError = validateStep(i, form);
    if (stepError) return stepError;
  }
  if (normalizeInteger(form.timeline, 1, 36) == null) {
    return "Share a target timeline (1-36 months).";
  }
  if (!isAllowedDiet(form.diet)) {
    return "Select a diet preference.";
  }
  return null;
};

export default function Onboarding() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuthUser();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<OnboardingForm>(DEFAULT_FORM);
  const [initializing, setInitializing] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<DraftErrorState | null>(null);
  const [progressSavedAt, setProgressSavedAt] = useState<Date | null>(null);
  const [stepMessage, setStepMessage] = useState<string | null>(null);
  const [savingFinal, setSavingFinal] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const lastPersistedPayloadRef = useRef<string>(EMPTY_SERIALIZED_PROGRESS);
  const completedRef = useRef(false);
  const metaInitializedRef = useRef(false);

  const returnToTarget = useMemo(
    () => sanitizeReturnTo(searchParams.get("returnTo")),
    [searchParams]
  );

  const destinationAfterOnboarding = returnToTarget ?? POST_ONBOARDING_ROUTE;

  const userDocRef = useMemo(
    () => (user?.uid && db ? doc(db, "users", user.uid) : null),
    [user?.uid, db]
  );

  const onboardingDocRef = useMemo(
    () =>
      user?.uid && db ? doc(db, "users", user.uid, "meta", "onboarding") : null,
    [user?.uid, db]
  );

  useEffect(() => {
    let cancelled = false;
    if (!user || !db || !userDocRef) {
      setInitializing(false);
      return () => {
        cancelled = true;
      };
    }

    const loadData = async () => {
      setInitializing(true);
      setLoadError(null);
      try {
        const metaRef = onboardingDocRef;
        const [userSnap, metaSnap] = await Promise.all([
          getDoc(userDocRef),
          metaRef ? getDoc(metaRef) : Promise.resolve(null),
        ]);
        if (cancelled) return;

        if (metaSnap?.exists()) {
          metaInitializedRef.current = true;
          const metaData = metaSnap.data() as Record<string, unknown>;
          if (metaData.completed === true) {
            completedRef.current = true;
            navigate(destinationAfterOnboarding, { replace: true });
            return;
          }

          const metaStep =
            typeof metaData.step === "number"
              ? clampStep(metaData.step)
              : clampStep(step);
          const rootForm = userSnap.exists()
            ? coerceFormFromStored(
                (userSnap.data() as Record<string, unknown>).onboarding
              )
            : DEFAULT_FORM;
          const metaDraft = coerceFormFromStored(metaData.draft);
          const merged = mergeForms(DEFAULT_FORM, rootForm, metaDraft);
          setForm(merged);
          setStep(metaStep);
          const sanitized = normalizeForm(merged);
          lastPersistedPayloadRef.current = serializeProgress(
            metaStep,
            sanitized
          );
          const updatedAt =
            metaData.updatedAt && typeof metaData.updatedAt === "object"
              ? (metaData.updatedAt as { toDate?: () => Date })
              : null;
          if (updatedAt?.toDate) {
            setProgressSavedAt(updatedAt.toDate());
          }
        } else {
          metaInitializedRef.current = false;
          const rootForm = userSnap.exists()
            ? coerceFormFromStored(
                (userSnap.data() as Record<string, unknown>).onboarding
              )
            : DEFAULT_FORM;
          setForm(rootForm);
          setStep(0);
          lastPersistedPayloadRef.current = EMPTY_SERIALIZED_PROGRESS;
        }
      } catch (err: any) {
        if (cancelled) return;
        setLoadError(err?.message || "Unable to load onboarding data.");
        setForm(DEFAULT_FORM);
      } finally {
        if (!cancelled) {
          setInitializing(false);
        }
      }
    };

    void loadData();

    return () => {
      cancelled = true;
    };
  }, [
    user?.uid,
    userDocRef,
    onboardingDocRef,
    navigate,
    reloadToken,
    db,
    destinationAfterOnboarding,
  ]);

  const persistMeta = useCallback(
    async (payload: PersistMetaPayload, opts: { silent?: boolean } = {}) => {
      if (!onboardingDocRef) throw new Error("Missing onboarding reference.");
      try {
        const body: Record<string, unknown> = {
          updatedAt: serverTimestamp(),
          version: ONBOARDING_SCHEMA_VERSION,
        };
        if (payload.step !== undefined) {
          body.step = clampStep(payload.step);
        }
        if (payload.draft !== undefined) {
          body.draft = payload.draft;
          body.draftVersion = ONBOARDING_SCHEMA_VERSION;
        }
        if (payload.completed !== undefined) {
          body.completed = payload.completed;
        }
        if (payload.completedAt !== undefined) {
          body.completedAt = payload.completedAt;
        }
        if (!metaInitializedRef.current) {
          body.startedAt = serverTimestamp();
        }
        await setDoc(onboardingDocRef, body, { merge: true });
        metaInitializedRef.current = true;
        setDraftError(null);
        setProgressSavedAt(new Date());
      } catch (error) {
        if (opts.silent) {
          setDraftError(describeDraftError(error));
        }
        throw error;
      }
    },
    [onboardingDocRef]
  );

  useEffect(() => {
    if (
      !onboardingDocRef ||
      initializing ||
      !user ||
      completedRef.current ||
      !db
    )
      return;
    const sanitized = normalizeForm(form);
    const serialized = serializeProgress(step, sanitized);
    if (serialized === lastPersistedPayloadRef.current) return;
    const timer = setTimeout(() => {
      void persistMeta({ step, draft: sanitized }, { silent: true })
        .then(() => {
          lastPersistedPayloadRef.current = serialized;
        })
        .catch(() => undefined);
    }, 600);
    return () => clearTimeout(timer);
  }, [form, step, onboardingDocRef, user, initializing, persistMeta, db]);

  const updateForm = useCallback((fields: Partial<OnboardingForm>) => {
    setForm((prev) => ({ ...prev, ...fields }));
    setStepMessage(null);
  }, []);

  const handleNext = () => {
    const error = validateStep(step, form);
    if (error) {
      setStepMessage(error);
      toast({
        title: "Almost there",
        description: error,
        variant: "destructive",
      });
      return;
    }
    setStepMessage(null);
    setStep((prev) => clampStep(prev + 1));
  };

  const handleBack = () => {
    setStepMessage(null);
    setStep((prev) => clampStep(prev - 1));
  };

  const handleFinish = async () => {
    const validation = validateForCompletion(form);
    if (validation) {
      setStepMessage(validation);
      toast({
        title: "Missing details",
        description: validation,
        variant: "destructive",
      });
      return;
    }
    if (!userDocRef || !onboardingDocRef) {
      toast({
        title: "Missing user",
        description: "Please sign in again to finish onboarding.",
        variant: "destructive",
      });
      return;
    }
    const sanitized = normalizeForm(form);
    if (Object.keys(sanitized).length === 0) {
      toast({
        title: "Add your details",
        description:
          "Share at least one preference before completing onboarding.",
        variant: "destructive",
      });
      return;
    }
    setSavingFinal(true);
    try {
      const timestamp = serverTimestamp();
      await Promise.all([
        setDoc(
          userDocRef,
          {
            onboarding: {
              ...sanitized,
              version: ONBOARDING_SCHEMA_VERSION,
              completedAt: timestamp,
            },
          },
          { merge: true }
        ),
        persistMeta(
          {
            step: STEP_TITLES.length - 1,
            completed: true,
            completedAt: timestamp,
            draft: sanitized,
          },
          { silent: false }
        ),
      ]);
      lastPersistedPayloadRef.current = serializeProgress(
        STEP_TITLES.length - 1,
        sanitized
      );
      completedRef.current = true;
      toast({
        title: "Profile complete!",
        description: "Welcome to MyBodyScan",
      });
      navigate(destinationAfterOnboarding, { replace: true });
    } catch (err: any) {
      const code = typeof err?.code === "string" ? err.code : null;
      let description = err?.message || "Please try again.";
      if (code === "permission-denied") {
        description =
          "Your account can’t save onboarding yet. This is usually a permissions issue – please refresh or contact support.";
      } else if (code === "unauthenticated") {
        description = "Please sign in again to finish onboarding.";
      }
      toast({
        title: "Error saving profile",
        description,
        variant: "destructive",
      });
    } finally {
      setSavingFinal(false);
    }
  };

  if (initializing) {
    return (
      <div className="min-h-screen bg-background">
        <main className="mx-auto max-w-md p-6">
          <LoadingOverlay label="Loading your onboarding progress…" />
        </main>
      </div>
    );
  }

  const progressLabel = progressSavedAt
    ? `Last saved at ${progressSavedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
    : "Progress auto-saves as you go.";

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <Section title="Tell us about yourself">
            <div className="space-y-4">
              <div>
                <Label htmlFor="age">Age</Label>
                <Input
                  id="age"
                  type="number"
                  inputMode="numeric"
                  min={13}
                  max={100}
                  placeholder="25"
                  value={form.age ?? ""}
                  onChange={(event) =>
                    updateForm({
                      age:
                        event.target.value === ""
                          ? undefined
                          : Number(event.target.value),
                    })
                  }
                />
              </div>
              <div>
                <Label htmlFor="sex">Sex</Label>
                <Select
                  value={form.sex ?? ""}
                  onValueChange={(value) => updateForm({ sex: value as Sex })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select sex" />
                  </SelectTrigger>
                  <SelectContent>
                    {SEX_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option === "other"
                          ? "Other"
                          : option.charAt(0).toUpperCase() + option.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Height</Label>
                <div className="mt-1">
                  <HeightInputUS
                    valueCm={form.heightCm}
                    onChangeCm={(cm) =>
                      updateForm({ heightCm: cm && cm > 0 ? cm : undefined })
                    }
                  />
                </div>
              </div>
            </div>
          </Section>
        );
      case 1:
        return (
          <Section title="What are your goals?">
            <div className="space-y-4">
              <div>
                <Label htmlFor="goal">Primary goal</Label>
                <Select
                  value={form.goal ?? ""}
                  onValueChange={(value) => updateForm({ goal: value as Goal })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select your goal" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lose-fat">Lose body fat</SelectItem>
                    <SelectItem value="gain-muscle">Build muscle</SelectItem>
                    <SelectItem value="maintain">Maintain fitness</SelectItem>
                    <SelectItem value="recomp">Body recomposition</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="timeline">Timeline (months)</Label>
                <Input
                  id="timeline"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={36}
                  placeholder="6"
                  value={form.timeline ?? ""}
                  onChange={(event) =>
                    updateForm({
                      timeline:
                        event.target.value === ""
                          ? undefined
                          : Number(event.target.value),
                    })
                  }
                />
              </div>
            </div>
          </Section>
        );
      case 2:
        return (
          <Section title="Equipment & health">
            <div className="space-y-4">
              <div>
                <Label htmlFor="equipment">Available equipment</Label>
                <Select
                  value={form.equipment ?? ""}
                  onValueChange={(value) =>
                    updateForm({ equipment: value as Equipment })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select equipment access" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gym">Full gym</SelectItem>
                    <SelectItem value="home-basic">Basic home gear</SelectItem>
                    <SelectItem value="bodyweight">Bodyweight only</SelectItem>
                    <SelectItem value="none">No equipment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="injuries">Injuries or limitations</Label>
                <Input
                  id="injuries"
                  placeholder="e.g., Lower back, knee issues (optional)"
                  value={form.injuries ?? ""}
                  onChange={(event) =>
                    updateForm({ injuries: event.target.value })
                  }
                />
              </div>
            </div>
          </Section>
        );
      case 3:
        return (
          <Section title="Activity preferences">
            <div className="space-y-4">
              <div>
                <Label htmlFor="activities">Preferred activities</Label>
                <Input
                  id="activities"
                  placeholder="e.g., Running, weight training, yoga"
                  value={form.activities ?? ""}
                  onChange={(event) =>
                    updateForm({ activities: event.target.value })
                  }
                />
              </div>
              <div>
                <Label htmlFor="experience">Experience level</Label>
                <Select
                  value={form.experience ?? ""}
                  onValueChange={(value) =>
                    updateForm({ experience: value as Experience })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select experience level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">
                      Beginner (0-6 months)
                    </SelectItem>
                    <SelectItem value="intermediate">
                      Intermediate (6 months - 2 years)
                    </SelectItem>
                    <SelectItem value="advanced">
                      Advanced (2+ years)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Section>
        );
      default:
        return (
          <Section title="Diet & preferences">
            <div className="space-y-4">
              <div>
                <Label htmlFor="diet">Diet type</Label>
                <Select
                  value={form.diet ?? ""}
                  onValueChange={(value) => updateForm({ diet: value as Diet })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select diet preference" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="balanced">Balanced</SelectItem>
                    <SelectItem value="low-carb">Low carb</SelectItem>
                    <SelectItem value="vegetarian">Vegetarian</SelectItem>
                    <SelectItem value="vegan">Vegan</SelectItem>
                    <SelectItem value="keto">Ketogenic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="likes">Foods you enjoy</Label>
                <Input
                  id="likes"
                  placeholder="e.g., Chicken, fish, vegetables"
                  value={form.likes ?? ""}
                  onChange={(event) =>
                    updateForm({ likes: event.target.value })
                  }
                />
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="notifications"
                  checked={!!form.notifications}
                  onCheckedChange={(checked) =>
                    updateForm({
                      notifications: checked === true ? true : false,
                    })
                  }
                />
                <Label htmlFor="notifications">
                  Enable scan reminders and coaching tips
                </Label>
              </div>
            </div>
          </Section>
        );
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-md space-y-6 p-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-foreground">
            Setup Your Profile
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Step {step + 1} of {STEP_TITLES.length}: {STEP_TITLES[step]}
          </p>
        </div>

        {loadError && (
          <Alert variant="destructive">
            <AlertTitle>We couldn&apos;t load everything</AlertTitle>
            <AlertDescription className="mt-2 flex items-center justify-between gap-2">
              <span>{loadError}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setReloadToken((prev) => prev + 1)}
              >
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>{STEP_TITLES[step]}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {renderStep()}
            {stepMessage && (
              <p className="text-sm text-destructive">{stepMessage}</p>
            )}
            <p className="text-xs text-muted-foreground">{progressLabel}</p>
            {draftError && (
              <Alert variant="destructive">
                <AlertTitle>{draftError.title}</AlertTitle>
                <AlertDescription>{draftError.description}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-2">
          {step > 0 && (
            <Button variant="outline" className="flex-1" onClick={handleBack}>
              Back
            </Button>
          )}
          {step < STEP_TITLES.length - 1 ? (
            <Button className="flex-1" onClick={handleNext}>
              Next
            </Button>
          ) : (
            <DemoWriteButton
              className="flex-1"
              disabled={savingFinal}
              onClick={handleFinish}
            >
              {savingFinal ? "Saving…" : "Complete Setup"}
            </DemoWriteButton>
          )}
        </div>
      </main>
    </div>
  );
}
