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
import { getCachedUser } from "@/auth/client";

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

export function favoritesQuery(uid?: string) {
  const userId = resolveUid(uid);
  return query(favoritesCollection(userId), orderBy("updatedAt", "desc"));
}

export function templatesQuery(uid?: string) {
  const userId = resolveUid(uid);
  return query(templatesCollection(userId), orderBy("updatedAt", "desc"));
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
