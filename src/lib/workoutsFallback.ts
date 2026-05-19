type WorkoutExercise = { id: string; name: string; sets?: number; reps?: number | string };
type WorkoutDay = { day: string; exercises: WorkoutExercise[] };
type WorkoutSummary = { planId: string | null; days: WorkoutDay[]; progress: Record<string, string[]> };

export const CORE_WORKOUT_FALLBACK: { id: string; title: string; days: WorkoutDay[] } = {
  id: "fallback-evidence-plan-v1",
  title: "Foundational Strength + Conditioning",
  days: [
    {
      day: "Mon",
      exercises: [
        { id: "goblet-squat", name: "Squat pattern (goblet/back squat)", sets: 4, reps: "6-10" },
        { id: "hinge-rdl", name: "Romanian deadlift or hip hinge", sets: 3, reps: "8-10" },
        { id: "push-horizontal", name: "Push-up or bench press", sets: 4, reps: "6-12" },
        { id: "row-horizontal", name: "Row variation", sets: 4, reps: "8-12" },
      ],
    },
    {
      day: "Wed",
      exercises: [
        { id: "lunge-split", name: "Split squat or reverse lunge", sets: 3, reps: "8-12/side" },
        { id: "pull-vertical", name: "Lat pulldown or assisted pull-up", sets: 4, reps: "6-10" },
        { id: "press-vertical", name: "Dumbbell overhead press", sets: 3, reps: "8-12" },
        { id: "core-carry", name: "Plank + loaded carry", sets: 3, reps: "30-60s" },
      ],
    },
    {
      day: "Fri",
      exercises: [
        { id: "deadlift-variant", name: "Trap-bar deadlift or kettlebell deadlift", sets: 3, reps: "5-8" },
        { id: "single-leg-hinge", name: "Single-leg RDL", sets: 3, reps: "8-10/side" },
        { id: "incline-press", name: "Incline press or push-up progression", sets: 3, reps: "8-12" },
        { id: "pulldown-row", name: "Chest-supported row or cable row", sets: 3, reps: "8-12" },
      ],
    },
  ],
};

export function toWorkoutSummaryFallback(): WorkoutSummary {
  return { planId: CORE_WORKOUT_FALLBACK.id, days: CORE_WORKOUT_FALLBACK.days, progress: {} };
}
