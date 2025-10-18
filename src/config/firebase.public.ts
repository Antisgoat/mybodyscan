const API_KEY = "AIzaSyDA90cwKTCQ9tGfUx66PDmfGwUoiTbhafE";
const AUTH_DOMAIN = "mybodyscan-f3daf.firebaseapp.com";
const PROJECT_ID = "mybodyscan-f3daf";
const STORAGE_BUCKET = "mybodyscan-f3daf.appspot.com";
const MESSAGING_SENDER_ID = "157018993008";
const APP_ID = "1:157018993008:web:8bed67e098ca04dc4b1fb5";
const MEASUREMENT_ID = "G-TV8M3PY1X3";

export const FIREBASE_PUBLIC_CONFIG = {
  apiKey: API_KEY,
  authDomain: AUTH_DOMAIN,
  projectId: PROJECT_ID,
  storageBucket: STORAGE_BUCKET,
  messagingSenderId: MESSAGING_SENDER_ID,
  appId: APP_ID,
  ...(MEASUREMENT_ID ? { measurementId: MEASUREMENT_ID } : {}),
} as const;
