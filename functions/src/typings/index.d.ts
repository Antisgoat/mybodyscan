// Ambient type declarations for Firebase Functions dependencies
declare module "firebase-admin" {
  export const apps: any[];
  export function initializeApp(config?: any): any;
  export function app(name?: string): any;
  export const auth: any;
  export const firestore: any;
  export const appCheck: any;
}

declare module "firebase-admin/app" {
  export function initializeApp(config?: any): any;
  export function getApp(name?: string): any;
  export function getApps(): any[];
  export const apps: any[];
}

declare module "firebase-admin/auth" {
  export function getAuth(app?: any): any;
}

declare module "firebase-admin/firestore" {
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

declare module "firebase-admin/app-check" {
  export function getAppCheck(app?: any): any;
}

declare module "firebase-admin/storage" {
  export function getStorage(app?: any): any;
}

declare module "firebase-functions" {
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

declare module "firebase-functions/v1" {
  export const auth: any;
  export namespace firestore {
    export function document(path: string): any;
  }
}

declare module "firebase-functions/v2/https" {
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
  export function onRequest(
    opts: HttpsOptions,
    handler: (req: Request, res: Response) => any
  ): any;
  export function onCall(handler: (request: CallableRequest) => any): any;
  export function onCall(
    opts: HttpsOptions,
    handler: (request: CallableRequest) => any
  ): any;
  export function onCall<T>(handler: (request: CallableRequest<T>) => any): any;
  export function onCall<T>(
    opts: HttpsOptions,
    handler: (request: CallableRequest<T>) => any
  ): any;
  export class HttpsError extends Error {
    constructor(code: string, message: string, details?: any);
  }
}

declare module "firebase-functions/params" {
  export function defineString(name: string): any;
  export function defineSecret(name: string): any;
}

declare module "express" {
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

// Minimal Node.js globals used in functions when @types/node is unavailable in CI
declare namespace NodeJS {
  interface ProcessEnv {
    [key: string]: string | undefined;
  }
  interface Process {
    env: ProcessEnv;
  }
}

declare const process: NodeJS.Process;

type Buffer = any;

declare const Buffer: {
  from(
    data: string,
    encoding?: string
  ): { toString(encoding?: string): string };
};

type Stripe = any;

declare const console: {
  log: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
  info: (...args: any[]) => void;
};

declare function fetch(input: any, init?: any): Promise<any>;
declare function setTimeout(
  handler: (...args: any[]) => any,
  timeout?: number,
  ...args: any[]
): any;
declare function clearTimeout(timeoutId: any): void;

interface RequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  signal?: any;
}

interface AbortSignal {
  readonly aborted: boolean;
  readonly reason?: any;
  throwIfAborted(): void;
  addEventListener(type: string, listener: (...args: any[]) => void): void;
}

declare const AbortSignal: {
  timeout(ms: number): any;
};

declare class AbortController {
  readonly signal: any;
  abort(): void;
}

declare class URL {
  constructor(input: string, base?: string);
  readonly hostname: string;
  readonly protocol: string;
  readonly host: string;
  readonly searchParams: {
    set(name: string, value: string): void;
  };
  toString(): string;
}

type BinaryLike = string | ArrayBufferView | ArrayBuffer;

declare module "node:crypto" {
  export function randomUUID(): string;
  export function createHash(algorithm: string): {
    update(data: BinaryLike): any;
    digest(encoding?: string): any;
  };
}

// Generic fallbacks for external modules when type packages are unavailable
declare module "stripe" {
  type Stripe = any;
  namespace Stripe {
    namespace Checkout {
      type SessionCreateParams = any;
      type Session = any;
    }
    interface Customer {
      id?: string | null;
      email?: string | null;
      metadata?: Record<string, any> | null;
    }
    interface Subscription {
      id?: string | null;
      status?: string | null;
      current_period_end?: number | null;
      items?: { data?: any[] };
      customer?: string | Customer | null;
    }
    interface Invoice {
      id?: string | null;
      subscription?: string | Subscription | null;
      customer?: string | Customer | null;
      lines?: { data?: any[] };
    }
    interface Event {
      id: string;
      type: string;
      data: { object: any };
    }
  }
  const Stripe: Stripe & {
    new (apiKey: string, opts?: any): any;
    webhooks: { constructEvent: (...args: any[]) => any };
  };
  export = Stripe;
  export default Stripe;
}

declare module "firebase-functions/logger" {
  export const log: (...args: any[]) => void;
  export const info: (...args: any[]) => void;
  export const warn: (...args: any[]) => void;
  export const error: (...args: any[]) => void;
  export const debug: (...args: any[]) => void;
}

declare module "crypto" {
  export function randomUUID(): string;
  export function createHash(algorithm: string): {
    update(data: BinaryLike): any;
    digest(encoding?: string): any;
  };
}

declare module "@google-cloud/storage" {
  export type File = any;
  const Storage: any;
  export default Storage;
}

// Shared scan-related interfaces
interface ScanEstimate {
  bodyFatPercent: number;
  bmi: number | null;
  notes: string;
}

interface WorkoutPlan {
  summary: string;
  progressionRules: string[];
  weeks: {
    weekNumber: number;
    days: {
      day: string;
      focus: string;
      exercises: {
        name: string;
        sets: number;
        reps: string;
        notes?: string;
      }[];
    }[];
  }[];
}

interface NutritionPlan {
  caloriesPerDay: number;
  proteinGrams: number;
  carbsGrams: number;
  fatsGrams: number;
  adjustmentRules: string[];
  sampleDay: {
    mealName: string;
    description: string;
    calories: number;
    proteinGrams: number;
    carbsGrams: number;
    fatsGrams: number;
  }[];
}

interface ScanDocument {
  id: string;
  uid: string;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
  completedAt?: FirebaseFirestore.Timestamp | null;
  status:
    | "uploading"
    | "uploaded"
    | "pending"
    | "queued"
    | "processing"
    | "complete"
    | "error";
  errorMessage?: string;
  errorReason?: string | null;
  errorInfo?: {
    code?: string;
    message?: string;
    stage?: string;
    debugId?: string;
    stack?: string;
  } | null;
  lastStep?: string | null;
  lastStepAt?: FirebaseFirestore.Timestamp | null;
  progress?: number | null;
  correlationId?: string | null;
  processingRequestedAt?: FirebaseFirestore.Timestamp | null;
  processingStartedAt?: FirebaseFirestore.Timestamp | null;
  processingHeartbeatAt?: FirebaseFirestore.Timestamp | null;
  processingAttemptId?: string | null;
  submitRequestId?: string | null;
  photoPaths: {
    front: string;
    back: string;
    left: string;
    right: string;
  };
  input: {
    currentWeightKg: number;
    goalWeightKg: number;
  };
  estimate: ScanEstimate | null;
  workoutPlan: WorkoutPlan | null;
  nutritionPlan: NutritionPlan | null;
}
