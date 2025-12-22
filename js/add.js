import {
  writeBatch,
  doc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { auth, db } from "./firebase.js";
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

// --- Elements ---
const addLeadForm = document.getElementById("add-lead-form");
const submitBtn = addLeadForm.querySelector('button[type="submit"]');
const messageDiv = document.createElement("div");
addLeadForm.appendChild(messageDiv);

const bulkForm = document.getElementById("bulk-upload-form");
const bulkFileInput = document.getElementById("bulkFile");
const bulkMessage = document.getElementById("bulkUploadMessage");

const assignedToContainer = document.getElementById("assignedToContainer");

// Track current user info
let currentUserEmail = null;
let currentUserRole = null;
let salesUsers = []; // emails of sales users

// Fetch sales users for dropdown
async function fetchSalesUsers() {
  try {
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("role", "==", "sales"));
    const snapshot = await getDocs(q);

    salesUsers = snapshot.docs.map(doc => doc.data().email);

    // Populate assigned_to dropdown if admin
    if (currentUserRole === "admin" && assignedToContainer) {
      assignedToContainer.innerHTML = `
        <label for="assigned_to">Assigned To</label>
        <select id="assigned_to" name="assigned_to" required>
          <option value="">Select Sales User</option>
          ${salesUsers.map(email => `<option value="${email}">${email}</option>`).join("")}
        </select>
      `;
    }
  } catch (e) {
    console.error("Error fetching sales users:", e);
  }
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  currentUserEmail = user.email;

  try {
    const usersQuery = query(collection(db, "users"), where("email", "==", currentUserEmail));
    const usersSnapshot = await getDocs(usersQuery);

    if (!usersSnapshot.empty) {
      currentUserRole = usersSnapshot.docs[0].data().role;
    } else {
      currentUserRole = "sales"; // default role
    }
  } catch (error) {
    console.error("Error fetching user role:", error);
    currentUserRole = "sales";
  }

  // Show/hide bulk upload form
  if (bulkForm) {
    bulkForm.style.display = currentUserRole === "admin" ? "block" : "none";
  }

  // Show/hide assigned_to input
  if (assignedToContainer) {
    if (currentUserRole === "admin") {
      // For admin: show dropdown (populate sales users)
      await fetchSalesUsers();
      assignedToContainer.style.display = "block";
    } else {
      // For sales user: hide assigned_to completely
      assignedToContainer.style.display = "none";
    }
  }
});

// Submit handler
addLeadForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  messageDiv.textContent = "";
  submitBtn.disabled = true;

  // Fix: use correct input IDs
  const date_time = addLeadForm.date_time.value.trim();
  const name = addLeadForm.name.value.trim();
  const email = addLeadForm.email.value.trim();
  const phone = addLeadForm.phone.value.trim();
  const pincode = addLeadForm.pincode.value.trim();

  let assigned_to = [];
  if (currentUserRole === "admin") {
    // admin picks assigned_to from dropdown
    const assignedToSelect = document.getElementById("assigned_to");
    const assignedToInput = assignedToSelect ? assignedToSelect.value.trim() : "";
    assigned_to = assignedToInput ? [assignedToInput] : [];
  } else {
    // sales user auto assigned to self
    assigned_to = [currentUserEmail];
  }

  const status = addLeadForm.status.value;
  const notesInput = addLeadForm.notes.value.trim();
  const notes = notesInput ? notesInput.split(/\r?\n|,/) : [];

  try {
    await addDoc(collection(db, "leads"), {
      date_time,
      name,
      email,
      phone,
      pincode,
      assigned_to,
      status,
      notes,
      lead_color: "white", // ✅ system default, not user-controlled
      createdAt: serverTimestamp(),
    });

    messageDiv.style.color = "green";
    messageDiv.textContent = "Lead added successfully! Redirecting...";
    addLeadForm.reset();

    setTimeout(() => {
      window.location.href = "leads.html";
    }, 1500);
  } catch (error) {
    messageDiv.style.color = "red";
    messageDiv.textContent = "Error adding lead: " + error.message;
  } finally {
    submitBtn.disabled = false;
  }
});

// Bulk upload handler remains unchanged (admin only)
if (bulkForm) {
  bulkForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    bulkMessage.textContent = "";
    if (currentUserRole !== "admin") {
      bulkMessage.textContent = "You do not have permission to upload leads.";
      bulkMessage.style.color = "red";
      return;
    }

    const file = bulkFileInput.files[0];
    if (!file) {
      bulkMessage.textContent = "Please select a CSV file to upload.";
      bulkMessage.style.color = "red";
      return;
    }

    if (!file.name.endsWith(".csv")) {
      bulkMessage.textContent = "Only CSV files are supported.";
      bulkMessage.style.color = "red";
      return;
    }

    try {
      const text = await file.text();
      const leads = parseCSV(text);

      if (leads.length === 0) {
        bulkMessage.textContent = "No valid leads found in CSV.";
        bulkMessage.style.color = "red";
        return;
      }

      await batchUploadLeads(leads);

      bulkMessage.textContent = `Successfully uploaded ${leads.length} leads!`;
      bulkMessage.style.color = "green";
      bulkForm.reset();
    } catch (err) {
      bulkMessage.textContent = "Error uploading leads: " + err.message;
      bulkMessage.style.color = "red";
    }
  });
}

// CSV parser, toSnakeCase and batchUploadLeads unchanged
function parseCSV(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => toSnakeCase(h.trim()));

  const leads = [];

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(",");

    if (row.length !== headers.length) continue; // skip malformed row

    const lead = {};
    for (let j = 0; j < headers.length; j++) {
      lead[headers[j]] = row[j].trim();
    }

    // Basic validation
    if (!lead.name || !lead.email) continue;

    leads.push(lead);
  }
  return leads;
}

function toSnakeCase(str) {
  return str
    .replace(/\s+/g, "_")
    .replace(/[A-Z]/g, (letter) => "_" + letter.toLowerCase())
    .replace(/^_/, "")
    .toLowerCase();
}

async function batchUploadLeads(leads) {
  const batch = writeBatch(db);
  const leadsCollection = collection(db, "leads");

  leads.forEach((lead) => {
    const docRef = doc(leadsCollection); // new doc reference with auto ID
    lead.createdAt = serverTimestamp();
    lead.lead_color = "white"; // ✅ force system default for bulk uploads
    batch.set(docRef, lead);
  });

  await batch.commit();
}
