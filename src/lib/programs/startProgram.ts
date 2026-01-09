import { db } from "@/lib/firebase";
import { getCurrentUser } from "@/auth/facade";
import { doc, getDoc, serverTimestamp } from "firebase/firestore";
import { setDoc } from "@/lib/dbWrite";
import { toast } from "@/hooks/use-toast";
import { recordPermissionDenied } from "@/lib/devDiagnostics";
import { activateCatalogPlan } from "@/lib/workouts";
import { buildCatalogPlanSubmission } from "@/lib/workoutsCatalog";
import type { CatalogEntry } from "@/lib/coach/catalog";
import type { Exercise } from "@/lib/coach/types";
import { canStartPrograms } from "@/lib/entitlements";
import type { Entitlements } from "@/lib/entitlements";
import { isNative } from "@/lib/platform";

function describeExercise(exercise: Exercise) {
  const parts: string[] = [];
  if (typeof exercise.sets === "number" && exercise.sets > 0) {
    parts.push(`${exercise.sets} sets`);
  }
  if (exercise.reps) {
    parts.push(`${exercise.reps}`);
  }
  if (typeof exercise.restSec === "number" && exercise.restSec > 0) {
    parts.push(`${exercise.restSec}s rest`);
  }
  return parts.length
    ? `${exercise.name} — ${parts.join(" · ")}`
    : exercise.name;
}

export async function startCatalogProgram(params: {
  entry: CatalogEntry;
  demo: boolean;
  entitlements: Entitlements | null | undefined;
  navigate: (to: string, options?: { replace?: boolean }) => void;
}): Promise<void> {
  const { entry, demo, entitlements, navigate } = params;
  const program = entry.program;
  const meta = entry.meta;

  if (demo) {
    toast({
      title: "Demo mode",
      description: "Sign in to start and save workout programs.",
      variant: "destructive",
    });
    return;
  }
  const user = await getCurrentUser().catch(() => null);
  if (!user) {
    toast({
      title: "Sign in required",
      description: "Log in to save your training program.",
    });
    return;
  }

  const allowedNow = canStartPrograms({ demo, entitlements: entitlements ?? undefined });
  if (!allowedNow) {
    toast({
      title: "Programs locked",
      description:
        isNative()
          ? "Upgrade to Pro to start programs."
          : "Upgrade to Pro to start programs. Visit Plans to activate your account.",
      variant: "destructive",
    });
    if (isNative()) {
      navigate("/paywall", { replace: false });
    } else {
      navigate("/plans", { replace: false });
    }
    return;
  }

  try {
    const planRef = doc(db, "users", user.uid, "coachPlans", "current");
    const profileRef = doc(db, "users", user.uid, "coach", "profile");
    const priorPlanSnap = await getDoc(planRef);
    const priorPlan = priorPlanSnap.exists()
      ? (priorPlanSnap.data() as Record<string, any>)
      : null;

    const sessions = program.weeks.flatMap((week, weekIdx) =>
      (week.days ?? []).map((day) => ({
        day: `Week ${weekIdx + 1} • ${day.name}`,
        blocks: day.blocks.map((block) => ({
          title: block.title,
          focus: block.title,
          work: block.exercises.map((exercise) => describeExercise(exercise)),
        })),
      }))
    );

    const catalogSubmission = buildCatalogPlanSubmission(program, meta);
    const applied = await activateCatalogPlan(catalogSubmission, {
      attempts: 4,
      confirmPolls: 5,
      backoffMs: 500,
    });
    const workoutPlanId =
      typeof applied?.planId === "string" ? applied.planId : null;
    if (!workoutPlanId) {
      throw new Error("Unable to activate workout plan.");
    }

    const fallbackCalorieTarget =
      typeof priorPlan?.calorieTarget === "number" ? priorPlan.calorieTarget : 2200;
    const fallbackProteinFloor =
      typeof priorPlan?.proteinFloor === "number" ? priorPlan.proteinFloor : 140;
    const progression =
      priorPlan?.progression ??
      ({
        deloadEvery:
          Array.isArray(program.deloadWeeks) && program.deloadWeeks.length
            ? program.deloadWeeks[0]
            : 4,
      } as { deloadEvery: number });

    const nextPlan = {
      days: meta.daysPerWeek,
      weeks: meta.weeks,
      split: program.title,
      sessions,
      progression,
      calorieTarget: fallbackCalorieTarget,
      proteinFloor: fallbackProteinFloor,
      disclaimer:
        program.summary ??
        priorPlan?.disclaimer ??
        "Training guidance only – not medical advice.",
      source: "catalog",
      programId: program.id,
      programTitle: program.title,
      programGoal: meta.goal,
      programLevel: meta.level,
      workoutPlanId,
      updatedAt: serverTimestamp(),
    };

    // Coach metadata writes should never block workout activation.
    await Promise.allSettled([
      setDoc(planRef, nextPlan, { merge: true }),
      setDoc(
        profileRef,
        {
          currentProgramId: program.id,
          activeProgramId: program.id,
          startedAt: serverTimestamp(),
          currentWeekIdx: 0,
          currentDayIdx: 0,
          lastCompletedWeekIdx: -1,
          lastCompletedDayIdx: -1,
        },
        { merge: true }
      ),
    ]);

    toast({
      title: "Program started",
      description: `${program.title} is now your active plan.`,
    });
    navigate(`/workouts?plan=${workoutPlanId}&started=1`, { replace: true });
  } catch (error) {
    recordPermissionDenied(error, { op: "programs.startProgram" });
    const anyErr = error as any;
    const status = typeof anyErr?.status === "number" ? (anyErr.status as number) : 0;
    const code =
      typeof anyErr?.code === "string"
        ? (anyErr.code as string)
        : status === 401
          ? "unauthenticated"
          : status === 403
            ? "permission-denied"
            : status === 503
              ? "unavailable"
              : null;
    let description: string;
    if (code === "unauthenticated") {
      description = "Please sign in again, then retry starting the program.";
    } else if (code === "permission-denied") {
      description =
        "Your account can't start programs yet. Visit Plans to activate your account.";
    } else if (code === "unavailable") {
      description = "Programs are temporarily offline. Please try again shortly.";
    } else if (typeof (error as Error)?.message === "string" && (error as Error).message.length) {
      description = (error as Error).message;
    } else {
      description = "Please try again.";
    }
    toast({
      title: "Could not start program",
      description,
      variant: "destructive",
    });
  }
}

