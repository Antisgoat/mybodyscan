// Unified Food Database Search Layer
// Searches across local food databases only - NO external APIs

export type FoodItem = {
  id: string;
  source: 'primary' | 'secondary';
  name: string;
  brand?: string;
  gtin?: string;
  serving: {
    amount: number;
    unit: string;
    altServings?: Array<{ amount: number; unit: string }>;
  };
  nutrients: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber?: number;
    sugar?: number;
    sodium?: number;
  };
};

let foodIndex: FoodItem[] = [];
let indexLoaded = false;

// Load and index both food databases
async function loadFoodDatabases(): Promise<void> {
  if (indexLoaded) return;

  try {
    // Load both databases in parallel
    const [db1Response, db2Response] = await Promise.all([
      fetch('/src/data/foodDb1.json'),
      fetch('/src/data/foodDb2.json')
    ]);

    const [db1Data, db2Data] = await Promise.all([
      db1Response.json(),
      db2Response.json()
    ]);

    // Merge databases with source labels
    const primaryFoods: FoodItem[] = db1Data.map((item: any) => ({
      ...item,
      source: 'primary' as const
    }));

    const secondaryFoods: FoodItem[] = db2Data.map((item: any) => ({
      ...item,
      source: 'secondary' as const
    }));

    foodIndex = [...primaryFoods, ...secondaryFoods];
    indexLoaded = true;

    console.log(`Food database loaded: ${foodIndex.length} items from 2 sources`);
  } catch (error) {
    console.error('Failed to load food databases:', error);
    foodIndex = [];
  }
}

// Simple fuzzy search with typo tolerance
function fuzzyMatch(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  
  // Exact match
  if (t.includes(q)) return 100;
  
  // Calculate similarity based on common characters
  let matches = 0;
  const maxLen = Math.max(q.length, t.length);
  
  for (let i = 0; i < q.length; i++) {
    if (t.includes(q[i])) matches++;
  }
  
  return Math.round((matches / maxLen) * 100);
}

// Search foods with fuzzy matching
export async function searchFoods(query: string, limit: number = 20): Promise<FoodItem[]> {
  await loadFoodDatabases();
  
  if (!query.trim()) return [];
  
  const results: Array<{ item: FoodItem; score: number }> = [];
  
  for (const item of foodIndex) {
    const nameScore = fuzzyMatch(query, item.name);
    const brandScore = item.brand ? fuzzyMatch(query, item.brand) : 0;
    const gtinMatch = item.gtin?.includes(query) ? 100 : 0;
    
    const maxScore = Math.max(nameScore, brandScore, gtinMatch);
    
    if (maxScore > 30) { // Minimum threshold
      results.push({ item, score: maxScore });
    }
  }
  
  // Sort by relevance
  results.sort((a, b) => b.score - a.score);
  
  return results.slice(0, limit).map(r => r.item);
}

// Search by GTIN/barcode
export async function searchByBarcode(gtin: string): Promise<FoodItem | null> {
  await loadFoodDatabases();
  
  return foodIndex.find(item => item.gtin === gtin) || null;
}

// Unit conversion helpers
const conversionFactors: Record<string, Record<string, number>> = {
  // Weight conversions (to grams)
  weight: {
    'g': 1,
    'kg': 1000,
    'oz': 28.3495,
    'lb': 453.592,
  },
  // Volume conversions (to ml)
  volume: {
    'ml': 1,
    'l': 1000,
    'fl oz': 29.5735,
    'cup': 236.588,
    'tbsp': 14.7868,
    'tsp': 4.92892,
  }
};

export function convertUnits(amount: number, fromUnit: string, toUnit: string): number | null {
  const weightFrom = conversionFactors.weight[fromUnit.toLowerCase()];
  const weightTo = conversionFactors.weight[toUnit.toLowerCase()];
  
  if (weightFrom && weightTo) {
    return (amount * weightFrom) / weightTo;
  }
  
  const volumeFrom = conversionFactors.volume[fromUnit.toLowerCase()];
  const volumeTo = conversionFactors.volume[toUnit.toLowerCase()];
  
  if (volumeFrom && volumeTo) {
    return (amount * volumeFrom) / volumeTo;
  }
  
  return null; // Units not compatible
}

// Scale nutrients based on portion size
export function scaleNutrients(
  item: FoodItem, 
  targetAmount: number, 
  targetUnit: string
): FoodItem['nutrients'] | null {
  // Try to convert to base serving
  const converted = convertUnits(targetAmount, targetUnit, item.serving.unit);
  
  if (converted === null) {
    // Check alternative servings
    const altServing = item.serving.altServings?.find(alt => 
      alt.unit.toLowerCase().includes(targetUnit.toLowerCase()) ||
      targetUnit.toLowerCase().includes(alt.unit.toLowerCase())
    );
    
    if (altServing) {
      const ratio = targetAmount / altServing.amount;
      return scaleNutrientValues(item.nutrients, ratio);
    }
    
    return null;
  }
  
  const ratio = converted / item.serving.amount;
  return scaleNutrientValues(item.nutrients, ratio);
}

function scaleNutrientValues(nutrients: FoodItem['nutrients'], ratio: number): FoodItem['nutrients'] {
  return {
    calories: Math.round(nutrients.calories * ratio),
    protein: Math.round(nutrients.protein * ratio * 10) / 10,
    carbs: Math.round(nutrients.carbs * ratio * 10) / 10,
    fat: Math.round(nutrients.fat * ratio * 10) / 10,
    fiber: nutrients.fiber ? Math.round(nutrients.fiber * ratio * 10) / 10 : undefined,
    sugar: nutrients.sugar ? Math.round(nutrients.sugar * ratio * 10) / 10 : undefined,
    sodium: nutrients.sodium ? Math.round(nutrients.sodium * ratio) : undefined,
  };
}

// Get food database stats
export async function getFoodDatabaseStats(): Promise<{ totalItems: number; sources: number }> {
  await loadFoodDatabases();
  
  return {
    totalItems: foodIndex.length,
    sources: 2
  };
}