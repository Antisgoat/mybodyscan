// Firebase core SDKs
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Your Firebase project configuration
const firebaseConfig = {
  apiKey: "AIzaSyDA90cwKTCQ9tGfUx66PDmfGwUoiTbhafE",
  authDomain: "mybodyscan-f3daf.firebaseapp.com",
  projectId: "mybodyscan-f3daf",
  storageBucket: "mybodyscan-f3daf.appspot.com", // fixed to correct format
  messagingSenderId: "157018993008",
  appId: "1:157018993008:web:8bed67e098ca04dc4b1fb5",
  measurementId: "G-TV8M3PY1X3"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export initialized services for use in the app
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
