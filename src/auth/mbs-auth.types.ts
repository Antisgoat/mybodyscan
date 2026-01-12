export type MbsUser = {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  phoneNumber?: string | null;
  emailVerified?: boolean;
  isAnonymous?: boolean;
  providerId?: string | null;
};

export type MbsUserCredential = {
  user: MbsUser;
};

export type Unsubscribe = () => void;
