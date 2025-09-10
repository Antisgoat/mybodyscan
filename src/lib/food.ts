import { auth } from "./firebase";
import { isDemoGuest } from "./demoFlag";

export interface FoodItem {
  id: string;
  name: string;
  brand?: string;
  serving: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  alcohol?: number;
}

const FUNCTIONS_URL = import.meta.env.VITE_FUNCTIONS_URL as string;

function checkEnabled() {
  if (import.meta.env.VITE_FOOD_SEARCH_ENABLED !== "true") {
    throw new Error("Food search is not enabled");
  }
}

function mockList(): FoodItem[] {
  return [
    {
      id: "demo1",
      name: "Greek Yogurt",
      serving: "1 cup",
      calories: 100,
      protein: 17,
      carbs: 9,
      fat: 0,
    },
    {
      id: "demo2",
      name: "Chicken Breast",
      serving: "4 oz",
      calories: 120,
      protein: 26,
      carbs: 0,
      fat: 2,
    },
  ];
}

async function call(path: string, body: any) {
  const t = await auth.currentUser?.getIdToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (t) headers.Authorization = `Bearer ${t}`; else headers["x-demo-guard"] = "1";
  const res = await fetch(`${FUNCTIONS_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Request failed");
  return res.json();
}

export async function searchFoods(query: string): Promise<FoodItem[]> {
  checkEnabled();
  if (isDemoGuest() || import.meta.env.VITE_PREVIEW === "true") {
    return mockList();
  }
  return call("/foodSearch", { query });
}

export async function lookupUPC(upc: string): Promise<FoodItem[]> {
  checkEnabled();
  if (isDemoGuest() || import.meta.env.VITE_PREVIEW === "true") {
    return mockList().slice(0, 1);
  }
  return call("/foodLookupUPC", { upc });
}
