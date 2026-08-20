import type { Equipment, Exercise } from "@/data/exercises";

export const GYM_EQUIPMENT = [
  { id: "open_floor", label: "Open floor space", group: "Basics" },
  { id: "adjustable_bench", label: "Adjustable bench", group: "Basics" },
  { id: "flat_bench", label: "Flat bench", group: "Basics" },
  { id: "dumbbells", label: "Dumbbells", group: "Free weights" },
  { id: "kettlebells", label: "Kettlebells", group: "Free weights" },
  { id: "barbell", label: "Barbell and plates", group: "Free weights" },
  { id: "squat_rack", label: "Squat or power rack", group: "Free weights" },
  { id: "smith_machine", label: "Smith machine", group: "Machines" },
  { id: "cable_station", label: "Cable station", group: "Machines" },
  { id: "lat_pulldown", label: "Lat pulldown", group: "Machines" },
  { id: "seated_row", label: "Seated row", group: "Machines" },
  { id: "chest_press", label: "Chest press", group: "Machines" },
  { id: "shoulder_press", label: "Shoulder press", group: "Machines" },
  { id: "leg_press", label: "Leg press or hack squat", group: "Machines" },
  { id: "leg_extension", label: "Leg extension", group: "Machines" },
  { id: "leg_curl", label: "Leg curl", group: "Machines" },
  { id: "functional_trainer", label: "Functional trainer", group: "Machines" },
  {
    id: "other_strength_machines",
    label: "Other strength machines",
    group: "Machines",
  },
  { id: "pull_up_bar", label: "Pull-up bar", group: "Bodyweight" },
  { id: "dip_station", label: "Dip station", group: "Bodyweight" },
  { id: "resistance_bands", label: "Resistance bands", group: "Accessories" },
  {
    id: "suspension_trainer",
    label: "Suspension trainer",
    group: "Accessories",
  },
  { id: "medicine_balls", label: "Medicine balls", group: "Accessories" },
  { id: "ab_wheel", label: "Ab wheel", group: "Accessories" },
  { id: "sled", label: "Training sled", group: "Accessories" },
  { id: "treadmill", label: "Treadmill", group: "Cardio" },
  { id: "stationary_bike", label: "Stationary bike", group: "Cardio" },
  { id: "rower", label: "Rowing machine", group: "Cardio" },
  { id: "elliptical", label: "Elliptical", group: "Cardio" },
  { id: "stair_climber", label: "Stair climber", group: "Cardio" },
] as const;

export type GymEquipmentId = (typeof GYM_EQUIPMENT)[number]["id"];

const IDS = new Set<string>(GYM_EQUIPMENT.map((item) => item.id));

export function isGymEquipmentId(value: unknown): value is GymEquipmentId {
  return typeof value === "string" && IDS.has(value);
}

export function normalizeGymEquipment(values: unknown): GymEquipmentId[] {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.filter(isGymEquipmentId))).slice(
    0,
    GYM_EQUIPMENT.length
  );
}

export function equipmentLabel(id: GymEquipmentId): string {
  return GYM_EQUIPMENT.find((item) => item.id === id)?.label ?? id;
}

export function deriveExerciseEquipment(
  inventory: readonly GymEquipmentId[]
): Equipment[] {
  const selected = new Set(inventory);
  const result = new Set<Equipment>(["bodyweight"]);
  if (selected.has("dumbbells")) result.add("dumbbell");
  if (selected.has("kettlebells")) result.add("kettlebell");
  if (selected.has("barbell")) result.add("barbell");
  if (selected.has("resistance_bands")) result.add("bands");
  if (selected.has("smith_machine")) result.add("smith");
  if (
    selected.has("cable_station") ||
    selected.has("functional_trainer") ||
    selected.has("lat_pulldown") ||
    selected.has("seated_row")
  ) {
    result.add("cables");
  }
  if (
    selected.has("chest_press") ||
    selected.has("shoulder_press") ||
    selected.has("leg_press") ||
    selected.has("leg_extension") ||
    selected.has("leg_curl") ||
    selected.has("lat_pulldown") ||
    selected.has("seated_row") ||
    selected.has("other_strength_machines")
  ) {
    result.add("machine");
  }
  return Array.from(result);
}

export function workoutEquipmentSet(values: readonly string[]): Set<Equipment> {
  const normalized = new Set(
    values.map((value) => String(value).toLowerCase())
  );
  if (normalized.has("gym") || normalized.has("full_gym")) {
    return new Set<Equipment>([
      "barbell",
      "dumbbell",
      "machine",
      "cables",
      "smith",
      "bands",
      "bodyweight",
      "kettlebell",
    ]);
  }
  const result = new Set<Equipment>(["bodyweight"]);
  if (normalized.has("dumbbells") || normalized.has("dumbbell"))
    result.add("dumbbell");
  if (normalized.has("kettlebells") || normalized.has("kettlebell"))
    result.add("kettlebell");
  if (normalized.has("barbell")) result.add("barbell");
  if (normalized.has("machines") || normalized.has("machine"))
    result.add("machine");
  if (normalized.has("cable") || normalized.has("cables")) result.add("cables");
  if (normalized.has("smith")) result.add("smith");
  if (normalized.has("band") || normalized.has("bands")) result.add("bands");
  return result;
}

export function toWorkoutPreferenceEquipment(
  inventory: readonly GymEquipmentId[]
): string[] {
  return deriveExerciseEquipment(inventory);
}

export function gymProfileEquipment(
  inventory: readonly GymEquipmentId[]
): "bodyweight" | "dumbbells" | "gym" {
  const strengthEquipment = deriveExerciseEquipment(inventory).filter(
    (item) => item !== "bodyweight"
  );
  if (!strengthEquipment.length) return "bodyweight";
  if (strengthEquipment.every((item) => item === "dumbbell")) {
    return "dumbbells";
  }
  return "gym";
}

/**
 * Applies the detailed, user-confirmed inventory to a catalog exercise.
 * Canonical categories such as `machine` and `cables` are intentionally too
 * broad for this check: owning a leg press must not unlock a chest press.
 */
export function exerciseAllowedByGymInventory(
  exercise: Exercise,
  inventory: readonly GymEquipmentId[]
): boolean {
  if (!inventory.length) return true;
  const items = new Set(inventory);
  const name = exercise.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  const needsBench =
    exercise.equipment.some((item) =>
      ["barbell", "dumbbell", "smith"].includes(item)
    ) && /bench|incline press|chest supported|seal row|hip thrust/.test(name);
  if (
    needsBench &&
    !items.has("adjustable_bench") &&
    !items.has("flat_bench")
  ) {
    return false;
  }

  if (
    exercise.equipment.includes("barbell") &&
    !items.has("squat_rack") &&
    (exercise.movementPattern === "squat" ||
      exercise.movementPattern === "horizontal_push" ||
      exercise.movementPattern === "vertical_push" ||
      /rack pull/.test(name))
  ) {
    return false;
  }

  if (
    /pull up|chin up|inverted row|hanging knee raise|hanging leg raise/.test(
      name
    ) &&
    !items.has("pull_up_bar") &&
    !items.has("suspension_trainer") &&
    !items.has("cable_station") &&
    !items.has("lat_pulldown") &&
    !items.has("functional_trainer")
  ) {
    return false;
  }
  if (
    /dip/.test(name) &&
    !items.has("dip_station") &&
    !items.has("adjustable_bench") &&
    !items.has("flat_bench")
  ) {
    return false;
  }
  if (
    /back extension|hyperextension/.test(name) &&
    !items.has("other_strength_machines")
  ) {
    return false;
  }
  if (/ab wheel/.test(name) && !items.has("ab_wheel")) return false;

  const supportsCableExercise = () => {
    if (items.has("cable_station") || items.has("functional_trainer"))
      return true;
    if (items.has("lat_pulldown") && /pulldown/.test(name)) return true;
    if (items.has("seated_row") && /row/.test(name)) return true;
    return false;
  };
  const supportsMachineExercise = () => {
    if (items.has("other_strength_machines")) return true;
    if (items.has("leg_press") && /leg press|hack squat/.test(name))
      return true;
    if (items.has("leg_extension") && /leg extension/.test(name)) return true;
    if (items.has("leg_curl") && /leg curl|hamstring curl/.test(name))
      return true;
    if (
      items.has("chest_press") &&
      /chest press|pec deck|machine press/.test(name)
    )
      return true;
    if (
      items.has("shoulder_press") &&
      /shoulder press|lateral raise machine/.test(name)
    )
      return true;
    if (items.has("lat_pulldown") && /pulldown|assisted pull up/.test(name))
      return true;
    if (items.has("seated_row") && /machine row|seated row/.test(name))
      return true;
    return false;
  };

  return exercise.equipment.some((equipment) => {
    if (equipment === "bodyweight") return true;
    if (equipment === "dumbbell") return items.has("dumbbells");
    if (equipment === "kettlebell") return items.has("kettlebells");
    if (equipment === "barbell") return items.has("barbell");
    if (equipment === "smith") return items.has("smith_machine");
    if (equipment === "bands") return items.has("resistance_bands");
    if (equipment === "cables") return supportsCableExercise();
    if (equipment === "machine") return supportsMachineExercise();
    return false;
  });
}

export type GymEquipmentDetection = {
  id: GymEquipmentId;
  confidence: number;
  evidence: string;
};

export type GymEquipmentAnalysis = {
  detected: GymEquipmentDetection[];
  uncertain: GymEquipmentDetection[];
  notes: string;
};

export type SavedGymProfile = {
  inventory: GymEquipmentId[];
  exerciseEquipment: Equipment[];
  source?: "manual" | "photo" | "video" | "mixed";
  locationName?: string;
  notes?: string;
};
