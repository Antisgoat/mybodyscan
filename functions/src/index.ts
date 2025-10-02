export { health } from "./health.js";

// Scan & compatibility endpoints
export {
  startScan,
  runBodyScan,
  processQueuedScanHttp,
  processScan,
  getScanStatus,
} from "./scan.js";
export { startScanSession } from "./scan/start.js";
export { submitScan } from "./scan/submit.js";
export { beginPaidScan } from "./scan/beginPaidScan.js";
export { recordGateFailure } from "./scan/recordGateFailure.js";
export { refundIfNoResult } from "./scan/refundIfNoResult.js";

// Coach
export { coachChat } from "./coachChat.js";
export { generatePlan } from "./coachPlan.js";
export { ensureTestCredits } from "./testWhitelist.js";

// Nutrition endpoints
export { addFoodLog, addMeal, deleteMeal, getDayLog, getDailyLog, getNutritionHistory } from "./nutrition.js";
export { nutritionSearch } from "./nutritionSearch.js";
export { nutritionBarcode } from "./nutritionBarcode.js";

// Workouts / Coach
export {
  generateWorkoutPlan,
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

// Auth triggers
export { handleUserCreate } from "./authTriggers.js";

// Food search
export { foodSearch } from "./foodSearch.js";
