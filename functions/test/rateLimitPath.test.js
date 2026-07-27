import assert from "node:assert/strict";
import test from "node:test";

import { rateLimitDocumentPath } from "../lib/middleware/rateLimit.js";

test("rate limiter uses a valid server-private Firestore document path", () => {
  const path = rateLimitDocumentPath("user_123", "coachChat");
  assert.equal(path, "users/user_123/private/rateLimits_coachChat");
  assert.equal(path.split("/").length % 2, 0);
});

test("rate limiter sanitizes internal keys and rejects invalid user ids", () => {
  assert.equal(
    rateLimitDocumentPath("user_123", "workouts/generate"),
    "users/user_123/private/rateLimits_workouts_generate"
  );
  assert.throws(() => rateLimitDocumentPath("users/bad", "coachChat"));
  assert.throws(() => rateLimitDocumentPath("user_123", ""));
});
