export type UserLike = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoUrl: string | null;
  phoneNumber: string | null;
  emailVerified: boolean;
  isAnonymous: boolean;
  providerId: string | null;
};

export type Unsubscribe = () => void;
