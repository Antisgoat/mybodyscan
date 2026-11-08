import assert from "node:assert/strict";
import test from "node:test";
import {
  gymPlanExercises,
  gymStarterDays,
  planMatchesGym,
} from "../lib/lib/gymPlanConstraints.js";

test("starter schedules preserve requested days and full-body recovery spacing", () => {
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  for (let count = 2; count <= 7; count++) {
    const days = gymStarterDays(count);
    assert.equal(days.length, count);
    const positions = days
      .filter((day) => day.lifting)
      .map((day) => weekdays.indexOf(day.day));
    assert(positions.length >= 2 && positions.length <= 3);
    for (let i = 1; i < positions.length; i++)
      assert(positions[i] - positions[i - 1] >= 2);
    assert(7 + positions[0] - positions.at(-1) >= 2);
  }
});

test("confirmed dumbbells and leg press do not unlock barbells or unrelated machines", () => {
  const inventory = ["dumbbells", "leg_press", "stationary_bike"];
  const names = gymPlanExercises(inventory);
  assert(names.includes("Standing Bent-Over Dumbbell Row"));
  assert(names.includes("Leg Press"));
  assert(names.includes("Stationary Bike"));
  assert(
    !names.some((name) =>
      /barbell|hack squat|treadmill|chest press/i.test(name)
    )
  );
  assert.equal(
    planMatchesGym(
      [{ exercises: [{ name: "Barbell Bent-Over Row" }] }],
      inventory
    ),
    false
  );
  assert.equal(
    planMatchesGym(
      [{ exercises: [{ name: "Standing Bent-Over Dumbbell Row" }] }],
      inventory
    ),
    true
  );
});
test("a barbell must be explicitly confirmed; unknown machine names fail closed", () => {
  assert(gymPlanExercises(["barbell"]).includes("Barbell Bent-Over Row"));
  assert.equal(
    planMatchesGym(
      [{ exercises: [{ name: "Belt Squat" }] }],
      ["other_strength_machines"]
    ),
    false
  );
});
