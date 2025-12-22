// js/auth.js

import { auth, db } from "./firebase.js";
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

// ---------------------------
// SIGNUP WITH FIRESTORE WHITELIST CHECK
// ---------------------------
const signupForm = document.getElementById("signup-form");

if (signupForm) {
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = signupForm.email.value.trim().toLowerCase();
    const password = signupForm.password.value;

    try {
      // 1️⃣ Check if email exists in Firestore users collection
      const userDocRef = doc(db, "users", email);
      const userSnapshot = await getDoc(userDocRef);

      if (!userSnapshot.exists()) {
        alert("Signup blocked! This email is not approved by admin.");
        return;
      }

      // 2️⃣ If approved → Allow Firebase Auth signup
      await createUserWithEmailAndPassword(auth, email, password);

      alert("Signup successful! Please log in.");
      window.location.href = "index.html";

    } catch (error) {
      console.error("Signup error:", error);
      alert(error.message);
    }
  });
}

// ---------------------------
// LOGIN (unchanged)
// ---------------------------
const loginForm = document.getElementById("login-form");

if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = loginForm.email.value;
    const password = loginForm.password.value;

    try {
      await signInWithEmailAndPassword(auth, email, password);
      console.log("Login successful! Redirecting...");
      window.location.href = "leads.html";
    } catch (error) {
      alert(error.message);
    }
  });
}
