import assert from "node:assert/strict";
import test from "node:test";
import { shiftWorkoutSchedule } from "../lib/lib/shiftWorkoutSchedule.js";

test("moving and undoing a schedule preserves exercises and crosses calendar boundaries", () => {
  const original = [
    { day: "Sat", exercises: [{ id: "row" }] },
    { day: "Wed", exercises: [{ id: "press" }] },
  ];
  const moved = shiftWorkoutSchedule(original, "2026-10-31", 1, ["Sat", "Wed"]);
  assert.equal(moved.startDate, "2026-11-01");
  assert.deepEqual(
    moved.days.map((day) => day.day),
    ["Sun", "Thu"]
  );
  assert.equal(moved.days[0].exercises, original[0].exercises);
  const undone = shiftWorkoutSchedule(moved.days, moved.startDate, -1, [
    "Sun",
    "Thu",
  ]);
  assert.deepEqual(undone, { days: original, startDate: "2026-10-31" });
});

test("rejects stale, unconfirmed undo, or invalid schedule changes", () => {
  const days = [{ day: "Fri" }];
  assert.throws(
    () => shiftWorkoutSchedule(days, null, -1),
    /schedule changed/i
  );
  assert.throws(
    () => shiftWorkoutSchedule(days, null, -1, ["Sat"]),
    /schedule changed/i
  );
  assert.throws(() => shiftWorkoutSchedule(days, null, 2), /one day/i);
  assert.throws(
    () => shiftWorkoutSchedule([{ day: "wrong" }], null, 1),
    /invalid workout day/i
  );
});
