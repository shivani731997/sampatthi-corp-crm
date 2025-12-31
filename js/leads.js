import { auth, db } from "./firebase.js";
import {
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  collection,
  query,
  orderBy,
  getDocs,
  where,
  writeBatch,
  doc,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

/* =======================
   DOM ELEMENTS
======================= */
const logoutBtn = document.getElementById("logout-btn");
const tbody = document.getElementById("leadsTableBody");
const tableHead = document.querySelector("#leadsTable thead");

const filterForm = document.getElementById("filter-form");
const filterStatus = document.getElementById("filterStatus");
const clearFilterBtn = document.getElementById("clearFilterBtn");

const filterAssignedToContainer = document.getElementById("filterAssignedToContainer");
const filterAssignedTo = document.getElementById("filterAssignedTo");
const filterColor = document.getElementById("filterColor");

/* BULK ASSIGN */
const bulkAssignBar = document.getElementById("bulkAssignBar");
const bulkAssignUser = document.getElementById("bulkAssignUser");
const bulkAssignBtn = document.getElementById("bulkAssignBtn");

/* =======================
   STATE
======================= */
let userEmail = null;
let isAdmin = false;

let allLeads = [];
let filteredLeads = [];

let selectedLeadIds = new Set();

let activeFilters = {
  callTrack: null,
  assignedTo: null,
  color: null,
};

/* =======================
   HELPERS
======================= */
function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function getCallTrack(lead) {
  if (hasText(lead.followup3)) return "followup3";
  if (hasText(lead.followup2)) return "followup2";
  if (hasText(lead.followup1)) return "followup1";
  return null;
}

function formatDateCreated(value) {
  if (!value) return "";
  try {
    const d = new Date(value);
    if (!isNaN(d)) {
      return d.toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      });
    }
  } catch {}
  return value;
}

/* ✅ PURCHASE AMOUNT FORMATTER */
function formatPurchaseAmount(value) {
  switch (value) {
    case "1_full": return "1 Full Unit";
    case "2_full": return "2 Full Units";
    case "3_full": return "3 Full Units";
    case "4_full": return "4 Full Units";
    case "frac_1_5": return "Fractional Ownership 1/5";
    case "frac_2_5": return "Fractional Ownership 2/5";
    case "frac_3_5": return "Fractional Ownership 3/5";
    case "frac_4_5": return "Fractional Ownership 4/5";
    default: return "–";
  }
}

/* =======================
   PINCODE → CITY
======================= */
const cityCache = {};

function extractPincode(raw) {
  if (!raw) return "";
  const match = raw.toString().match(/\d{6}/);
  return match ? match[0] : "";
}

async function resolveCityFromPincode(pin) {
  if (!pin) return "—";
  if (cityCache[pin]) return cityCache[pin];

  try {
    const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`);
    const data = await res.json();
    if (Array.isArray(data) && data[0]?.PostOffice?.length) {
      const city =
        data[0].PostOffice[0].District ||
        data[0].PostOffice[0].Name;
      cityCache[pin] = city;
      return city;
    }
  } catch {}

  cityCache[pin] = "—";
  return "—";
}

/* =======================
   ROLE HELPERS
======================= */
async function getUserRole(email) {
  const q = query(collection(db, "users"), where("email", "==", email));
  const snap = await getDocs(q);
  return snap.empty ? "sales" : snap.docs[0].data().role;
}

async function fetchSalesUsers() {
  const q = query(collection(db, "users"), where("role", "==", "sales"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => d.data().email).filter(Boolean);
}

/* =======================
   TABLE HEADER
======================= */
function renderTableHeader() {
  if (isAdmin) {
    tableHead.innerHTML = `
      <tr>
        <th><input type="checkbox" id="selectAllLeads"></th>
        <th>Priority</th>
        <th>Name</th>
        <th>Phone</th>
        <th>PURCHASE AMOUNT</th>
        <th>Assigned To</th>
        <th>Date Created</th>
        <th>Date of calling & feedback</th>
        <th>Follow up 1</th>
        <th>Follow up 2</th>
        <th>Follow up 3</th>
      </tr>
    `;
  } else {
    tableHead.innerHTML = `
      <tr>
        <th>Priority</th>
        <th>Name</th>
        <th>Phone</th>
        <th>PURCHASE AMOUNT</th>
        <th>City</th>
        <th>Date Created</th>
        <th>Date of calling & feedback</th>
        <th>Follow up 1</th>
        <th>Follow up 2</th>
        <th>Follow up 3</th>
      </tr>
    `;
  }
}

/* =======================
   AUTH
======================= */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  userEmail = user.email;
  isAdmin = (await getUserRole(userEmail)) === "admin";

  renderTableHeader();

  if (isAdmin) {
    filterAssignedToContainer.style.display = "block";
    const salesUsers = await fetchSalesUsers();

    filterAssignedTo.innerHTML =
      `<option value="">All</option>` +
      salesUsers.map(e => `<option value="${e}">${e}</option>`).join("");

    bulkAssignUser.innerHTML =
      `<option value="">Select sales user</option>` +
      salesUsers.map(e => `<option value="${e}">${e}</option>`).join("");
  } else {
    filterAssignedToContainer.style.display = "none";
  }

  await loadAllLeads();
  applyFilters();
});

/* =======================
   DATA LOADING (NO PAGINATION)
======================= */
async function loadAllLeads() {
  let constraints = [];

  if (!isAdmin) {
    constraints.push(where("assigned_to", "array-contains", userEmail));
  }

  constraints.push(orderBy("date_time", "desc"));

  const q = query(collection(db, "leads"), ...constraints);
  const snapshot = await getDocs(q);

  allLeads = snapshot.docs.map(docSnap => ({
    id: docSnap.id,
    ...docSnap.data()
  }));
}

/* =======================
   FILTERING
======================= */
function applyFilters() {
  activeFilters.callTrack = filterStatus.value || null;
  activeFilters.assignedTo =
    isAdmin && filterAssignedTo.value ? filterAssignedTo.value : null;
  activeFilters.color = filterColor.value || null;

  filteredLeads = allLeads.filter(lead => {
    if (activeFilters.callTrack) {
      if (getCallTrack(lead) !== activeFilters.callTrack) return false;
    }

    if (activeFilters.color) {
      if ((lead.lead_color || "white") !== activeFilters.color) return false;
    }

    if (activeFilters.assignedTo) {
      if (!Array.isArray(lead.assigned_to) ||
          !lead.assigned_to.includes(activeFilters.assignedTo)) {
        return false;
      }
    }

    return true;
  });

  renderLeads(filteredLeads);
}

/* =======================
   UI
======================= */
function renderColorSwatch(color = "white") {
  return `<span class="color-swatch ${color}"></span>`;
}

/* =======================
   ROW RENDERING
======================= */
function renderLeads(leads) {
  tbody.innerHTML = "";

  if (!leads.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="11" style="text-align:center; padding:20px;">
          No leads found.
        </td>
      </tr>
    `;
    return;
  }

  leads.forEach(lead => {
    const pin = extractPincode(lead.pincode);
    const color = lead.lead_color || "white";
    const purchaseAmount = formatPurchaseAmount(lead.purchase_amount);

    if (isAdmin) {
      tbody.innerHTML += `
        <tr>
          <td><input type="checkbox" class="lead-checkbox" data-id="${lead.id}"></td>
          <td onclick="window.location.href='lead.html?id=${lead.id}'">${renderColorSwatch(color)}</td>
          <td onclick="window.location.href='lead.html?id=${lead.id}'">${lead.name || ""}</td>
          <td><a href="tel:${lead.phone || ""}">${lead.phone || ""}</a></td>
          <td>${purchaseAmount}</td>
          <td>${Array.isArray(lead.assigned_to) ? lead.assigned_to.join(", ") : ""}</td>
          <td>${formatDateCreated(lead.date_time)}</td>
          <td>${lead.date_of_calling || ""}</td>
          <td>${lead.followup1 || ""}</td>
          <td>${lead.followup2 || ""}</td>
          <td>${lead.followup3 || ""}</td>
        </tr>
      `;
      return;
    }

    const row = document.createElement("tr");
    row.onclick = () => window.location.href = `lead.html?id=${lead.id}`;
    row.innerHTML = `
      <td>${renderColorSwatch(color)}</td>
      <td>${lead.name || ""}</td>
      <td><a href="tel:${lead.phone || ""}">${lead.phone || ""}</a></td>
      <td>${purchaseAmount}</td>
      <td class="city-cell">Loading…</td>
      <td>${formatDateCreated(lead.date_time)}</td>
      <td>${lead.date_of_calling || ""}</td>
      <td>${lead.followup1 || ""}</td>
      <td>${lead.followup2 || ""}</td>
      <td>${lead.followup3 || ""}</td>
    `;
    tbody.appendChild(row);

    resolveCityFromPincode(pin).then(city => {
      row.querySelector(".city-cell").textContent = city;
    });
  });
}

/* =======================
   BULK SELECT / ASSIGN
======================= */
tbody.addEventListener("change", (e) => {
  if (!e.target.classList.contains("lead-checkbox")) return;
  const id = e.target.dataset.id;
  e.target.checked ? selectedLeadIds.add(id) : selectedLeadIds.delete(id);
  bulkAssignBar.style.display = selectedLeadIds.size ? "block" : "none";
});

tableHead.addEventListener("change", (e) => {
  if (e.target.id !== "selectAllLeads") return;
  document.querySelectorAll(".lead-checkbox").forEach(cb => {
    cb.checked = e.target.checked;
    e.target.checked
      ? selectedLeadIds.add(cb.dataset.id)
      : selectedLeadIds.delete(cb.dataset.id);
  });
  bulkAssignBar.style.display = selectedLeadIds.size ? "block" : "none";
});

bulkAssignBtn?.addEventListener("click", async () => {
  const user = bulkAssignUser.value;
  if (!user || !selectedLeadIds.size) return;

  if (!confirm(`Assign ${selectedLeadIds.size} leads to ${user}?`)) return;

  const batch = writeBatch(db);
  selectedLeadIds.forEach(id => {
    batch.update(doc(db, "leads", id), {
      assigned_to: [user],
      updated_at: new Date()
    });
  });

  await batch.commit();
  await loadAllLeads();
  applyFilters();
});

/* =======================
   EVENTS
======================= */
filterForm.addEventListener("submit", e => {
  e.preventDefault();
  applyFilters();
});

clearFilterBtn.addEventListener("click", () => {
  filterStatus.value = "";
  if (isAdmin) filterAssignedTo.value = "";
  filterColor.value = "";
  applyFilters();
});

logoutBtn.addEventListener("click", () => {
  signOut(auth).then(() => window.location.href = "index.html");
});

