import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, describe, it } from 'vitest';

const rulesPath = fileURLToPath(new URL('../../../database.rules.json', import.meta.url));
const rules = readFileSync(rulesPath, 'utf8');
let testEnv: any;

// Only run these tests when a Firestore emulator is available.
const haveEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;
const d = haveEmulator ? describe : describe.skip;

d('Firestore security rules', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'demo-mbs',
      firestore: { rules },
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });
  it('allows owner read but blocks credit updates and plan writes', async () => {
    const uid = 'alice';
    await testEnv.withSecurityRulesDisabled(async (ctx: any) => {
      await ctx.firestore().doc(`users/${uid}`).set({ credits: 1 });
    });
    const authed = testEnv.authenticatedContext(uid).firestore();
    await assertSucceeds(authed.doc(`users/${uid}`).get());
    await assertFails(authed.doc(`users/${uid}`).update({ credits: 2 }));
    await assertFails(authed.doc(`users/${uid}/coach/plan`).set({ tdee: 2000 }));
  });

  it('blocks user creation with sensitive fields', async () => {
    const uid = 'bob';
    const authed = testEnv.authenticatedContext(uid).firestore();
    
    // Should fail with credits
    await assertFails(authed.doc(`users/${uid}`).set({ name: 'Bob', credits: 999 }));
    
    // Should fail with billing info
    await assertFails(authed.doc(`users/${uid}`).set({ name: 'Bob', stripeCustomerId: 'cus_fake' }));
    
    // Should succeed with safe fields
    await assertSucceeds(authed.doc(`users/${uid}`).set({ name: 'Bob', email: 'bob@test.com' }));
  });

  it('allows only note updates on scans', async () => {
    const uid = 'alice';
    await testEnv.withSecurityRulesDisabled(async (ctx: any) => {
      await ctx.firestore().doc(`users/${uid}/scans/scan1`).set({ uid, status: 'queued', createdAt: new Date() });
    });
    const authed = testEnv.authenticatedContext(uid).firestore();
    await assertSucceeds(authed.doc(`users/${uid}/scans/scan1`).update({ note: 'hi' }));
    await assertFails(authed.doc(`users/${uid}/scans/scan1`).update({ status: 'done' }));
  });

  it('blocks sensitive scan field creation', async () => {
    const uid = 'charlie';
    const authed = testEnv.authenticatedContext(uid).firestore();
    
    // Should fail with results field
    await assertFails(
      authed.doc(`users/${uid}/scans/scan2`).set({ 
        uid, 
        status: 'queued', 
        createdAt: new Date(),
        results: { fake: 'data' } 
      })
    );
    
    // Should succeed without sensitive fields
    await assertSucceeds(
      authed.doc(`users/${uid}/scans/scan2`).set({ 
        uid, 
        status: 'queued', 
        createdAt: new Date() 
      })
    );
  });

  it('allows valid nutrition log writes', async () => {
    const uid = 'alice';
    const authed = testEnv.authenticatedContext(uid).firestore();
    await assertSucceeds(
      authed.doc(`users/${uid}/nutritionLogs/2024-01-01`).set({ calories: 1000, protein_g: 50, carbs_g: 120, fat_g: 40 })
    );
  });

  it('blocks cross-user access', async () => {
    const uid1 = 'alice';
    const uid2 = 'bob';
    
    await testEnv.withSecurityRulesDisabled(async (ctx: any) => {
      await ctx.firestore().doc(`users/${uid1}`).set({ name: 'Alice' });
    });
    
    const authed2 = testEnv.authenticatedContext(uid2).firestore();
    
    // Bob should not be able to read Alice's data
    await assertFails(authed2.doc(`users/${uid1}`).get());
    await assertFails(authed2.doc(`users/${uid1}/scans/scan1`).get());
  });
});
