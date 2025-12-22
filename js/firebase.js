// Import the functions you need from Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

// Your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyANF6E8bCMGzsSE3-I98kFb96svS5iz3P4",
  authDomain: "real-estate-crm-8888.firebaseapp.com",
  projectId: "real-estate-crm-8888",
  storageBucket: "real-estate-crm-8888.firebasestorage.app",
  messagingSenderId: "614281380702",
  appId: "1:614281380702:web:619a7eec7d888f0e4005cf"
};

// Initialize Firebase app
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
const auth = getAuth(app);
const db = getFirestore(app);

// Export for use in other scripts
export { auth, db };
