import assert from "node:assert/strict";
import test from "node:test";
import { isCoachMessageInScope } from "../lib/coachChat.js";

test("workout and recovery questions remain in scope", () => {
  assert.equal(
    isCoachMessageInScope("Can you swap my squat for a safer exercise?"),
    true
  );
  assert.equal(
    isCoachMessageInScope("I am sore after yesterday's workout"),
    true
  );
  assert.equal(isCoachMessageInScope("Plan my cardio and lifting week"), true);
});

test("unrelated requests are blocked before an AI call", () => {
  assert.equal(isCoachMessageInScope("Write code for my website"), false);
  assert.equal(isCoachMessageInScope("Who should I vote for?"), false);
  assert.equal(isCoachMessageInScope("Plan a vacation to Italy"), false);
  assert.equal(isCoachMessageInScope("Help me run my business"), false);
  assert.equal(isCoachMessageInScope("Write a press release"), false);
  assert.equal(isCoachMessageInScope("Explain machine learning"), false);
  assert.equal(isCoachMessageInScope("Add a row to my spreadsheet"), false);
});

test("ambiguous words need real fitness context", () => {
  assert.equal(isCoachMessageInScope("Help my running pace for a 5k"), true);
  assert.equal(isCoachMessageInScope("Check my chest press form"), true);
  assert.equal(
    isCoachMessageInScope("How should I use a rowing machine?"),
    true
  );
});

test("brief follow-ups require an existing workout thread", () => {
  assert.equal(
    isCoachMessageInScope("make it harder", { hasThread: true }),
    true
  );
  assert.equal(isCoachMessageInScope("make it harder"), false);
});
