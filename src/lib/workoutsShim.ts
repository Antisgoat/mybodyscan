const TODO_LINK = "https://linear.app/mybodyscan/issue/WORKOUTS-SHIM";

function logShim(method: string) {
  console.info(
    `[shim] ${method}() – replace with workout planner service. TODO: ${TODO_LINK}`
  );
}

export interface MockWorkoutExercise {
  id: string;
  name: string;
  sets: number;
  reps: string;
  focus: "strength" | "hypertrophy" | "mobility" | "conditioning";
}

export interface MockWorkoutDay {
  day: string;
  summary: string;
  exercises: MockWorkoutExercise[];
}

export interface MockWorkoutPlan {
  today: MockWorkoutDay;
  library: Array<{
    id: string;
    name: string;
    difficulty: "beginner" | "intermediate" | "advanced";
    durationMinutes: number;
    focus: string;
  }>;
  completionStreak: Array<{ date: string; completed: boolean }>;
}

export async function getTodayPlanMock(): Promise<MockWorkoutPlan> {
  logShim("getTodayPlanMock");
  const today = new Date();
  const exercises: MockWorkoutExercise[] = [
    { id: "sq", name: "Back Squat", sets: 4, reps: "6-8", focus: "strength" },
    { id: "bp", name: "Bench Press", sets: 4, reps: "6-8", focus: "strength" },
    {
      id: "row",
      name: "Seated Row",
      sets: 3,
      reps: "10-12",
      focus: "hypertrophy",
    },
    { id: "plk", name: "Plank", sets: 3, reps: "45s", focus: "conditioning" },
  ];

  const streak = Array.from({ length: 14 }, (_, idx) => {
    const date = new Date(today.getTime() - idx * 86400000);
    return {
      date: date.toISOString().slice(0, 10),
      completed: idx % 3 !== 0,
    };
  }).reverse();

  return {
    today: {
      day: today.toLocaleDateString(undefined, { weekday: "long" }),
      summary: "Lower body strength + core finisher",
      exercises,
    },
    library: [
      {
        id: "hypertrophy-1",
        name: "Upper Pump 45",
        difficulty: "intermediate",
        durationMinutes: 45,
        focus: "Chest + Back",
      },
      {
        id: "conditioning-1",
        name: "MetCon 30",
        difficulty: "advanced",
        durationMinutes: 30,
        focus: "Engine + Core",
      },
      {
        id: "mobility-1",
        name: "Mobility Reset",
        difficulty: "beginner",
        durationMinutes: 20,
        focus: "Recovery",
      },
    ],
    completionStreak: streak,
  };
}

export async function completeSetMock(exerciseId: string) {
  logShim("completeSetMock");
  return {
    exerciseId,
    completedAt: new Date().toISOString(),
  };
}
