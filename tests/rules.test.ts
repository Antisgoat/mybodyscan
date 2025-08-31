import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { afterAll, beforeAll, describe, it } from 'vitest';

const rules = readFileSync('database.rules.json', 'utf8');
let testEnv: any;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-mbs',
    firestore: { rules },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('Firestore security rules', () => {
  it('allows owner read but blocks credit updates and plan writes', async () => {
    const uid = 'alice';
    await testEnv.withSecurityRulesDisabled(async (ctx: any) => {
      await ctx.firestore().doc(`users/${uid}`).set({ credits: 1 });
    });
    const authed = testEnv.authenticatedContext(uid).firestore();
    await assertSucceeds(authed.doc(`users/${uid}`).get());
    await assertFails(authed.doc(`users/${uid}`).update({ credits: 2 }));
    await assertFails(authed.doc(`users/${uid}/coach/plan/current`).set({ tdee: 2000 }));
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

  it('allows valid nutrition log writes', async () => {
    const uid = 'alice';
    const authed = testEnv.authenticatedContext(uid).firestore();
    await assertSucceeds(
      authed.doc(`users/${uid}/nutritionLogs/2024-01-01`).set({ calories: 1000, protein_g: 50, carbs_g: 120, fat_g: 40 })
    );
  });
});
