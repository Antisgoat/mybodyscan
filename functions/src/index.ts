export { health } from "./health";

// Scan & compatibility endpoints
export {
  startScan,
  runBodyScan,
  startScanSession,
  submitScan,
  processQueuedScanHttp,
  processScan,
  getScanStatus,
} from "./scan";
export { beginPaidScan } from "./scan/beginPaidScan";
export { recordGateFailure } from "./scan/recordGateFailure";
export { refundIfNoResult } from "./scan/refundIfNoResult";

// Nutrition endpoints
export { addFoodLog, addMeal, deleteMeal, getDayLog, getDailyLog, getNutritionHistory } from "./nutrition";
export { nutritionSearch } from "./nutrition/search";
export { nutritionBarcode } from "./nutrition/barcode";

// Workouts / Coach
export {
  generateWorkoutPlan,
  generatePlan,
  getPlan,
  getCurrentPlan,
  markExerciseDone,
  addWorkoutLog,
  getWorkouts,
} from "./workouts";

// Payments & credits
export { createCheckoutSession, createCheckout, createCustomerPortal } from "./payments";
export { stripeWebhook } from "./stripeWebhook";
export { useCredit } from "./useCredit";
