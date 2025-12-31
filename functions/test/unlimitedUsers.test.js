import test from "node:test";
import assert from "node:assert/strict";

import { isUnlimitedUser } from "../lib/lib/unlimitedUsers.js";

test("isUnlimitedUser: matches by UID even when email missing", () => {
  assert.equal(
    isUnlimitedUser({ uid: "ww481RPvMYZzwn5vLX8FXyRlGVV2", email: null }),
    true
  );
});

test("isUnlimitedUser: includes backfill UIDs (no email)", () => {
  assert.equal(
    isUnlimitedUser({ uid: "DbGEQQuSE2agIIqTUBkaAYCYCP92", email: null }),
    true
  );
  assert.equal(
    isUnlimitedUser({ uid: "GBdtbwUcYGYMuA1QW0Ik6K9tP0w1", email: null }),
    true
  );
});

test("isUnlimitedUser: matches by email case-insensitively", () => {
  assert.equal(isUnlimitedUser({ uid: "nope", email: "Tester@AdlrLabs.com" }), true);
});

test("isUnlimitedUser: false when not allowlisted", () => {
  assert.equal(isUnlimitedUser({ uid: "nope", email: "nope@example.com" }), false);
});

