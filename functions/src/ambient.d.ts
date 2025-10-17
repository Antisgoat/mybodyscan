// Ambient type declarations for Firebase Functions dependencies
declare module 'firebase-admin' {
  export const apps: any[];
  export function initializeApp(config?: any): any;
  export function app(name?: string): any;
  export const auth: any;
  export const firestore: any;
  export const appCheck: any;
}

declare module 'firebase-admin/app' {
  export function initializeApp(config?: any): any;
  export function getApp(name?: string): any;
  export function getApps(): any[];
  export const apps: any[];
}

declare module 'firebase-admin/auth' {
  export function getAuth(app?: any): any;
}

declare module 'firebase-admin/firestore' {
  export function getFirestore(app?: any): any;
  export type Firestore = any;
  export type Transaction = any;
  export class FieldValue {
    static serverTimestamp(): any;
    static increment(n: number): any;
    static arrayUnion(...elements: any[]): any;
    static arrayRemove(...elements: any[]): any;
    static delete(): any;
  }
  export class Timestamp {
    constructor(seconds: number, nanoseconds: number);
    static now(): Timestamp;
    static fromDate(date: Date): Timestamp;
    static fromMillis(milliseconds: number): Timestamp;
    toDate(): Date;
    toMillis(): number;
  }
  export type DocumentReference = any;
  export type DocumentSnapshot = any;
  export type QuerySnapshot = any;
}

// Provide minimal global namespace typings for FirebaseFirestore used in code
// This mirrors common firebase-admin types at a high level to satisfy the typechecker
declare namespace FirebaseFirestore {
  type DocumentData = any;
  type Transaction = any;
  type Timestamp = any;
  type FieldValue = any;
  type DocumentReference<T = DocumentData> = any;
  type DocumentSnapshot<T = DocumentData> = any;
  type QuerySnapshot<T = DocumentData> = any;
  type Query<T = DocumentData> = any;
  type CollectionReference<T = DocumentData> = any;
  type QueryDocumentSnapshot<T = DocumentData> = any;
}

declare module 'firebase-admin/app-check' {
  export function getAppCheck(app?: any): any;
}

declare module 'firebase-admin/storage' {
  export function getStorage(app?: any): any;
}

declare module 'firebase-functions' {
  export const config: {
    (): any;
  };
  export const auth: any;
  export const https: any;
  export const firestore: any;
  export const logger: {
    info(...args: any[]): void;
    warn(...args: any[]): void;
    error(...args: any[]): void;
    debug(...args: any[]): void;
  };
}

declare module 'firebase-functions/v1' {
  export const auth: any;
  export namespace firestore {
    export function document(path: string): any;
  }
}

declare module 'firebase-functions/v2/https' {
  interface Request {
    body: any;
    headers: any;
    method: string;
    query: any;
    params: any;
    path?: string;
    url?: string;
    get(name: string): string | undefined;
    header(name: string): string | undefined;
  }
  
  interface Response {
    status(code: number): Response;
    send(body?: any): Response;
    json(body: any): Response;
    set(field: string, value: string): Response;
    setHeader(name: string, value: string): void;
    end(data?: any): void;
    headersSent?: boolean;
  }

  interface CallableRequest<T = any> {
    data: T;
    auth?: any;
    rawRequest: Request;
  }

  // Note: HttpsError is a concrete class exported by the SDK; no separate interface here to avoid declaration merging

  interface HttpsOptions {
    cors?: boolean | string | string[];
    region?: string | string[];
    memory?: string;
    timeoutSeconds?: number;
    invoker?: string | string[];
    secrets?: string[];
    maxInstances?: number;
    [key: string]: any;
  }

  export function onRequest(handler: (req: Request, res: Response) => any): any;
  export function onRequest(opts: HttpsOptions, handler: (req: Request, res: Response) => any): any;
  export function onCall(handler: (request: CallableRequest) => any): any;
  export function onCall(opts: HttpsOptions, handler: (request: CallableRequest) => any): any;
  export function onCall<T>(handler: (request: CallableRequest<T>) => any): any;
  export function onCall<T>(opts: HttpsOptions, handler: (request: CallableRequest<T>) => any): any;
  export class HttpsError extends Error {
    constructor(code: string, message: string, details?: any);
  }
}

declare module 'firebase-functions/params' {
  export function defineString(name: string): any;
  export function defineSecret(name: string): any;
}

declare module 'express' {
  export interface Request {
    body: any;
    headers: any;
    method: string;
    query: any;
    params: any;
    path?: string;
    url?: string;
    get(name: string): string | undefined;
    header(name: string): string | undefined;
  }

  export interface Response {
    status(code: number): Response;
    send(body?: any): Response;
    json(body: any): Response;
    set(field: string, value: string): Response;
    setHeader(name: string, value: string): void;
    end(data?: any): void;
    headersSent?: boolean;
  }

  export interface NextFunction {
    (err?: any): void;
  }

  export interface RequestHandler {
    (req: Request, res: Response, next: NextFunction): any;
  }

  export interface Router {
    use(...handlers: RequestHandler[]): void;
    get(path: string, ...handlers: RequestHandler[]): void;
    post(path: string, ...handlers: RequestHandler[]): void;
  }

  function express(): any;
  namespace express {
    function json(options?: any): any;
  }
  export default express;
}

declare module '@sentry/node';
