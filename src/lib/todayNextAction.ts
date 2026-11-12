export function todayNextAction(input: {
  hasWorkout: boolean;
  hasPlan: boolean;
  workoutDone: number;
  mealLogged: boolean;
  mealLoaded: boolean;
}) {
  if (input.hasWorkout) {
    return {
      label: input.workoutDone
        ? "Continue today’s workout"
        : "Open today’s workout",
      path: "/workouts",
    } as const;
  }
  if (input.mealLoaded && !input.mealLogged) {
    return { label: "Log a meal", path: "/meals" } as const;
  }
  if (!input.hasPlan)
    return { label: "Choose a workout plan", path: "/programs" } as const;
  return { label: "Open weekly check-in", path: "/weekly-review" } as const;
}
