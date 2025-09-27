export { health } from "./health.js";

// Scan & compatibility endpoints
export {
  startScan,
  runBodyScan,
  startScanSession,
  submitScan,
  processQueuedScanHttp,
  processScan,
  getScanStatus,
} from "./scan.js";
export { beginPaidScan } from "./scan/beginPaidScan.js";
export { recordGateFailure } from "./scan/recordGateFailure.js";
export { refundIfNoResult } from "./scan/refundIfNoResult.js";

// Nutrition endpoints
export { addFoodLog, addMeal, deleteMeal, getDayLog, getDailyLog, getNutritionHistory } from "./nutrition.js";
export { nutritionSearch } from "./nutrition/search.js";
export { nutritionBarcode } from "./nutrition/barcode.js";

// Workouts / Coach
export {
  generateWorkoutPlan,
  generatePlan,
  getPlan,
  getCurrentPlan,
  markExerciseDone,
  addWorkoutLog,
  getWorkouts,
} from "./workouts.js";

// Payments & credits
export { createCheckoutSession, createCheckout, createCustomerPortal } from "./payments.js";
export { stripeWebhook } from "./stripeWebhook.js";
export { useCredit } from "./useCredit.js";

// Food search
export { foodSearch } from "./foodSearch.js";
