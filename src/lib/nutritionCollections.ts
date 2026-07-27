import { deleteDoc, setDoc } from "@/lib/dbWrite";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { FoodItem } from "@/lib/nutrition/types";
import { getCachedUser } from "@/auth/mbs-auth";
import { calculateSelection, type ServingUnit } from "@/lib/nutritionMath";
import {
  normalizeAllergens,
  type MajorAllergen,
} from "@/lib/nutrition/allergens";

export interface FavoriteDoc {
  name: string;
  brand?: string;
  item: FoodItem;
  updatedAt?: any;
}

export interface TemplateItem {
  item: FoodItem;
  qty: number;
  unit: string;
}

export interface TemplateDoc {
  name: string;
  items: TemplateItem[];
  updatedAt?: any;
}

export interface CustomFoodDoc {
  name: string;
  brand?: string | null;
  item: FoodItem;
  allergens: MajorAllergen[];
  labelVerified: boolean;
  updatedAt?: any;
}

export interface RecipeIngredient {
  item: FoodItem;
  qty: number;
  unit: ServingUnit;
}

export interface RecipeDoc {
  name: string;
  servings: number;
  ingredients: RecipeIngredient[];
  item: FoodItem;
  allergens: MajorAllergen[];
  updatedAt?: any;
}

function assertUid(): string {
  const uid = getCachedUser()?.uid;
  if (!uid) throw new Error("auth");
  return uid;
}

function resolveUid(uid?: string): string {
  if (uid && typeof uid === "string" && uid.trim().length) {
    return uid;
  }
  return assertUid();
}

function favoritesCollection(uid?: string) {
  const userId = resolveUid(uid);
  return collection(doc(db, "users", userId), "nutritionFavorites");
}

function templatesCollection(uid?: string) {
  const userId = resolveUid(uid);
  return collection(doc(db, "users", userId), "nutritionTemplates");
}

function customFoodsCollection(uid?: string) {
  const userId = resolveUid(uid);
  return collection(doc(db, "users", userId), "nutritionCustomFoods");
}

function recipesCollection(uid?: string) {
  const userId = resolveUid(uid);
  return collection(doc(db, "users", userId), "nutritionRecipes");
}

export function favoritesQuery(uid?: string) {
  const userId = resolveUid(uid);
  return query(favoritesCollection(userId), orderBy("updatedAt", "desc"));
}

export function templatesQuery(uid?: string) {
  const userId = resolveUid(uid);
  return query(templatesCollection(userId), orderBy("updatedAt", "desc"));
}

export function customFoodsQuery(uid?: string) {
  return query(customFoodsCollection(uid), orderBy("updatedAt", "desc"));
}

export function recipesQuery(uid?: string) {
  return query(recipesCollection(uid), orderBy("updatedAt", "desc"));
}

export function subscribeFavorites(
  callback: (items: FavoriteDocWithId[]) => void,
  uid?: string
) {
  return onSnapshot(
    favoritesQuery(uid),
    (snap) => {
      const list: FavoriteDocWithId[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data() as FavoriteDoc;
        list.push({ id: docSnap.id, ...data });
      });
      callback(list);
    },
    (error) => {
      console.warn("favorites_subscribe_error", {
        code: (error as { code?: string })?.code,
        message: (error as Error)?.message,
      });
      callback([]);
    }
  );
}

export function subscribeTemplates(
  callback: (items: TemplateDocWithId[]) => void,
  uid?: string
) {
  return onSnapshot(
    templatesQuery(uid),
    (snap) => {
      const list: TemplateDocWithId[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data() as TemplateDoc;
        list.push({ id: docSnap.id, ...data });
      });
      callback(list);
    },
    (error) => {
      console.warn("templates_subscribe_error", {
        code: (error as { code?: string })?.code,
        message: (error as Error)?.message,
      });
      callback([]);
    }
  );
}

export function subscribeCustomFoods(
  callback: (items: CustomFoodDocWithId[]) => void,
  uid?: string
) {
  return onSnapshot(
    customFoodsQuery(uid),
    (snap) => {
      callback(
        snap.docs.map((snapshot) => ({
          id: snapshot.id,
          ...(snapshot.data() as CustomFoodDoc),
        }))
      );
    },
    (error) => {
      console.warn("custom_foods_subscribe_error", {
        code: (error as { code?: string })?.code,
        message: (error as Error)?.message,
      });
      callback([]);
    }
  );
}

export function subscribeRecipes(
  callback: (items: RecipeDocWithId[]) => void,
  uid?: string
) {
  return onSnapshot(
    recipesQuery(uid),
    (snap) => {
      callback(
        snap.docs.map((snapshot) => ({
          id: snapshot.id,
          ...(snapshot.data() as RecipeDoc),
        }))
      );
    },
    (error) => {
      console.warn("recipes_subscribe_error", {
        code: (error as { code?: string })?.code,
        message: (error as Error)?.message,
      });
      callback([]);
    }
  );
}

export async function saveFavorite(item: FoodItem, uid?: string) {
  const ref = doc(favoritesCollection(uid), item.id);
  const payload: FavoriteDoc = {
    name: item.name,
    brand: item.brand,
    item,
    updatedAt: serverTimestamp(),
  };
  await setDoc(ref, payload, { merge: true });
}

export async function removeFavorite(id: string, uid?: string) {
  await deleteDoc(doc(favoritesCollection(uid), id));
}

export interface FavoriteDocWithId extends FavoriteDoc {
  id: string;
}

export interface TemplateDocWithId extends TemplateDoc {
  id: string;
}

export interface CustomFoodDocWithId extends CustomFoodDoc {
  id: string;
}

export interface RecipeDocWithId extends RecipeDoc {
  id: string;
}

export async function saveTemplate(
  id: string | null,
  name: string,
  items: TemplateItem[],
  uid?: string
) {
  const templateId =
    id ??
    (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `template-${Math.random().toString(36).slice(2, 10)}`);
  const ref = doc(templatesCollection(uid), templateId);
  const payload: TemplateDoc = {
    name,
    items,
    updatedAt: serverTimestamp(),
  };
  await setDoc(ref, payload, { merge: true });
  return templateId;
}

export async function deleteTemplate(id: string, uid?: string) {
  await deleteDoc(doc(templatesCollection(uid), id));
}

function createId(prefix: string) {
  return typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Math.random().toString(36).slice(2, 12)}`;
}

function finiteNonNegative(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${label} must be zero or greater.`);
  }
  return number;
}

export function buildCustomFoodItem(input: {
  id?: string;
  name: string;
  brand?: string | null;
  servingQty?: number;
  servingUnit?: string;
  servingGrams?: number | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}): FoodItem {
  const name = input.name.trim().slice(0, 140);
  if (!name) throw new Error("Food name is required.");
  const servingQty = Number(input.servingQty ?? 1);
  if (!Number.isFinite(servingQty) || servingQty <= 0) {
    throw new Error("Serving quantity must be greater than zero.");
  }
  const servingUnit = (input.servingUnit || "serving").trim().slice(0, 40);
  const servingGramsRaw = Number(input.servingGrams);
  const servingGrams =
    Number.isFinite(servingGramsRaw) && servingGramsRaw > 0
      ? servingGramsRaw
      : null;
  const perServing = {
    kcal: finiteNonNegative(input.calories, "Calories"),
    protein_g: finiteNonNegative(input.protein, "Protein"),
    carbs_g: finiteNonNegative(input.carbs, "Carbs"),
    fat_g: finiteNonNegative(input.fat, "Fat"),
  };
  const per100 = servingGrams
    ? {
        kcal: (perServing.kcal / servingGrams) * 100,
        protein_g: (perServing.protein_g / servingGrams) * 100,
        carbs_g: (perServing.carbs_g / servingGrams) * 100,
        fat_g: (perServing.fat_g / servingGrams) * 100,
      }
    : null;
  return {
    id: input.id ?? createId("custom"),
    name,
    brand: input.brand?.trim().slice(0, 120) || null,
    source: "User label",
    basePer100g: per100
      ? {
          kcal: per100.kcal,
          protein: per100.protein_g,
          carbs: per100.carbs_g,
          fat: per100.fat_g,
        }
      : { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    servings: servingGrams
      ? [
          {
            id: "label-serving",
            label: `${servingQty} ${servingUnit}`,
            grams: servingGrams,
            isDefault: true,
          },
        ]
      : [],
    serving: {
      qty: servingQty,
      unit: servingUnit,
      text: `${servingQty} ${servingUnit}`,
    },
    per_serving: perServing,
    per_100g: per100,
  };
}

export function buildRecipeItem(input: {
  id?: string;
  name: string;
  servings: number;
  ingredients: RecipeIngredient[];
}): FoodItem {
  const name = input.name.trim().slice(0, 140);
  if (!name) throw new Error("Recipe name is required.");
  const servings = Math.round(Number(input.servings));
  if (!Number.isFinite(servings) || servings < 1 || servings > 100) {
    throw new Error("Recipe servings must be between 1 and 100.");
  }
  if (!Array.isArray(input.ingredients) || !input.ingredients.length) {
    throw new Error("Add at least one recipe ingredient.");
  }
  const totals = input.ingredients.reduce(
    (sum, ingredient) => {
      const result = calculateSelection(
        ingredient.item,
        ingredient.qty,
        ingredient.unit
      );
      if (
        result.calories == null ||
        result.protein == null ||
        result.carbs == null ||
        result.fat == null
      ) {
        throw new Error(
          `${ingredient.item.name} is missing nutrients for that serving.`
        );
      }
      return {
        calories: sum.calories + result.calories,
        protein: sum.protein + result.protein,
        carbs: sum.carbs + result.carbs,
        fat: sum.fat + result.fat,
      };
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
  return {
    id: input.id ?? createId("recipe"),
    name,
    brand: null,
    source: "User recipe",
    basePer100g: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    servings: [],
    serving: {
      qty: 1,
      unit: "recipe serving",
      text: `1 of ${servings} servings`,
    },
    per_serving: {
      kcal: Math.round(totals.calories / servings),
      protein_g: Math.round((totals.protein / servings) * 100) / 100,
      carbs_g: Math.round((totals.carbs / servings) * 100) / 100,
      fat_g: Math.round((totals.fat / servings) * 100) / 100,
    },
  };
}

export async function saveCustomFood(
  input: {
    id?: string;
    item: FoodItem;
    allergens?: unknown;
    labelVerified: boolean;
  },
  uid?: string
) {
  if (!input.labelVerified) {
    throw new Error(
      "Confirm the nutrition values and allergens against the current package label."
    );
  }
  const id = input.id ?? input.item.id ?? createId("custom");
  const payload: CustomFoodDoc = {
    name: input.item.name,
    brand: input.item.brand,
    item: { ...input.item, id },
    allergens: normalizeAllergens(input.allergens),
    labelVerified: true,
    updatedAt: serverTimestamp(),
  };
  await setDoc(doc(customFoodsCollection(uid), id), payload, { merge: true });
  return id;
}

export async function deleteCustomFood(id: string, uid?: string) {
  await deleteDoc(doc(customFoodsCollection(uid), id));
}

export async function saveRecipe(
  input: {
    id?: string;
    name: string;
    servings: number;
    ingredients: RecipeIngredient[];
    allergens?: unknown;
  },
  uid?: string
) {
  const id = input.id ?? createId("recipe");
  const item = buildRecipeItem({ ...input, id });
  const payload: RecipeDoc = {
    name: item.name,
    servings: Math.round(input.servings),
    ingredients: input.ingredients,
    item,
    allergens: normalizeAllergens(input.allergens),
    updatedAt: serverTimestamp(),
  };
  await setDoc(doc(recipesCollection(uid), id), payload, { merge: true });
  return id;
}

export async function deleteRecipe(id: string, uid?: string) {
  await deleteDoc(doc(recipesCollection(uid), id));
}
