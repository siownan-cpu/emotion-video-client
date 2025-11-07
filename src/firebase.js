// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAqlUkKNE80gKNrAZahWwdpcD2Rjz0hvDU",
  authDomain: "emotion-video-call.firebaseapp.com",
  projectId: "emotion-video-call",
  storageBucket: "emotion-video-call.firebasestorage.app",
  messagingSenderId: "562036327503",
  appId: "1:562036327503:web:acb5033a29e39e96ee963a",
  measurementId: "G-VSZ1N16FJN"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
