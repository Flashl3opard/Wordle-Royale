// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCTl-wMLZKTSR6hH9VgFZjfHEWDTGrHNec",
  authDomain: "street-eye-9d77e.firebaseapp.com",
  databaseURL: "https://street-eye-9d77e-default-rtdb.firebaseio.com",
  projectId: "street-eye-9d77e",
  storageBucket: "street-eye-9d77e.firebasestorage.app",
  messagingSenderId: "855251119499",
  appId: "1:855251119499:web:43722cc323e65f1be8938e",
  measurementId: "G-R261GDSD3R"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);