import test from "node:test";
import assert from "node:assert/strict";

import { isPrivilegedIdentity } from "../lib/lib/privilegedAuth.js";

const options = {
  allowedEmails: new Set(["developer@adlrlabs.com"]),
  allowedUids: new Set(["immutable-admin-uid"]),
};

test("privileged auth rejects an unverified exact bootstrap email", () => {
  assert.equal(
    isPrivilegedIdentity(
      {
        uid: "attacker",
        email: "developer@adlrlabs.com",
        emailVerified: false,
        claims: {},
      },
      options
    ),
    false
  );
});

test("privileged auth rejects verified sibling and lookalike domain emails", () => {
  for (const email of [
    "attacker@adlrlabs.com",
    "developer@adlerlabs.com",
    "developer@adlrlabs.com.example",
  ]) {
    assert.equal(
      isPrivilegedIdentity(
        { uid: "attacker", email, emailVerified: true, claims: {} },
        options
      ),
      false,
      email
    );
  }
});

test("privileged auth accepts only an exact verified bootstrap email fallback", () => {
  assert.equal(
    isPrivilegedIdentity(
      {
        uid: "bootstrap",
        email: " Developer@AdlrLabs.com ",
        emailVerified: true,
        claims: {},
      },
      options
    ),
    true
  );
});

test("privileged auth accepts server claims and immutable UID without email", () => {
  assert.equal(
    isPrivilegedIdentity(
      { uid: "claimed", emailVerified: false, claims: { admin: true } },
      options
    ),
    true
  );
  assert.equal(
    isPrivilegedIdentity(
      { uid: "staff", emailVerified: false, claims: { staff: true } },
      options
    ),
    true
  );
  assert.equal(
    isPrivilegedIdentity(
      { uid: "immutable-admin-uid", emailVerified: false, claims: {} },
      options
    ),
    true
  );
});

test("privileged auth does not accept legacy dev claim", () => {
  assert.equal(
    isPrivilegedIdentity(
      { uid: "legacy", emailVerified: false, claims: { dev: true } },
      options
    ),
    false
  );
});
