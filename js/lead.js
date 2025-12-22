import { auth, db } from "./firebase.js";
import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

/* =====================
   DOM
===================== */
const form = document.getElementById("lead-form");
const deleteBtn = document.getElementById("delete-btn");

const assignedToSelect = document.getElementById("assignedToSelect");
const assignedToDisplay = document.getElementById("assignedToDisplay");

const leadColorSelect = document.getElementById("lead_color"); // ✅ NEW

/* =====================
   STATE
===================== */
let leadId = new URLSearchParams(window.location.search).get("id");
let currentUserEmail = null;
let isAdmin = false;
let salesUsers = [];
let assignedToEmail = "";
let currentLeadColor = "white"; // ✅ NEW (system default)

/* =====================
   ROLE
===================== */
async function getUserRole(email) {
  const q = query(collection(db, "users"), where("email", "==", email));
  const snap = await getDocs(q);
  return snap.empty ? "sales" : snap.docs[0].data().role;
}

async function loadSalesUsers() {
  const snap = await getDocs(collection(db, "users"));
  salesUsers = [];
  snap.forEach(doc => {
    if (doc.data().role === "sales") {
      salesUsers.push(doc.data().email);
    }
  });
}

/* =====================
   AUTH
===================== */
onAuthStateChanged(auth, async (user) => {
  if (!user) return window.location.href = "index.html";

  currentUserEmail = user.email;
  isAdmin = (await getUserRole(currentUserEmail)) === "admin";

  if (isAdmin) await loadSalesUsers();

  await loadLead();
  setupPermissions();
});

/* =====================
   LOAD LEAD
===================== */
async function loadLead() {
  const ref = doc(db, "leads", leadId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    alert("Lead not found");
    return window.location.href = "leads.html";
  }

  const d = snap.data();

  document.getElementById("name").value = d.name || "";
  document.getElementById("phone").value = d.phone || "";
  document.getElementById("email").value = d.email || "";
  document.getElementById("pincode").value = d.pincode || "";

  document.getElementById("date_of_calling").value = d.date_of_calling || "";
  document.getElementById("followup1").value = d.followup1 || "";
  document.getElementById("followup2").value = d.followup2 || "";
  document.getElementById("followup3").value = d.followup3 || "";

  if (Array.isArray(d.assigned_to)) {
    assignedToEmail = d.assigned_to[0] || "";
  }

  // ✅ LOAD LEAD COLOR
  currentLeadColor = d.lead_color || "white";

  // If not white, preselect dropdown
  if (currentLeadColor !== "white" && leadColorSelect) {
    leadColorSelect.value = currentLeadColor;
  }
}

/* =====================
   PERMISSIONS
===================== */
function setupPermissions() {
  if (isAdmin) {
    deleteBtn.style.display = "inline-block";
    assignedToSelect.style.display = "block";
    assignedToDisplay.style.display = "none";

    assignedToSelect.innerHTML = "";
    salesUsers.forEach(email => {
      const opt = document.createElement("option");
      opt.value = email;
      opt.textContent = email;
      assignedToSelect.appendChild(opt);
    });
    assignedToSelect.value = assignedToEmail;

  } else {
    deleteBtn.style.display = "none";
    assignedToSelect.style.display = "none";
    assignedToDisplay.style.display = "block";
    assignedToDisplay.textContent = assignedToEmail || "(unassigned)";
  }
}

/* =====================
   SAVE
===================== */
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const updateData = {
    date_of_calling: document.getElementById("date_of_calling").value.trim(),
    followup1: document.getElementById("followup1").value.trim(),
    followup2: document.getElementById("followup2").value.trim(),
    followup3: document.getElementById("followup3").value.trim(),
    updatedAt: serverTimestamp()
  };

  if (isAdmin) {
    updateData.assigned_to = assignedToSelect.value
      ? [assignedToSelect.value]
      : [];
  }

  // ✅ SAVE LEAD COLOR ONLY IF USER SELECTED ONE
  const selectedColor = leadColorSelect?.value;
  if (selectedColor) {
    updateData.lead_color = selectedColor;
  }

  await updateDoc(doc(db, "leads", leadId), updateData);

  alert("Lead updated");
  window.location.href = "leads.html";
});

/* =====================
   DELETE (ADMIN ONLY)
===================== */
deleteBtn.addEventListener("click", async () => {
  if (!confirm("Delete this lead?")) return;
  await deleteDoc(doc(db, "leads", leadId));
  window.location.href = "leads.html";
});

if (!leadId) {
  alert("Invalid lead URL");
  window.location.href = "leads.html";
}

if (!isAdmin) {
  deleteBtn.disabled = true;
}
