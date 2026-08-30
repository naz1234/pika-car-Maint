const STORAGE_KEY = "pika-car-maint-v1";
const SYNC_TIME_KEY = "pika-car-maint-sync-time";
const SYNC_API = "/api/state";
const DAY = 86400000;

const defaultItems = [
  { id: "engine-oil", name: "Engine oil", category: "Engine", icon: "🛢️", intervalKm: 10000, intervalMonths: 6, lastKm: null, lastDate: null },
  { id: "oil-filter", name: "Oil filter", category: "Engine", icon: "⚙️", intervalKm: 10000, intervalMonths: 6, lastKm: null, lastDate: null },
  { id: "tyre-pressure", name: "Tyre pressure", category: "Tyres", icon: "🛞", intervalKm: 0, intervalMonths: 1, lastKm: null, lastDate: null },
  { id: "tyre-rotation", name: "Tyre rotation", category: "Tyres", icon: "🔄", intervalKm: 10000, intervalMonths: 6, lastKm: null, lastDate: null },
  { id: "brake-check", name: "Brake inspection", category: "Brakes", icon: "🛑", intervalKm: 20000, intervalMonths: 12, lastKm: null, lastDate: null },
  { id: "coolant", name: "Coolant", category: "Fluids", icon: "💧", intervalKm: 40000, intervalMonths: 24, lastKm: null, lastDate: null },
  { id: "battery", name: "Battery check", category: "Electrical", icon: "🔋", intervalKm: 0, intervalMonths: 12, lastKm: null, lastDate: null },
  { id: "air-filter", name: "Air filter", category: "Engine", icon: "🌬️", intervalKm: 20000, intervalMonths: 12, lastKm: null, lastDate: null },
  { id: "wipers", name: "Wiper blades", category: "Exterior", icon: "🌧️", intervalKm: 0, intervalMonths: 12, lastKm: null, lastDate: null }
];

const initialState = {
  vehicle: { name: "My Car", model: "", plate: "", odometer: 0 },
  items: defaultItems,
  history: []
};

let state = loadState();
let activeFilter = "all";
let deferredInstall;
let lastUpdatedAt = Number(localStorage.getItem(SYNC_TIME_KEY)) || 0;
let syncTimer;
let syncInFlight = false;

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return structuredClone(initialState);
    return {
      vehicle: { ...initialState.vehicle, ...(saved.vehicle || {}) },
      items: Array.isArray(saved.items) ? saved.items : structuredClone(defaultItems),
      history: Array.isArray(saved.history) ? saved.history : []
    };
  } catch {
    return structuredClone(initialState);
  }
}

function saveState(message) {
  lastUpdatedAt = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  localStorage.setItem(SYNC_TIME_KEY, String(lastUpdatedAt));
  if (message) showToast(message);
  render();
  scheduleCloudSave();
}

function saveLocalCopy() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  localStorage.setItem(SYNC_TIME_KEY, String(lastUpdatedAt));
}

function scheduleCloudSave() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(pushCloudState, 650);
}

async function pushCloudState() {
  if (!navigator.onLine || syncInFlight) return;
  syncInFlight = true;
  try {
    const response = await fetch(SYNC_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state, updatedAt: lastUpdatedAt })
    });
    const result = await response.json().catch(() => ({}));
    if (response.status === 409 && result.state) {
      applyRemoteState(result);
    } else if (!response.ok) {
      throw new Error(result.error || "Sync unavailable");
    } else if (result.updatedAt) {
      lastUpdatedAt = Number(result.updatedAt);
      saveLocalCopy();
    }
  } catch {
    // The local copy remains safe and will retry when the app reconnects.
  } finally {
    syncInFlight = false;
  }
}

async function pullCloudState() {
  if (!navigator.onLine || syncInFlight) return;
  syncInFlight = true;
  try {
    const response = await fetch(SYNC_API, { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!response.ok) throw new Error("Sync unavailable");
    const result = await response.json();
    if (result.state && Number(result.updatedAt) > lastUpdatedAt) {
      applyRemoteState(result);
    } else if (!result.state || lastUpdatedAt > Number(result.updatedAt || 0)) {
      syncInFlight = false;
      await pushCloudState();
      return;
    }
  } catch {
    // Work offline without interrupting the user.
  } finally {
    syncInFlight = false;
  }
}

function applyRemoteState(result) {
  const remote = result.state;
  if (!remote?.vehicle || !Array.isArray(remote.items) || !Array.isArray(remote.history)) return;
  state = {
    vehicle: { ...initialState.vehicle, ...remote.vehicle },
    items: remote.items,
    history: remote.history
  };
  lastUpdatedAt = Number(result.updatedAt) || Date.now();
  saveLocalCopy();
  render();
}

function addMonths(dateString, months) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setMonth(date.getMonth() + Number(months));
  return date;
}

function itemStatus(item) {
  if (item.lastKm == null && !item.lastDate) {
    return { key: "untracked", label: "Not set", detail: "Add your latest service record", score: 3 };
  }

  const odometer = Number(state.vehicle.odometer) || 0;
  const kmLeft = item.intervalKm && item.lastKm != null ? item.lastKm + Number(item.intervalKm) - odometer : null;
  const dueDate = item.intervalMonths && item.lastDate ? addMonths(item.lastDate, item.intervalMonths) : null;
  const daysLeft = dueDate ? Math.ceil((dueDate - new Date()) / DAY) : null;
  const overdue = (kmLeft != null && kmLeft <= 0) || (daysLeft != null && daysLeft <= 0);
  const soon = (kmLeft != null && kmLeft <= Math.max(1000, item.intervalKm * .1)) || (daysLeft != null && daysLeft <= 30);

  let detail = "Up to date";
  const parts = [];
  if (kmLeft != null) parts.push(kmLeft <= 0 ? `${formatNumber(Math.abs(kmLeft))} km overdue` : `${formatNumber(kmLeft)} km left`);
  if (daysLeft != null) parts.push(daysLeft <= 0 ? `${Math.abs(daysLeft)} days overdue` : `${daysLeft} days left`);
  if (parts.length) detail = parts.join(" · ");

  if (overdue) return { key: "overdue", label: "Overdue", detail, score: 0 };
  if (soon) return { key: "soon", label: "Due soon", detail, score: 1 };
  return { key: "good", label: "Good", detail, score: 2 };
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function formatDate(date) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${date}T12:00:00`));
}

function iconFor(category) {
  return ({ Engine: "⚙️", Tyres: "🛞", Brakes: "🛑", Fluids: "💧", Electrical: "🔋", Exterior: "✨", Other: "🔧" })[category] || "🔧";
}

function maintenanceMarkup(item) {
  const status = itemStatus(item);
  return `
    <article class="maintenance-item">
      <span class="maintenance-icon" aria-hidden="true">${item.icon || iconFor(item.category)}</span>
      <div class="maintenance-copy">
        <strong>${escapeHtml(item.name)}</strong>
        <span>${escapeHtml(status.detail)}</span>
      </div>
      <div class="maintenance-actions">
        <span class="status-pill ${status.key}">${status.label}</span>
        <button class="done-button" type="button" data-complete="${item.id}">Update</button>
      </div>
    </article>`;
}

function render() {
  const statuses = state.items.map(itemStatus);
  const attention = statuses.filter(status => status.key === "overdue" || status.key === "soon").length;
  const good = statuses.filter(status => status.key === "good").length;
  const now = new Date();
  const monthSpend = state.history.filter(record => {
    const date = new Date(`${record.date}T12:00:00`);
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  }).reduce((sum, record) => sum + Number(record.cost || 0), 0);

  $("#vehicleName").textContent = state.vehicle.name || "My Car";
  $("#vehicleMeta").textContent = [state.vehicle.model, state.vehicle.plate].filter(Boolean).join(" · ") || "Tap to add vehicle details";
  $("#currentMileage").textContent = formatNumber(state.vehicle.odometer);
  $("#dueCount").textContent = attention;
  $("#goodCount").textContent = good;
  $("#monthSpend").textContent = formatNumber(monthSpend);

  const priority = [...state.items].sort((a, b) => itemStatus(a).score - itemStatus(b).score).slice(0, 3);
  $("#priorityList").innerHTML = priority.length ? priority.map(maintenanceMarkup).join("") : emptyMarkup("No checklist items", "Add an item to start tracking maintenance.");

  const filtered = state.items.filter(item => {
    const key = itemStatus(item).key;
    if (activeFilter === "all") return true;
    if (activeFilter === "attention") return key === "overdue" || key === "soon";
    return key === activeFilter;
  });
  $("#checklistList").innerHTML = filtered.length ? filtered.map(maintenanceMarkup).join("") : emptyMarkup("Nothing here", "Try another filter or add a maintenance item.");

  const total = state.history.reduce((sum, record) => sum + Number(record.cost || 0), 0);
  $("#totalSpend").textContent = formatMoney(total);
  $("#serviceCount").textContent = `${state.history.length} service record${state.history.length === 1 ? "" : "s"}`;
  $("#historyList").innerHTML = state.history.length ? [...state.history].sort((a, b) => b.date.localeCompare(a.date)).map(historyMarkup).join("") : emptyMarkup("No history yet", "Completed maintenance will appear here.");

  syncVehicleForms();
}

function historyMarkup(record) {
  return `<article class="history-item">
    <div><strong>${escapeHtml(record.name)}</strong><span class="history-meta">${formatDate(record.date)} · ${formatNumber(record.mileage)} km</span></div>
    <span class="history-cost">﷼ ${formatMoney(record.cost)}</span>
    ${record.notes ? `<p>${escapeHtml(record.notes)}</p>` : ""}
  </article>`;
}

function emptyMarkup(title, copy) {
  return `<div class="empty-state"><strong>${title}</strong><span>${copy}</span></div>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function goTo(view) {
  $$(".view").forEach(section => section.classList.toggle("active", section.dataset.view === view));
  $$(".nav-button").forEach(button => button.classList.toggle("active", button.dataset.go === view));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openModal(modal) {
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  setTimeout(() => $("input:not([type='hidden'])", modal)?.focus(), 50);
}

function closeModals() {
  $$(".modal.open").forEach(modal => {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  });
  document.body.style.overflow = "";
}

function openService(itemId) {
  const item = state.items.find(entry => entry.id === itemId);
  if (!item) return;
  const form = $("#serviceForm");
  $("#serviceTitle").textContent = item.name;
  form.elements.itemId.value = item.id;
  form.elements.date.value = new Date().toISOString().slice(0, 10);
  form.elements.mileage.value = state.vehicle.odometer || item.lastKm || 0;
  form.elements.cost.value = "";
  form.elements.notes.value = "";
  openModal($("#serviceModal"));
}

function syncVehicleForms() {
  const form = $("#vehicleFormPage");
  form.elements.name.value = state.vehicle.name || "";
  form.elements.model.value = state.vehicle.model || "";
  form.elements.plate.value = state.vehicle.plate || "";
  form.elements.odometer.value = state.vehicle.odometer || 0;
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2200);
}

document.addEventListener("click", event => {
  const goButton = event.target.closest("[data-go]");
  if (goButton) goTo(goButton.dataset.go);

  const complete = event.target.closest("[data-complete]");
  if (complete) openService(complete.dataset.complete);

  const filter = event.target.closest("[data-filter]");
  if (filter) {
    activeFilter = filter.dataset.filter;
    $$(".filter-chip").forEach(button => button.classList.toggle("active", button === filter));
    render();
  }

  if (event.target.closest("[data-close]")) closeModals();
});

$("#openVehicle").addEventListener("click", () => goTo("car"));
$("#openAddItem").addEventListener("click", () => {
  $("#itemForm").reset();
  openModal($("#itemModal"));
});

$("#serviceForm").addEventListener("submit", event => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const item = state.items.find(entry => entry.id === data.get("itemId"));
  if (!item) return;
  const mileage = Math.max(0, Number(data.get("mileage")) || 0);
  item.lastDate = data.get("date");
  item.lastKm = mileage;
  state.vehicle.odometer = Math.max(Number(state.vehicle.odometer) || 0, mileage);
  state.history.push({ id: crypto.randomUUID?.() || `${Date.now()}`, itemId: item.id, name: item.name, date: item.lastDate, mileage, cost: Math.max(0, Number(data.get("cost")) || 0), notes: String(data.get("notes") || "").trim() });
  closeModals();
  saveState(`${item.name} updated`);
});

$("#itemForm").addEventListener("submit", event => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const name = String(data.get("name") || "").trim();
  if (!name) return;
  const category = data.get("category");
  state.items.push({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, name, category, icon: iconFor(category), intervalKm: Math.max(0, Number(data.get("intervalKm")) || 0), intervalMonths: Math.max(0, Number(data.get("intervalMonths")) || 0), lastKm: null, lastDate: null });
  closeModals();
  saveState(`${name} added`);
});

$("#vehicleFormPage").addEventListener("submit", event => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  state.vehicle = { name: String(data.get("name") || "My Car").trim(), model: String(data.get("model") || "").trim(), plate: String(data.get("plate") || "").trim().toUpperCase(), odometer: Math.max(0, Number(data.get("odometer")) || 0) };
  saveState("Car details saved");
});

$("#exportData").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `pika-car-maint-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
});

$("#importData").addEventListener("change", async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    if (!imported.vehicle || !Array.isArray(imported.items) || !Array.isArray(imported.history)) throw new Error("Invalid backup");
    state = imported;
    saveState("Backup imported");
  } catch {
    showToast("That backup file is not valid");
  }
  event.target.value = "";
});

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  deferredInstall = event;
  $("#installButton").hidden = false;
});

$("#installButton").addEventListener("click", async () => {
  if (!deferredInstall) return;
  deferredInstall.prompt();
  await deferredInstall.userChoice;
  deferredInstall = null;
  $("#installButton").hidden = true;
});

if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js"));

window.addEventListener("online", pullCloudState);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") pullCloudState();
});
setInterval(() => {
  if (document.visibilityState === "visible") pullCloudState();
}, 15000);

render();
pullCloudState();
