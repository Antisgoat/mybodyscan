// Placeholder Scan Engine v0 - US Navy Body Fat Formula Implementation
// This is a local-only implementation using established formulas

export type ScanInput = {
  height_cm: number;
  sex: "male" | "female";
  weight_kg?: number;
  measurements?: {
    waist_cm?: number;
    neck_cm?: number;
    hip_cm?: number;
  };
};

export type ScanResult = {
  bodyFatPct: number;
  bmi?: number;
  weightEstimate_kg?: number;
  insight: string;
  confidence: "low" | "medium" | "high";
};

function cmToInches(cm: number): number {
  return cm / 2.54;
}

function kgToPounds(kg: number): number {
  return kg * 2.20462;
}

function calculateBMI(weight_kg: number, height_cm: number): number {
  const height_m = height_cm / 100;
  return weight_kg / (height_m * height_m);
}

// US Navy Body Fat Formula
function calculateNavyBodyFat(input: ScanInput): number {
  const { height_cm, sex, measurements } = input;
  const height_in = cmToInches(height_cm);
  
  if (!measurements?.waist_cm || !measurements?.neck_cm) {
    // Fallback estimation based on height and general assumptions
    return estimateBodyFatFromHeight(height_cm, sex);
  }

  const waist_in = cmToInches(measurements.waist_cm);
  const neck_in = cmToInches(measurements.neck_cm);

  if (sex === "male") {
    // Male formula: 495 / (1.0324 - 0.19077 * log10(waist - neck) + 0.15456 * log10(height)) - 450
    const bodyFat = 495 / (1.0324 - 0.19077 * Math.log10(waist_in - neck_in) + 0.15456 * Math.log10(height_in)) - 450;
    return Math.max(3, Math.min(50, bodyFat)); // Clamp to reasonable range
  } else {
    // Female formula needs hip measurement
    if (!measurements.hip_cm) {
      return estimateBodyFatFromHeight(height_cm, sex);
    }
    
    const hip_in = cmToInches(measurements.hip_cm);
    // Female formula: 495 / (1.29579 - 0.35004 * log10(waist + hip - neck) + 0.22100 * log10(height)) - 450
    const bodyFat = 495 / (1.29579 - 0.35004 * Math.log10(waist_in + hip_in - neck_in) + 0.22100 * Math.log10(height_in)) - 450;
    return Math.max(8, Math.min(55, bodyFat)); // Clamp to reasonable range
  }
}

// Fallback estimation when measurements are missing
function estimateBodyFatFromHeight(height_cm: number, sex: "male" | "female"): number {
  // Very basic estimation - would be replaced with ML model in production
  const baseBodyFat = sex === "male" ? 15 : 25;
  
  // Adjust slightly based on height (taller people tend to be leaner on average)
  const heightFactor = (height_cm - 170) / 20; // Normalize around 170cm
  const adjustment = heightFactor * -2; // Slight decrease for taller people
  
  return Math.max(sex === "male" ? 3 : 8, Math.min(sex === "male" ? 30 : 40, baseBodyFat + adjustment));
}

function generateInsight(result: ScanResult, input: ScanInput): string {
  const { bodyFatPct } = result;
  const { sex } = input;
  
  let category = "";
  let advice = "";
  
  if (sex === "male") {
    if (bodyFatPct < 6) category = "Essential fat (very low)";
    else if (bodyFatPct < 14) category = "Athletic";
    else if (bodyFatPct < 18) category = "Fitness";
    else if (bodyFatPct < 25) category = "Average";
    else category = "Above average";
  } else {
    if (bodyFatPct < 16) category = "Athletic";
    else if (bodyFatPct < 21) category = "Fitness";
    else if (bodyFatPct < 25) category = "Average";
    else if (bodyFatPct < 32) category = "Above average";
    else category = "Concerning";
  }
  
  // Generate supportive advice
  if (bodyFatPct < (sex === "male" ? 18 : 25)) {
    advice = "You're in great shape! Focus on maintaining your current routine and consider strength training to build lean muscle.";
  } else if (bodyFatPct < (sex === "male" ? 25 : 32)) {
    advice = "You're within a healthy range. Consider incorporating more cardio and strength training to improve body composition.";
  } else {
    advice = "Consider speaking with a healthcare professional about a sustainable fitness and nutrition plan tailored to your goals.";
  }
  
  return `Your body fat percentage of ${bodyFatPct.toFixed(1)}% falls in the ${category} range. ${advice}`;
}

export function processScanPlaceholder(input: ScanInput): ScanResult {
  const bodyFatPct = calculateNavyBodyFat(input);
  
  let bmi: number | undefined;
  let weightEstimate_kg: number | undefined;
  
  if (input.weight_kg) {
    bmi = calculateBMI(input.weight_kg, input.height_cm);
  } else {
    // Estimate weight based on height and body fat for BMI calculation
    const height_m = input.height_cm / 100;
    // Use a rough estimate of healthy weight range
    const estimatedWeight = 22 * height_m * height_m; // BMI 22 baseline
    weightEstimate_kg = estimatedWeight;
    bmi = calculateBMI(estimatedWeight, input.height_cm);
  }
  
  // Determine confidence based on available measurements
  const confidence: "low" | "medium" | "high" = 
    input.measurements?.waist_cm && input.measurements?.neck_cm ? "high" :
    input.weight_kg ? "medium" : "low";
  
  const result: ScanResult = {
    bodyFatPct: Math.round(bodyFatPct * 10) / 10, // Round to 1 decimal
    bmi: bmi ? Math.round(bmi * 10) / 10 : undefined,
    weightEstimate_kg: weightEstimate_kg ? Math.round(weightEstimate_kg * 10) / 10 : undefined,
    insight: "",
    confidence
  };
  
  result.insight = generateInsight(result, input);
  
  return result;
}