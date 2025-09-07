import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const pricing = {
  "price_1RuOpKQQU5vuhlNjipfFBsR0": { plan:"starter", credits:1, credit_expiry_days:365 },
  "price_1S4XsVQQU5vuhlNjzdQzeySA": { plan:"pro",     credits:3, credit_expiry_days:365, extra_scan_price:9.99 },
  "price_1S4Y6YQQU5vuhlNjeJFmshxX": { plan:"elite",  credits:36, credit_expiry_days:365, extra_scan_price:9.99 },
  "price_1S4Y9JQQU5vuhlNjB7cBfmaW": { plan:"extra_scan", credits:1, credit_expiry_days:365 }
};

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

(async () => {
  for (const [priceId, doc] of Object.entries(pricing)) {
    await db.doc(`pricing/${priceId}`).set(doc, { merge: true });
    console.log("Wrote pricing", priceId, doc);
  }
  process.exit(0);
})();
