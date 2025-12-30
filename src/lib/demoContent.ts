import type { CoachPlan, CoachProfile } from "@/hooks/useUserProfile";
import type {
  FavoriteDocWithId,
  TemplateDocWithId,
} from "@/lib/nutritionCollections";
import { demoMeals } from "@/lib/demoDataset";
import { DEMO_USER_PROFILE } from "@/demo/fixtures";

type DemoMealEntry = {
  id: string;
  name: string;
  protein?: number;
  carbs?: number;
  fat?: number;
  calories?: number;
  notes?: string;
};

type DemoNutritionHistoryDay = {
  date: string;
  totals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    alcohol?: number;
  };
};

const DEMO_CALORIE_TARGET = 2200;

export const DEMO_NUTRITION_LOG: {
  totals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    alcohol?: number;
  };
  meals: DemoMealEntry[];
} = {
  totals: {
    calories: demoMeals.totals.calories,
    protein: demoMeals.totals.protein,
    carbs: demoMeals.totals.carbs,
    fat: demoMeals.totals.fat,
    alcohol: 0,
  },
  meals: demoMeals.meals.map((meal) => ({
    id: meal.id,
    name: meal.name,
    protein: meal.protein,
    carbs: meal.carbs,
    fat: meal.fat,
    calories: meal.calories,
    notes: meal.notes,
  })),
};

export const DEMO_NUTRITION_HISTORY: DemoNutritionHistoryDay[] = Array.from({
  length: 7,
}).map((_, index) => {
  const anchor = demoMeals.date ? new Date(demoMeals.date) : new Date();
  const date = new Date(anchor);
  date.setDate(anchor.getDate() - index);
  const calorieSwing = ((index % 3) - 1) * 90;
  const proteinSwing = ((index % 2) - 0.5) * 8;
  const carbSwing = ((index % 4) - 1.5) * 12;
  const fatSwing = ((index % 3) - 1) * 5;
  return {
    date: date.toISOString().slice(0, 10),
    totals: {
      calories: Math.max(
        1500,
        Math.round(demoMeals.totals.calories + calorieSwing)
      ),
      protein: Math.max(
        90,
        Math.round(demoMeals.totals.protein + proteinSwing)
      ),
      carbs: Math.max(120, Math.round(demoMeals.totals.carbs + carbSwing)),
      fat: Math.max(35, Math.round(demoMeals.totals.fat + fatSwing)),
      alcohol: 0,
    },
  };
});

export const DEMO_WORKOUT_PROGRESS = { done: 2, total: 5 };

export const DEMO_WORKOUT_PLAN = {
  id: "demo-plan",
  days: [
    {
      day: "Sun",
      exercises: [
        { id: "sun-1", name: "Restorative yoga", sets: 1, reps: 1 },
        { id: "sun-2", name: "Light walk", sets: 1, reps: 1 },
      ],
    },
    {
      day: "Mon",
      exercises: [
        { id: "mon-1", name: "Back squat", sets: 3, reps: 10 },
        { id: "mon-2", name: "Bench press", sets: 3, reps: 8 },
        { id: "mon-3", name: "Bent-over row", sets: 3, reps: 10 },
      ],
    },
    {
      day: "Wed",
      exercises: [
        { id: "wed-1", name: "Deadlift", sets: 3, reps: 6 },
        { id: "wed-2", name: "Pull-ups", sets: 3, reps: 8 },
        { id: "wed-3", name: "Plank", sets: 3, reps: 45 },
      ],
    },
    {
      day: "Fri",
      exercises: [
        { id: "fri-1", name: "Walking lunges", sets: 3, reps: 12 },
        { id: "fri-2", name: "Shoulder press", sets: 3, reps: 10 },
        { id: "fri-3", name: "Farmer carry", sets: 3, reps: 40 },
      ],
    },
  ],
};

export const DEMO_COACH_PLAN: CoachPlan = {
  days: 5,
  split: "Upper / Lower hybrid",
  sessions: [
    {
      day: "Mon",
      blocks: [
        {
          title: "Warm-up",
          focus: "Mobility + activation",
          work: ["5 min incline walk", "World's greatest stretch 2×8/side"],
        },
        {
          title: "Strength",
          focus: "Push emphasis",
          work: [
            "Dumbbell bench 4×8 @ RPE7",
            "Seated row 3×12",
            "Incline push-up 3×12",
          ],
        },
      ],
    },
    {
      day: "Tue",
      blocks: [
        {
          title: "Lower body",
          focus: "Posterior chain",
          work: [
            "Trap-bar deadlift 4×6",
            "Split squat 3×10/side",
            "Hamstring curl 3×15",
          ],
        },
        {
          title: "Finisher",
          focus: "Core stability",
          work: ["Plank 3×45s", "Dead bug 3×12"],
        },
      ],
    },
    {
      day: "Thu",
      blocks: [
        {
          title: "Push / Pull",
          focus: "Shoulders + back",
          work: ["Overhead press 4×8", "Lat pull-down 3×12", "Face pull 3×15"],
        },
      ],
    },
    {
      day: "Fri",
      blocks: [
        {
          title: "Lower + core",
          focus: "Glutes & abs",
          work: [
            "Front squat 4×6",
            "Romanian deadlift 3×10",
            "Cable wood chop 3×12/side",
          ],
        },
      ],
    },
    {
      day: "Sat",
      blocks: [
        {
          title: "Conditioning",
          focus: "Zone 2 + strides",
          work: [
            "20 min easy bike",
            "6×20s strides",
            "Walking stretch cooldown",
          ],
        },
      ],
    },
  ],
  progression: { deloadEvery: 4 },
  calorieTarget: DEMO_CALORIE_TARGET,
  proteinFloor: 150,
  disclaimer:
    "Demo plan — educational only. Sign in to generate your own week.",
  updatedAt: new Date(),
};

export const DEMO_COACH_PROFILE: CoachProfile = {
  ...DEMO_USER_PROFILE,
};

export const DEMO_FAVORITES: FavoriteDocWithId[] = [
  {
    id: "fav-oats",
    name: "Overnight oats",
    brand: "Home prepped",
    item: {
      id: "fav-oats",
      name: "Overnight oats",
      brand: "Home prepped",
      source: "Open Food Facts" as any,
      basePer100g: { kcal: 120, protein: 6, carbs: 18, fat: 3 },
      servings: [],
      serving: { qty: 1, unit: "jar" },
      per_serving: { kcal: 320, protein_g: 18, carbs_g: 38, fat_g: 9 },
    },
    updatedAt: new Date().toISOString(),
  },
  {
    id: "fav-salad",
    name: "Power salad",
    brand: "Fresh Greens",
    item: {
      id: "fav-salad",
      name: "Power salad",
      brand: "Fresh Greens",
      source: "USDA" as any,
      basePer100g: { kcal: 80, protein: 5, carbs: 9, fat: 3 },
      servings: [],
      serving: { qty: 1, unit: "bowl" },
      per_serving: { kcal: 310, protein_g: 18, carbs_g: 26, fat_g: 12 },
    },
    updatedAt: new Date().toISOString(),
  },
];

export const DEMO_TEMPLATES: TemplateDocWithId[] = [
  {
    id: "template-hydrate",
    name: "Hydration reminder",
    items: [
      {
        item: {
          id: "water",
          name: "Water",
          brand: null,
          source: "USDA" as any,
          basePer100g: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
          servings: [],
          serving: { qty: 1, unit: "glass" },
          per_serving: { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
        },
        qty: 1,
        unit: "glass",
      },
    ],
    updatedAt: new Date().toISOString(),
  },
  {
    id: "template-smoothie",
    name: "Recovery smoothie",
    items: [
      {
        item: {
          id: "banana",
          name: "Banana",
          brand: null,
          source: "USDA" as any,
          basePer100g: { kcal: 89, protein: 1.1, carbs: 22.8, fat: 0.3 },
          servings: [],
          serving: { qty: 1, unit: "medium" },
          per_serving: { kcal: 105, protein_g: 1.3, carbs_g: 27, fat_g: 0.4 },
        },
        qty: 1,
        unit: "medium",
      },
      {
        item: {
          id: "protein-powder",
          name: "Whey protein",
          brand: "Demo Labs",
          source: "USDA" as any,
          basePer100g: { kcal: 360, protein: 75, carbs: 10, fat: 5 },
          servings: [],
          serving: { qty: 1, unit: "scoop" },
          per_serving: { kcal: 140, protein_g: 27, carbs_g: 4, fat_g: 2 },
        },
        qty: 1,
        unit: "scoop",
      },
    ],
    updatedAt: new Date().toISOString(),
  },
];
