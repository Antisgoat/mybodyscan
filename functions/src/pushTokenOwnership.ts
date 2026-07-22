import { FieldValue, type Firestore } from "firebase-admin/firestore";

function ownerRef(db: Firestore, tokenId: string) {
  return db.doc(`pushTokenOwners/${tokenId}`);
}

export async function claimPushToken(
  db: Firestore,
  input: { uid: string; tokenId: string; token: string; platform: string }
): Promise<void> {
  const tokenRef = db.doc(
    `users/${input.uid}/notificationTokens/${input.tokenId}`
  );
  const ownershipRef = ownerRef(db, input.tokenId);
  await db.runTransaction(async (transaction) => {
    const ownership = await transaction.get(ownershipRef);
    const previousUid = ownership.data()?.uid;
    if (
      typeof previousUid === "string" &&
      previousUid !== input.uid &&
      previousUid.length <= 128 &&
      !previousUid.includes("/")
    ) {
      transaction.delete(
        db.doc(`users/${previousUid}/notificationTokens/${input.tokenId}`)
      );
    }
    transaction.set(
      tokenRef,
      {
        token: input.token,
        platform: input.platform,
        active: true,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    transaction.set(
      ownershipRef,
      { uid: input.uid, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
  });
}

export async function releasePushToken(
  db: Firestore,
  uid: string,
  tokenId: string
): Promise<void> {
  const tokenRef = db.doc(`users/${uid}/notificationTokens/${tokenId}`);
  const ownershipRef = ownerRef(db, tokenId);
  await db.runTransaction(async (transaction) => {
    const ownership = await transaction.get(ownershipRef);
    transaction.delete(tokenRef);
    if (ownership.data()?.uid === uid) transaction.delete(ownershipRef);
  });
}

export async function deletePushTokenOwnershipForUser(
  db: Firestore,
  uid: string
): Promise<void> {
  const tokens = await db.collection(`users/${uid}/notificationTokens`).get();
  await Promise.all(
    tokens.docs.map(async (token) => {
      const ownershipRef = ownerRef(db, token.id);
      await db.runTransaction(async (transaction) => {
        const ownership = await transaction.get(ownershipRef);
        if (ownership.data()?.uid === uid) transaction.delete(ownershipRef);
      });
    })
  );
}
