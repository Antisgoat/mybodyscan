export type FridgeIngredient = {
  name: string;
  confidence: number;
  evidence: string;
};

export type FridgeAnalysis = {
  detected: FridgeIngredient[];
  uncertain: FridgeIngredient[];
  notes: string;
  reviewRequired?: boolean;
};

export type FridgeMeal = {
  title: string;
  summary: string;
  uses: string[];
  optional: string[];
  steps: string[];
  estimatedMinutes: number;
  whyItFits: string;
  safetyNote: string;
};

export type FridgeMealSuggestions = {
  meals: FridgeMeal[];
  notes: string;
};
