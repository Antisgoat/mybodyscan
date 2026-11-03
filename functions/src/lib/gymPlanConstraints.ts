/** Explicit candidates: broad `gym` labels must never override a saved inventory. */
export function gymPlanExercises(inventory: readonly string[]): string[] {
  const items = new Set(inventory);
  const names = [
    "Bodyweight Squat",
    "Reverse Lunge",
    "Glute Bridge",
    "Push-Up",
    "Dead Bug",
    "Side Plank",
    "Bird Dog",
    "Easy Walk",
    "Gentle Mobility",
  ];
  if (items.has("dumbbells"))
    names.push(
      "Dumbbell Goblet Squat",
      "Dumbbell Romanian Deadlift",
      "Dumbbell Reverse Lunge",
      "Dumbbell Floor Press",
      "Standing Dumbbell Shoulder Press",
      "Dumbbell Lateral Raise",
      "Dumbbell Curl",
      "Standing Bent-Over Dumbbell Row",
      "Dumbbell Suitcase Carry"
    );
  if (items.has("barbell"))
    names.push("Barbell Bent-Over Row", "Barbell Romanian Deadlift");
  const machines: Record<string, string> = {
    leg_press: "Leg Press",
    leg_extension: "Leg Extension",
    leg_curl: "Leg Curl",
    chest_press: "Machine Chest Press",
    shoulder_press: "Machine Shoulder Press",
    lat_pulldown: "Lat Pulldown",
    seated_row: "Seated Machine Row",
    treadmill: "Treadmill Walk",
    stationary_bike: "Stationary Bike",
    elliptical: "Elliptical",
    stair_climber: "Stair Climber",
    rower: "Rowing Machine",
  };
  for (const [id, name] of Object.entries(machines))
    if (items.has(id)) names.push(name);
  if (items.has("cable_station") || items.has("functional_trainer"))
    names.push("Standing Cable Row", "Cable Triceps Pushdown", "Cable Curl");
  if (items.has("resistance_bands"))
    names.push("Resistance Band Row", "Resistance Band Curl");
  return names;
}

export function planMatchesGym(
  days: { exercises: { name: string }[] }[],
  inventory: readonly string[]
): boolean {
  const allowed = new Set(
    gymPlanExercises(inventory).map((name) => name.toLowerCase())
  );
  return (
    days.length > 0 &&
    days.every(
      (day) =>
        day.exercises.length > 0 &&
        day.exercises.every((ex) => allowed.has(ex.name.trim().toLowerCase()))
    )
  );
}
