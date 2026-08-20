import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { afterAll, beforeAll, describe, it } from "vitest";

const rulesPath = fileURLToPath(
  new URL("../../../database.rules.json", import.meta.url)
);
const rules = readFileSync(rulesPath, "utf8");
let testEnv: any;

// Only run these tests when a Firestore emulator is available.
const haveEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;
const d = haveEmulator ? describe : describe.skip;

d("Firestore security rules", () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: "demo-mbs",
      firestore: { rules },
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });
  it("allows owner read but blocks credit updates and plan writes", async () => {
    const uid = "alice";
    await testEnv.withSecurityRulesDisabled(async (ctx: any) => {
      await ctx.firestore().doc(`users/${uid}`).set({ credits: 1 });
    });
    const authed = testEnv.authenticatedContext(uid).firestore();
    await assertSucceeds(authed.doc(`users/${uid}`).get());
    await assertFails(authed.doc(`users/${uid}`).update({ credits: 2 }));
    await assertFails(
      authed.doc(`users/${uid}/coach/plan`).set({ tdee: 2000 })
    );
  });

  it("blocks user creation with sensitive fields", async () => {
    const uid = "bob";
    const authed = testEnv.authenticatedContext(uid).firestore();

    // Should fail with credits
    await assertFails(
      authed.doc(`users/${uid}`).set({ name: "Bob", credits: 999 })
    );

    // Should fail with billing info
    await assertFails(
      authed
        .doc(`users/${uid}`)
        .set({ name: "Bob", stripeCustomerId: "cus_fake" })
    );

    // Should succeed with safe fields
    await assertSucceeds(
      authed.doc(`users/${uid}`).set({ name: "Bob", email: "bob@test.com" })
    );
  });

  it("allows only note updates on scans", async () => {
    const uid = "alice";
    await testEnv.withSecurityRulesDisabled(async (ctx: any) => {
      await ctx
        .firestore()
        .doc(`users/${uid}/scans/scan1`)
        .set({ uid, status: "queued", createdAt: new Date() });
    });
    const authed = testEnv.authenticatedContext(uid).firestore();
    await assertSucceeds(
      authed.doc(`users/${uid}/scans/scan1`).update({ note: "hi" })
    );
    await assertFails(
      authed.doc(`users/${uid}/scans/scan1`).update({ status: "done" })
    );
  });

  it("blocks sensitive scan field creation", async () => {
    const uid = "charlie";
    const authed = testEnv.authenticatedContext(uid).firestore();

    // Should fail with results field
    await assertFails(
      authed.doc(`users/${uid}/scans/scan2`).set({
        status: "queued",
        createdAt: new Date(),
        results: { fake: "data" },
      })
    );

    // Should succeed without sensitive fields
    await assertSucceeds(
      authed.doc(`users/${uid}/scans/scan2`).set({
        status: "queued",
        createdAt: new Date(),
      })
    );
  });

  it("allows nutrition tracking only with a server-authored Pro entitlement", async () => {
    const uid = "nutrition-pro";
    const singlePurchaseUid = "nutrition-single";
    await testEnv.withSecurityRulesDisabled(async (ctx: any) => {
      const admin = ctx.firestore();
      await admin
        .doc(`users/${uid}/entitlements/current`)
        .set({ pro: true, source: "stripe" });
      await admin
        .doc(`users/${singlePurchaseUid}/entitlements/current`)
        .set({ pro: false, source: "stripe" });
    });
    const authed = testEnv.authenticatedContext(uid).firestore();
    await assertSucceeds(
      authed
        .doc(`users/${uid}/nutritionLogs/2024-01-01`)
        .set({ calories: 1000, protein_g: 50, carbs_g: 120, fat_g: 40 })
    );
    const singlePurchase = testEnv
      .authenticatedContext(singlePurchaseUid)
      .firestore();
    await assertFails(
      singlePurchase
        .doc(`users/${singlePurchaseUid}/nutritionLogs/2024-01-01`)
        .set({ calories: 1000, protein_g: 50, carbs_g: 120, fat_g: 40 })
    );
  });

  it("allows Pro users to manage private foods and recipes but not weekly-review server records", async () => {
    const uid = "adaptive-pro";
    const freeUid = "adaptive-free";
    await testEnv.withSecurityRulesDisabled(async (ctx: any) => {
      const admin = ctx.firestore();
      await admin
        .doc(`users/${uid}/entitlements/current`)
        .set({ pro: true, source: "stripe" });
      await admin
        .doc(`users/${freeUid}/entitlements/current`)
        .set({ pro: false, source: "stripe" });
      await admin
        .doc(`users/${uid}/weeklyReviews/review1`)
        .set({ status: "pending" });
    });
    const pro = testEnv.authenticatedContext(uid).firestore();
    await assertSucceeds(
      pro
        .doc(`users/${uid}/nutritionCustomFoods/food1`)
        .set({ name: "Private label food" })
    );
    await assertSucceeds(
      pro
        .doc(`users/${uid}/nutritionRecipes/recipe1`)
        .set({ name: "Private recipe" })
    );
    await assertSucceeds(pro.doc(`users/${uid}/weeklyReviews/review1`).get());
    await assertFails(
      pro.doc(`users/${uid}/weeklyReviews/review2`).set({ status: "accepted" })
    );

    const free = testEnv.authenticatedContext(freeUid).firestore();
    await assertFails(
      free
        .doc(`users/${freeUid}/nutritionCustomFoods/food1`)
        .set({ name: "Not allowed" })
    );
    await assertFails(free.doc(`users/${uid}/nutritionRecipes/recipe1`).get());
  });

  it("allows only Pro owners to save a private gym inventory", async () => {
    const proUid = "gym-pro";
    const freeUid = "gym-free";
    await testEnv.withSecurityRulesDisabled(async (ctx: any) => {
      const admin = ctx.firestore();
      await admin
        .doc(`users/${proUid}/entitlements/current`)
        .set({ pro: true, source: "stripe" });
      await admin
        .doc(`users/${freeUid}/entitlements/current`)
        .set({ pro: false, source: "stripe" });
    });

    const pro = testEnv.authenticatedContext(proUid).firestore();
    await assertSucceeds(
      pro.doc(`users/${proUid}/preferences/gymEquipment`).set({
        inventory: ["dumbbells", "flat_bench"],
        exerciseEquipment: ["bodyweight", "dumbbell"],
        source: "manual",
        locationName: "Apartment gym",
        notes: "",
        confirmedByUser: true,
        version: 1,
        updatedAt: new Date(),
      })
    );
    await assertFails(
      pro.doc(`users/${proUid}/preferences/gymEquipment`).set({
        inventory: ["imaginary_machine"],
        exerciseEquipment: ["machine"],
        source: "manual",
        locationName: "",
        notes: "",
        confirmedByUser: true,
        version: 1,
        updatedAt: new Date(),
      })
    );

    const free = testEnv.authenticatedContext(freeUid).firestore();
    await assertFails(
      free.doc(`users/${freeUid}/preferences/gymEquipment`).set({
        inventory: ["dumbbells"],
        exerciseEquipment: ["bodyweight", "dumbbell"],
        source: "manual",
        locationName: "",
        notes: "",
        confirmedByUser: true,
        version: 1,
        updatedAt: new Date(),
      })
    );
    await assertFails(
      free.doc(`users/${proUid}/preferences/gymEquipment`).get()
    );
  });

  it("validates saved allergy onboarding fields", async () => {
    const uid = "allergy-profile";
    const authed = testEnv.authenticatedContext(uid).firestore();
    await assertSucceeds(
      authed.doc(`users/${uid}`).set({
        onboarding: {
          allergies: ["milk", "sesame"],
          allergyNotes: "Avoid shared fryers.",
          version: 2,
        },
      })
    );
    await assertFails(
      authed.doc(`users/${uid}`).set({
        onboarding: {
          allergies: Array.from({ length: 10 }, (_, index) => `item-${index}`),
          version: 2,
        },
      })
    );
    await assertFails(
      authed.doc(`users/${uid}`).set({
        onboarding: {
          allergyNotes: "x".repeat(281),
          version: 2,
        },
      })
    );
  });

  it("allows Pro owner to read transformation previews but blocks all client writes", async () => {
    const uid = "alice";
    await testEnv.withSecurityRulesDisabled(async (ctx: any) => {
      const admin = ctx.firestore();
      await admin
        .doc(`users/${uid}/transformationPreviews/scan1`)
        .set({ status: "not_started", scanId: "scan1" });
      await admin
        .doc(`users/${uid}/entitlements/current`)
        .set({ pro: true, source: "stripe" });
    });
    const authed = testEnv.authenticatedContext(uid).firestore();
    const previewRef = authed.doc(`users/${uid}/transformationPreviews/scan1`);
    await assertSucceeds(previewRef.get());
    await assertFails(
      authed.doc(`users/${uid}/transformationPreviews/scan2`).set({
        status: "ready",
        imageUrl: "https://example.com/fake.png",
      })
    );
    await assertFails(previewRef.update({ status: "ready" }));
    await assertFails(previewRef.delete());
  });

  it("never exposes OAuth state or provider tokens to clients", async () => {
    const uid = "health-owner";
    await testEnv.withSecurityRulesDisabled(async (ctx: any) => {
      const admin = ctx.firestore();
      await admin.doc(`users/${uid}/serverHealth/whoop`).set({
        accessToken: "server-only",
        refreshToken: "server-only",
      });
      await admin.doc("oauthStates/state-hash").set({ uid, provider: "whoop" });
    });
    const owner = testEnv.authenticatedContext(uid).firestore();
    await assertFails(owner.doc(`users/${uid}/serverHealth/whoop`).get());
    await assertFails(
      owner.doc(`users/${uid}/serverHealth/whoop`).set({ connected: true })
    );
    await assertFails(owner.doc("oauthStates/state-hash").get());
  });

  it("blocks cross-user access", async () => {
    const uid1 = "alice";
    const uid2 = "bob";

    await testEnv.withSecurityRulesDisabled(async (ctx: any) => {
      await ctx.firestore().doc(`users/${uid1}`).set({ name: "Alice" });
    });

    const authed2 = testEnv.authenticatedContext(uid2).firestore();

    // Bob should not be able to read Alice's data
    await assertFails(authed2.doc(`users/${uid1}`).get());
    await assertFails(authed2.doc(`users/${uid1}/scans/scan1`).get());
  });
});
