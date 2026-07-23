export type MomentumAction = {
  id: "nutrition" | "workout";
  label: string;
  complete: boolean;
};

export type DailyMomentum = {
  completed: number;
  available: number;
  percent: number;
  actions: MomentumAction[];
};

export function deriveDailyMomentum(input: {
  mealCalories?: number | null;
  workoutDone?: number | null;
  workoutTotal?: number | null;
}): DailyMomentum {
  const mealCalories = Number(input.mealCalories);
  const workoutDone = Math.max(0, Number(input.workoutDone) || 0);
  const workoutTotal = Math.max(0, Number(input.workoutTotal) || 0);
  const actions: MomentumAction[] = [
    {
      id: "nutrition",
      label: "Log a meal",
      complete: Number.isFinite(mealCalories) && mealCalories > 0,
    },
  ];

  if (workoutTotal > 0) {
    actions.push({
      id: "workout",
      label: "Complete today’s workout",
      complete: workoutDone >= workoutTotal,
    });
  }

  const completed = actions.filter((action) => action.complete).length;
  return {
    completed,
    available: actions.length,
    percent: actions.length ? Math.round((completed / actions.length) * 100) : 0,
    actions,
  };
}
