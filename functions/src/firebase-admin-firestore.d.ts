declare module "firebase-admin/firestore" {
  export class Timestamp {
    static now(): Timestamp;
    static fromDate(date: Date): Timestamp;
    static fromMillis(milliseconds: number): Timestamp;

    readonly seconds: number;
    readonly nanoseconds: number;

    toDate(): Date;
    toMillis(): number;
    isEqual(other: Timestamp): boolean;
    valueOf(): string;
  }
}
