// Type declarations for Firebase Functions to prevent build errors
declare module "firebase-functions/v2/https" {
  export interface Request {
    [key: string]: any;
  }

  export interface Response {
    [key: string]: any;
  }

  export function onRequest(handler: (req: Request, res: Response) => any): any;
  export function onCall(handler: (data: any) => any): any;
  export const cors: any;
}

declare module "firebase-admin/app" {
  export function initializeApp(): any;
  export function getApps(): any[];
}

declare module "firebase-admin/auth" {
  export function getAuth(): any;
}

declare module "firebase-admin/firestore" {
  export function getFirestore(): any;
  export interface Transaction {
    [key: string]: any;
  }
  export interface DocumentSnapshot {
    [key: string]: any;
  }
}

declare module "firebase-admin/app-check" {
  export function getAppCheck(): any;
}

declare module "firebase-admin/storage" {
  export function getStorage(): any;
}

declare module "express" {
  export interface Request {
    [key: string]: any;
  }

  export interface Response {
    [key: string]: any;
  }

  export interface NextFunction {
    (): void;
  }
}
