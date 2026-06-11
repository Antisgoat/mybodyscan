type WorkoutExercise = {
  id: string;
  name: string;
  sets?: number;
  reps?: number | string;
  rpe?: string;
  substitutions?: string[];
  notes?: string;
};
type WorkoutDay = {
  day: string;
  warmUp?: string[];
  exercises: WorkoutExercise[];
  cardio?: string;
  steps?: string;
  progression?: string;
  safetyNotes?: string[];
};
type WorkoutSummary = {
  planId: string | null;
  days: WorkoutDay[];
  progress: Record<string, string[]>;
};

export const CORE_WORKOUT_FALLBACK: {
  id: string;
  title: string;
  days: WorkoutDay[];
  progression: string[];
  substitutions: string[];
  safetyNotes: string[];
} = {
  id: "fallback-evidence-plan-v2",
  title: "Foundational Strength + Conditioning",
  progression: [
    "Work mostly at RPE 6-8 with 1-3 reps in reserve.",
    "When all sets hit the top of the rep range twice, add the smallest practical load next time.",
    "Deload every 4-6 weeks or sooner if performance and recovery drop.",
  ],
  substitutions: [
    "Shoulder pain: use neutral-grip dumbbell press or push-up incline instead of overhead work.",
    "Knee pain: use box squat, step-up, or split-squat range that stays pain-free.",
    "Low-back pain: use chest-supported rows, hip thrusts, and goblet squats instead of heavy hinges.",
  ],
  safetyNotes: [
    "Fitness guidance only, not medical treatment.",
    "Stop any movement that causes sharp, radiating, neurological, chest, or worsening pain.",
  ],
  days: [
    {
      day: "Mon",
      warmUp: [
        "5-8 min easy bike/walk",
        "Dynamic hips/ankles/shoulders",
        "2 ramp-up sets for first lift",
      ],
      exercises: [
        {
          id: "goblet-squat",
          name: "Squat pattern (goblet/back squat)",
          sets: 4,
          reps: "6-10",
          rpe: "7",
          substitutions: ["Box squat", "Leg press"],
        },
        {
          id: "hinge-rdl",
          name: "Romanian deadlift or hip hinge",
          sets: 3,
          reps: "8-10",
          rpe: "7",
          substitutions: ["Hip thrust", "Cable pull-through"],
        },
        {
          id: "push-horizontal",
          name: "Push-up or bench press",
          sets: 4,
          reps: "6-12",
          rpe: "7-8",
          substitutions: ["Incline push-up", "Neutral-grip DB press"],
        },
        {
          id: "row-horizontal",
          name: "Row variation",
          sets: 4,
          reps: "8-12",
          rpe: "7",
          substitutions: ["Chest-supported row", "Cable row"],
        },
      ],
      cardio: "10-20 min easy Zone 2 after lifting or later in the day.",
      steps: "7,000-10,000 daily steps as tolerated.",
      progression: "Add reps first, then load. Keep technique crisp.",
      safetyNotes: [
        "Do not grind through joint pain; swap to listed substitutions.",
      ],
    },
    {
      day: "Wed",
      warmUp: [
        "5 min easy cardio",
        "Glute bridge + dead bug 2×8",
        "Shoulder/scap prep 2×10",
      ],
      exercises: [
        {
          id: "lunge-split",
          name: "Split squat or reverse lunge",
          sets: 3,
          reps: "8-12/side",
          rpe: "7",
          substitutions: ["Step-up", "Supported split squat"],
        },
        {
          id: "pull-vertical",
          name: "Lat pulldown or assisted pull-up",
          sets: 4,
          reps: "6-10",
          rpe: "7-8",
          substitutions: ["Band pulldown", "Machine pulldown"],
        },
        {
          id: "press-vertical",
          name: "Dumbbell overhead press",
          sets: 3,
          reps: "8-12",
          rpe: "6-7",
          substitutions: ["Landmine press", "Incline DB press"],
        },
        {
          id: "core-carry",
          name: "Plank + loaded carry",
          sets: 3,
          reps: "30-60s",
          rpe: "6-7",
          substitutions: ["Dead bug", "Suitcase carry"],
        },
      ],
      cardio:
        "20-30 min Zone 2 on a non-lifting day if fat loss or health is the goal.",
      steps: "Add 1,000 steps/day only when recovery is stable.",
      progression: "Keep 1-3 reps in reserve; progress one variable at a time.",
      safetyNotes: [
        "For shoulder symptoms, keep pressing neutral-grip and below painful range.",
      ],
    },
    {
      day: "Fri",
      warmUp: [
        "5-8 min easy cardio",
        "Hip hinge drill 2×8",
        "Ramp-up sets before deadlift pattern",
      ],
      exercises: [
        {
          id: "deadlift-variant",
          name: "Trap-bar deadlift or kettlebell deadlift",
          sets: 3,
          reps: "5-8",
          rpe: "7",
          substitutions: ["Kettlebell deadlift", "Hip thrust"],
        },
        {
          id: "single-leg-hinge",
          name: "Single-leg RDL",
          sets: 3,
          reps: "8-10/side",
          rpe: "7",
          substitutions: ["Hamstring curl", "Cable pull-through"],
        },
        {
          id: "incline-press",
          name: "Incline press or push-up progression",
          sets: 3,
          reps: "8-12",
          rpe: "7",
          substitutions: ["Machine chest press", "Incline push-up"],
        },
        {
          id: "pulldown-row",
          name: "Chest-supported row or cable row",
          sets: 3,
          reps: "8-12",
          rpe: "7",
          substitutions: ["One-arm DB row", "Band row"],
        },
      ],
      cardio:
        "Optional intervals: 6×30s hard / 90s easy only if joints feel good.",
      steps: "Keep weekly average consistent before adding intensity.",
      progression: "If recovery is poor, repeat loads instead of increasing.",
      safetyNotes: ["Avoid heavy spinal loading if lower-back pain is active."],
    },
  ],
};

export function toWorkoutSummaryFallback(): WorkoutSummary {
  return {
    planId: CORE_WORKOUT_FALLBACK.id,
    days: CORE_WORKOUT_FALLBACK.days,
    progress: {},
  };
}
