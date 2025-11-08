// Firebase Configuration with Fallback Values
// This ensures Firebase initializes even if .env is missing

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAnalytics } from "firebase/analytics";

// Firebase configuration with environment variables and fallback
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAqlUkKNE80gKNrAZahWwdpcD2Rjz0hvDU",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "emotion-video-call.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "emotion-video-call",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "emotion-video-call.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "562036327503",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:562036327503:web:acb5033a29e39e96ee963a",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-VSZ1N16FJN"
};

// Debug logging (you can remove this after it works)
console.log('🔧 Firebase Initialization Check:');
console.log('  - Project ID:', firebaseConfig.projectId);
console.log('  - Using .env?', !!import.meta.env.VITE_FIREBASE_PROJECT_ID);

// Validate config before initializing
if (!firebaseConfig.projectId) {
  throw new Error('Firebase projectId is missing! Check your .env file.');
}

// Initialize Firebase
let app;
try {
  app = initializeApp(firebaseConfig);
  console.log('✅ Firebase initialized successfully');
} catch (error) {
  console.error('❌ Firebase initialization failed:', error);
  throw error;
}

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Initialize Analytics (optional, only in production)
let analytics = null;
if (typeof window !== 'undefined' && firebaseConfig.measurementId) {
  try {
    analytics = getAnalytics(app);
    console.log('✅ Firebase Analytics initialized');
  } catch (error) {
    console.warn('⚠️ Analytics initialization failed (this is OK for development)');
  }
}
export { analytics };

export default app;
