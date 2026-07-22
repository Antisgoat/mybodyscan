const admin = require("firebase-admin");

(async () => {
  try {
    if (admin.apps.length === 0) {
      admin.initializeApp(); // uses current gcloud/firebase auth or env creds
    }
    const db = admin.firestore();

    const pricing = {
      price_1RuOpKQQU5vuhlNjipfFBsR0: {
        plan: "starter",
        credits: 1,
        credit_expiry_days: 365,
      },
      price_1S4XsVQQU5vuhlNjzdQzeySA: {
        plan: "pro",
        credits: 3,
        credit_expiry_days: 365,
        extra_scan_price: 9.99,
      },
      price_1Tw39XQQU5vuhlNjCRpZkL6a: {
        plan: "elite",
        credits: 36,
        credit_expiry_days: 365,
        extra_scan_price: 9.99,
      },
      // Recognize delayed webhook events created before the cadence fix.
      price_1S4Y6YQQU5vuhlNjeJFmshxX: {
        plan: "elite_legacy",
        credits: 36,
        credit_expiry_days: 365,
        extra_scan_price: 9.99,
      },
      price_1S4Y9JQQU5vuhlNjB7cBfmaW: {
        plan: "extra_scan",
        credits: 1,
        credit_expiry_days: 365,
      },
    };

    for (const [id, doc] of Object.entries(pricing)) {
      await db.doc(`pricing/${id}`).set(doc, { merge: true });
      console.log("Wrote", id, doc);
    }
    console.log("✅ Pricing seeded.");
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
