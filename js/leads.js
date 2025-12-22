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
  limit,
  startAfter,
  where,
  getCountFromServer,
  writeBatch,
  doc,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

/* =======================
   DOM ELEMENTS
======================= */
const logoutBtn = document.getElementById("logout-btn");
const tbody = document.getElementById("leadsTableBody");
const paginationContainer = document.getElementById("pagination");
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
const PAGE_SIZE = 20;

let userEmail = null;
let isAdmin = false;
let totalLeads = 0;
let totalPages = 0;

const pageCursors = [null];
let currentPage = 1;

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
  return typeof value === "string" && value.replace(/\s+/g, "").length > 0;
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
        <th>Phone Number</th>
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
        <th>Phone Number</th>
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

  await applyFiltersAndLoad();
});

/* =======================
   FILTER + PAGINATION
======================= */
async function applyFiltersAndLoad() {
  selectedLeadIds.clear();
  bulkAssignBar.style.display = "none";

  pageCursors.length = 0;
  pageCursors.push(null);
  currentPage = 1;

  activeFilters.callTrack = filterStatus.value || null;
  activeFilters.assignedTo =
    isAdmin && filterAssignedTo.value ? filterAssignedTo.value : null;
  activeFilters.color = filterColor?.value || null;

  totalLeads = await fetchTotalLeadsCount(activeFilters);
  totalPages = Math.ceil(totalLeads / PAGE_SIZE);

  if (totalLeads === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align:center; padding:20px;">
          No leads found.
        </td>
      </tr>
    `;
    paginationContainer.innerHTML = "";
    return;
  }

  renderPagination();
  await loadPage(1, activeFilters);
}

async function fetchTotalLeadsCount(filters) {
  try {
    let constraints = [];

    if (!isAdmin) {
      constraints.push(where("assigned_to", "array-contains", userEmail));
    }

    if (isAdmin && filters?.assignedTo) {
      constraints.push(where("assigned_to", "array-contains", filters.assignedTo));
    }

    const q = query(collection(db, "leads"), ...constraints);
    const snap = await getCountFromServer(q);
    return snap.data().count;
  } catch {
    return 0;
  }
}

async function loadPage(pageNum, filters) {
  if (pageNum < 1 || pageNum > totalPages) return;

  currentPage = pageNum;
  let constraints = [];

  if (!isAdmin) {
    constraints.push(where("assigned_to", "array-contains", userEmail));
  }

  if (isAdmin && filters?.assignedTo) {
    constraints.push(where("assigned_to", "array-contains", filters.assignedTo));
  }

  constraints.push(orderBy("date_time", "desc"));
  constraints.push(limit(PAGE_SIZE));

  let q = query(collection(db, "leads"), ...constraints);

  if (pageNum > 1 && pageCursors[pageNum - 1]) {
    q = query(q, startAfter(pageCursors[pageNum - 1]));
  }

  const snapshot = await getDocs(q);
  pageCursors[pageNum] = snapshot.docs[snapshot.docs.length - 1] || null;

  renderLeads(snapshot);
  renderPagination();
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
function renderLeads(snapshot) {
  tbody.innerHTML = "";

  snapshot.forEach((docSnap) => {
    const lead = docSnap.data();
    const pin = extractPincode(lead.pincode);
    const color = lead.lead_color || "white";

    const callTrack = getCallTrack(lead);
    if (activeFilters.callTrack && callTrack !== activeFilters.callTrack) return;
    if (activeFilters.color && color !== activeFilters.color) return;

    if (isAdmin) {
      tbody.innerHTML += `
        <tr>
          <td><input type="checkbox" class="lead-checkbox" data-id="${docSnap.id}"></td>
          <td onclick="window.location.href='lead.html?id=${docSnap.id}'">${renderColorSwatch(color)}</td>
          <td onclick="window.location.href='lead.html?id=${docSnap.id}'">${lead.name || ""}</td>
          <td><a href="tel:${lead.phone || ""}">${lead.phone || ""}</a></td>
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
    row.onclick = () => window.location.href = `lead.html?id=${docSnap.id}`;
    row.innerHTML = `
      <td>${renderColorSwatch(color)}</td>
      <td>${lead.name || ""}</td>
      <td><a href="tel:${lead.phone || ""}">${lead.phone || ""}</a></td>
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
  await applyFiltersAndLoad();
});

/* =======================
   PAGINATION UI
======================= */
function renderPagination() {
  paginationContainer.innerHTML = "";
  if (totalPages <= 1) return;

  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement("button");
    btn.textContent = i;
    btn.disabled = i === currentPage;
    btn.onclick = () => loadPage(i, activeFilters);
    paginationContainer.appendChild(btn);
  }
}

/* =======================
   EVENTS
======================= */
filterForm?.addEventListener("submit", e => {
  e.preventDefault();
  applyFiltersAndLoad();
});

clearFilterBtn?.addEventListener("click", () => {
  filterStatus.value = "";
  if (isAdmin) filterAssignedTo.value = "";
  filterColor.value = "";
  applyFiltersAndLoad();
});

logoutBtn?.addEventListener("click", () => {
  signOut(auth).then(() => window.location.href = "index.html");
});
