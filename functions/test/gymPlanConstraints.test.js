import assert from "node:assert/strict";
import test from "node:test";
import {
  gymPlanExercises,
  planMatchesGym,
} from "../lib/lib/gymPlanConstraints.js";

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
