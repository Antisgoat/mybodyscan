import { auth } from "./firebase";
import { isDemoGuest } from "./demoFlag";

export interface FoodItem {
  id: string;
  name: string;
  brand?: string;
  serving?: { amount: number; unit: string };
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  alcohol?: number;
  source: "USDA" | "OFF";
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
      serving: { amount: 1, unit: "cup" },
      calories: 100,
      protein: 17,
      carbs: 9,
      fat: 0,
      source: "USDA",
    },
    {
      id: "demo2",
      name: "Oats",
      serving: { amount: 40, unit: "g" },
      calories: 150,
      protein: 5,
      carbs: 27,
      fat: 3,
      source: "USDA",
    },
    {
      id: "demo3",
      name: "Chicken Breast",
      serving: { amount: 4, unit: "oz" },
      calories: 120,
      protein: 26,
      carbs: 0,
      fat: 2,
      source: "USDA",
    },
  ];
}

async function call(path: string, body: any) {
  const t = await auth.currentUser?.getIdToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (t) headers.Authorization = `Bearer ${t}`; else headers["X-Demo"] = "1";
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
  const { items } = await call("/foodSearch", { query });
  return items || [];
}

export async function lookupUPC(upc: string): Promise<FoodItem[]> {
  checkEnabled();
  if (isDemoGuest() || import.meta.env.VITE_PREVIEW === "true") {
    return mockList().slice(0, 1);
  }
  const { items } = await call("/foodLookupUPC", { upc });
  return items || [];
}

