import { isDemoGuest } from './demoFlag';
import { auth } from './firebase';

const TODO_LINK = 'https://linear.app/mybodyscan/issue/NUTRITION-SHIM';

function logShim(method: string) {
  console.info(`[shim] ${method}() – replace with nutrition service calls. TODO: ${TODO_LINK}`);
}

export interface MockFoodItem {
  id: string;
  name: string;
  brand?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: 'usda' | 'open-food-facts' | 'manual';
}

export interface MockDailyTotals {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export async function searchFoodsMock(query: string): Promise<MockFoodItem[]> {
  logShim('searchFoodsMock');
  if (!query) return [];
  const normalized = query.toLowerCase();
  return [
    {
      id: `usda-${normalized}`,
      name: `${query} (USDA)`,
      calories: 180,
      protein: 24,
      carbs: 12,
      fat: 4,
      source: 'usda',
    },
    {
      id: `off-${normalized}`,
      name: `${query} (OFF)`,
      brand: 'Placeholder Foods',
      calories: 210,
      protein: 18,
      carbs: 20,
      fat: 7,
      source: 'open-food-facts',
    },
  ];
}

export async function addEntryMock(food: MockFoodItem, meal: 'breakfast' | 'lunch' | 'dinner' | 'snack' = 'lunch') {
  logShim('addEntryMock');
  const uid = auth.currentUser?.uid ?? 'demo-user';
  const pathRoot = isDemoGuest() ? `users/${uid}/demo/nutrition` : `users/${uid}/nutrition`;
  return {
    path: `${pathRoot}/${new Date().toISOString().slice(0, 10)}/${meal}/${food.id}`,
    storedAt: new Date().toISOString(),
  };
}

export async function dailyTotalsMock(days = 7): Promise<MockDailyTotals[]> {
  logShim('dailyTotalsMock');
  const now = new Date();
  return Array.from({ length: days }, (_, idx) => {
    const date = new Date(now.getTime() - idx * 86400000);
    const calories = 2200 - idx * 35;
    return {
      date: date.toISOString().slice(0, 10),
      calories,
      protein: Math.round(calories * 0.3) / 4,
      carbs: Math.round(calories * 0.4) / 4,
      fat: Math.round(calories * 0.3) / 9,
    };
  }).reverse();
}
