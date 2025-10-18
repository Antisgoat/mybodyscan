import { assertNotDemoWrite } from "./demoGuard.ts";
import {
  addDoc as _addDoc,
  setDoc as _setDoc,
  updateDoc as _updateDoc,
  deleteDoc as _deleteDoc,
  type DocumentReference,
  type DocumentData
} from "firebase/firestore";

export async function addDoc<T = DocumentData>(colRef: any, data: T) {
  assertNotDemoWrite();
  return _addDoc(colRef, data);
}
export async function setDoc<T = DocumentData>(
  docRef: DocumentReference<T>,
  data: T,
  options?: any
) {
  assertNotDemoWrite();
  return _setDoc(docRef, data as any, options);
}
export async function updateDoc<T = DocumentData>(
  docRef: DocumentReference<T>,
  data: Partial<T>
) {
  assertNotDemoWrite();
  return _updateDoc(docRef, data as any);
}
export async function deleteDoc<T = DocumentData>(docRef: DocumentReference<T>) {
  assertNotDemoWrite();
  return _deleteDoc(docRef);
}
