import { deleteDoc, setDoc } from "@/lib/dbWrite";
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { FoodItem } from "@/lib/nutrition/types";
import { getCachedAuth } from "@/lib/auth";

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

function assertUid(): string {
  const uid = getCachedAuth()?.currentUser?.uid;
  if (!uid) throw new Error("auth");
  return uid;
}

export function userDoc(uid: string) {
  return doc(db, "users", uid);
}

export function userNutritionRoot(uid: string) {
  return doc(db, "users", uid, "nutrition", "meta");
}

function favoritesCollection(uid: string) {
  return collection(userNutritionRoot(uid), "favorites");
}

function templatesCollection(uid: string) {
  return collection(userNutritionRoot(uid), "templates");
}

export function favoritesQuery(uid?: string) {
  const userId = uid ?? assertUid();
  return query(favoritesCollection(userId), orderBy("updatedAt", "desc"));
}

export function templatesQuery(uid?: string) {
  const userId = uid ?? assertUid();
  return query(templatesCollection(userId), orderBy("updatedAt", "desc"));
}

export function subscribeFavorites(callback: (items: FavoriteDocWithId[]) => void) {
  const uid = assertUid();
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
      console.warn("favorites_subscribe_error", error);
      callback([]);
    },
  );
}

export function subscribeTemplates(callback: (items: TemplateDocWithId[]) => void) {
  const uid = assertUid();
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
      console.warn("templates_subscribe_error", error);
      callback([]);
    },
  );
}

export async function saveFavorite(item: FoodItem) {
  const uid = assertUid();
  const ref = doc(favoritesCollection(uid), item.id);
  const payload: FavoriteDoc = {
    name: item.name,
    brand: item.brand,
    item,
    updatedAt: serverTimestamp(),
  };
  await setDoc(ref, payload, { merge: true });
}

export async function removeFavorite(id: string) {
  const uid = assertUid();
  await deleteDoc(doc(favoritesCollection(uid), id));
}

export interface FavoriteDocWithId extends FavoriteDoc {
  id: string;
}

export interface TemplateDocWithId extends TemplateDoc {
  id: string;
}

export async function saveTemplate(id: string | null, name: string, items: TemplateItem[]) {
  const uid = assertUid();
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

export async function deleteTemplate(id: string) {
  const uid = assertUid();
  await deleteDoc(doc(templatesCollection(uid), id));
}
