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

// Nutrition endpoints
export { addFoodLog, addMeal, deleteMeal, getDayLog, getDailyLog } from "./nutrition";

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
export { createCheckoutSession, createCheckout, createCustomerPortal, stripeWebhook } from "./payments";
export { useCredit } from "./useCredit";
