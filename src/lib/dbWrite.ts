import { assertWritable, DemoWriteError, notifyDemoBlocked } from "./demo";
import {
  addDoc as _addDoc,
  setDoc as _setDoc,
  updateDoc as _updateDoc,
  deleteDoc as _deleteDoc,
  type DocumentReference,
  type DocumentData
} from "firebase/firestore";

export async function addDoc<T = DocumentData>(colRef: any, data: T) {
  try {
    assertWritable();
  } catch (e) {
    if (e instanceof DemoWriteError) {
      notifyDemoBlocked();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return null as any;
    }
    throw e;
  }
  return _addDoc(colRef, data);
}
export async function setDoc<T = DocumentData>(
  docRef: DocumentReference<T>,
  data: T,
  options?: any
) {
  try {
    assertWritable();
  } catch (e) {
    if (e instanceof DemoWriteError) {
      notifyDemoBlocked();
      return;
    }
    throw e;
  }
  return _setDoc(docRef, data as any, options);
}
export async function updateDoc<T = DocumentData>(
  docRef: DocumentReference<T>,
  data: Partial<T>
) {
  try {
    assertWritable();
  } catch (e) {
    if (e instanceof DemoWriteError) {
      notifyDemoBlocked();
      return;
    }
    throw e;
  }
  return _updateDoc(docRef, data as any);
}
export async function deleteDoc<T = DocumentData>(docRef: DocumentReference<T>) {
  try {
    assertWritable();
  } catch (e) {
    if (e instanceof DemoWriteError) {
      notifyDemoBlocked();
      return;
    }
    throw e;
  }
  return _deleteDoc(docRef);
}
