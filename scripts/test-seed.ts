import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID || 'mybodyscan-f3daf';

initializeApp({
  credential: applicationDefault(),
  projectId,
});

async function seedDeveloper() {
  const auth = getAuth();
  const email = 'developer@adlrlabs.com';
  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch (error) {
    user = await auth.createUser({
      email,
      emailVerified: true,
      password: process.env.DEV_SEED_PASSWORD || 'MyBodyScanDev!23',
      displayName: 'MyBodyScan Developer',
    });
  }

  const claims = {
    developer: true,
    tester: true,
    unlimitedCredits: true,
    credits: 999_999,
  } as const;

  await auth.setCustomUserClaims(user.uid, claims);

  const db = getFirestore();
  await db.doc(`users/${user.uid}`).set(
    {
      email,
      meta: { founder: true },
      profile: {
        firstName: 'Dev',
        lastName: 'User',
        goal: 'recomp',
        height_cm: 180,
        weight_kg: 82,
      },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  await db.doc(`users/${user.uid}/private/credits`).set(
    {
      creditsSummary: {
        totalAvailable: claims.credits,
        lastUpdated: FieldValue.serverTimestamp(),
      },
      creditBuckets: [
        {
          id: 'dev-seed',
          remaining: claims.credits,
          expiresAt: null,
        },
      ],
    },
    { merge: true },
  );

  await db.doc(`users/${user.uid}/logs/demo`).set(
    {
      lastViewedAt: FieldValue.serverTimestamp(),
      notes: 'Seeded by scripts/test-seed.ts',
    },
    { merge: true },
  );

  console.log(`Seeded developer user ${email} (${user.uid})`);
}

seedDeveloper()
  .then(() => {
    console.log('Developer seed complete.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Developer seed failed', error);
    process.exit(1);
  });
