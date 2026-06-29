const STAGES = [
  { id: "new", label: "Новый лид" },
  { id: "qualified", label: "Квиз пройден" },
  { id: "demo_scheduled", label: "Демо назначено" },
  { id: "demo_done", label: "Демо проведено" },
  { id: "sold", label: "Продано" },
  { id: "lost", label: "Отказ" },
];

const PAIN_POINTS = ["Аллергия", "Шерсть животных", "Пыль и запахи", "Просто интересно"];
const HOUSING = ["Квартира", "Дом"];
const SCORE_META = {
  hot: { label: "Горячий", cls: "score-hot", icon: "🔥" },
  warm: { label: "Тёплый", cls: "score-warm", icon: "☀️" },
  cold: { label: "Холодный", cls: "score-cold", icon: "❄️" },
};

let leads = [];
let query = "";
let dragId = null;
let newLeadForm = { name: "", phone: "", city: "", source: "", pain: "", pets: false, housing: "", notes: "" };

async function fetchLeads() {
  try {
    const res = await fetch("/api/leads");
    leads = await res.json();
  } catch (e) {
    console.error("Не удалось загрузить лидов", e);
    leads = [];
  }
  render();
}

async function createLead(data) {
  const res = await fetch("/api/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (res.ok) await fetchLeads();
}

async function updateLead(id, fields) {
  const res = await fetch(`/api/leads/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  if (res.ok) await fetchLeads();
}

async function deleteLead(id) {
  const res = await fetch(`/api/leads/${id}`, { method: "DELETE" });
  if (res.ok) await fetchLeads();
  closeModal();
}

function filteredLeads() {
  const q = query.trim().toLowerCase();
  if (!q) return leads;
  return leads.filter(
    (l) =>
      (l.name || "").toLowerCase().includes(q) ||
      (l.phone || "").toLowerCase().includes(q) ||
      (l.city || "").toLowerCase().includes(q)
  );
}

function renderStats() {
  const total = leads.length;
  const hot = leads.filter((l) => l.score === "hot").length;
  const sold = leads.filter((l) => l.stage === "sold").length;
  const conv = total ? Math.round((sold / total) * 100) : 0;

  document.getElementById("stats").innerHTML = `
    <div class="stat"><div class="value">${total}</div><div class="label">Всего лидов</div></div>
    <div class="stat"><div class="value">${hot}</div><div class="label">Горячих</div></div>
    <div class="stat"><div class="value">${conv}%</div><div class="label">Конверсия</div></div>
  `;
}

function render() {
  renderStats();
  const board = document.getElementById("board");
  const fl = filteredLeads();
  board.innerHTML = STAGES.map((stage) => {
    const stageLeads = fl.filter((l) => l.stage === stage.id);
    const cards = stageLeads
      .map((l) => {
        const sc = SCORE_META[l.score] || SCORE_META.cold;
        return `
        <div class="card" draggable="true" data-id="${l.id}" onclick="openDetail(${l.id})">
          <div class="card-top">
            <span class="card-name">${escapeHtml(l.name)}</span>
            <span class="${sc.cls}">${sc.icon}</span>
          </div>
          ${l.city ? `<div class="card-city">📍 ${escapeHtml(l.city)}</div>` : ""}
        </div>`;
      })
      .join("");
    return `
      <div class="column" data-stage="${stage.id}">
        <div class="column-header">
          <h3>${stage.label}</h3>
          <span class="count-badge">${stageLeads.length}</span>
        </div>
        <div class="cards">
          ${cards || `<div class="empty-col">Пусто</div>`}
        </div>
      </div>
    `;
  }).join("");

  attachDragHandlers();
}

function escapeHtml(s) {
  if (!s) return "";
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function attachDragHandlers() {
  document.querySelectorAll(".card").forEach((card) => {
    card.addEventListener("dragstart", () => {
      dragId = card.dataset.id;
    });
  });
  document.querySelectorAll(".column").forEach((col) => {
    col.addEventListener("dragover", (e) => e.preventDefault());
    col.addEventListener("drop", () => {
      if (dragId) updateLead(dragId, { stage: col.dataset.stage });
      dragId = null;
    });
  });
}

// ---- Modals ----

function closeModal() {
  document.getElementById("modalRoot").innerHTML = "";
}

function openAddLeadModal() {
  newLeadForm = { name: "", phone: "", city: "", source: "", pain: "", pets: false, housing: "", notes: "" };
  renderAddModal();
}

function renderAddModal() {
  const f = newLeadForm;
  document.getElementById("modalRoot").innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this) closeModal()">
      <div class="modal">
        <button class="modal-close" onclick="closeModal()">✕</button>
        <h2>Добавить лида</h2>
        <div class="field"><label>Имя</label><input id="f-name" value="${escapeHtml(f.name)}" oninput="newLeadForm.name=this.value"/></div>
        <div class="field"><label>Телефон</label><input id="f-phone" value="${escapeHtml(f.phone)}" oninput="newLeadForm.phone=this.value"/></div>
        <div class="field"><label>Город</label><input value="${escapeHtml(f.city)}" oninput="newLeadForm.city=this.value"/></div>
        <div class="field"><label>Источник</label><input placeholder="Instagram, рекомендация..." value="${escapeHtml(f.source)}" oninput="newLeadForm.source=this.value"/></div>
        <div class="field"><label>Что беспокоит</label>
          <div class="chip-row">
            ${PAIN_POINTS.map((p) => `<button type="button" class="chip ${f.pain === p ? "active" : ""}" onclick="selectPain('${p}')">${p}</button>`).join("")}
          </div>
        </div>
        <div class="field"><label>Жильё</label>
          <div class="chip-row">
            ${HOUSING.map((h) => `<button type="button" class="chip ${f.housing === h ? "active" : ""}" onclick="selectHousing('${h}')">${h}</button>`).join("")}
          </div>
        </div>
        <div class="checkbox-row">
          <input type="checkbox" id="f-pets" ${f.pets ? "checked" : ""} onchange="newLeadForm.pets=this.checked"/>
          <label for="f-pets">Есть домашние животные</label>
        </div>
        <div class="field"><label>Заметки</label><textarea rows="2" oninput="newLeadForm.notes=this.value">${escapeHtml(f.notes)}</textarea></div>
        <button class="save-btn" onclick="submitNewLead()">Сохранить лида</button>
      </div>
    </div>
  `;
}

function selectPain(p) {
  newLeadForm.pain = p;
  renderAddModal();
}
function selectHousing(h) {
  newLeadForm.housing = h;
  renderAddModal();
}

async function submitNewLead() {
  if (!newLeadForm.name.trim()) return;
  await createLead(newLeadForm);
  closeModal();
}

function openDetail(id) {
  const lead = leads.find((l) => l.id === id);
  if (!lead) return;
  const sc = SCORE_META[lead.score] || SCORE_META.cold;
  document.getElementById("modalRoot").innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this) closeModal()">
      <div class="modal">
        <button class="modal-close" onclick="closeModal()">✕</button>
        <h2>${escapeHtml(lead.name)} <span class="${sc.cls}" style="font-size:12px;">${sc.label}</span></h2>
        ${lead.phone ? `<div class="detail-line">📞 ${escapeHtml(lead.phone)}</div>` : ""}
        ${lead.city ? `<div class="detail-line">📍 ${escapeHtml(lead.city)}</div>` : ""}
        ${lead.source ? `<div class="detail-line">Источник: ${escapeHtml(lead.source)}</div>` : ""}
        ${lead.pain ? `<div class="detail-line">Беспокоит: ${escapeHtml(lead.pain)}</div>` : ""}
        ${lead.housing ? `<div class="detail-line">Жильё: ${escapeHtml(lead.housing)}</div>` : ""}
        ${lead.pets ? `<div class="detail-line">Есть животные</div>` : ""}
        ${lead.notes ? `<div class="detail-line">${escapeHtml(lead.notes)}</div>` : ""}
        <div class="field" style="margin-top:14px;">
          <label>Этап</label>
          <select onchange="updateLead(${lead.id}, {stage: this.value})">
            ${STAGES.map((s) => `<option value="${s.id}" ${s.id === lead.stage ? "selected" : ""}>${s.label}</option>`).join("")}
          </select>
        </div>
        <button class="delete-link" onclick="deleteLead(${lead.id})">🗑 Удалить лида</button>
      </div>
    </div>
  `;
}

document.getElementById("addLeadBtn").addEventListener("click", openAddLeadModal);
document.getElementById("search").addEventListener("input", (e) => {
  query = e.target.value;
  render();
});

fetchLeads();
setInterval(fetchLeads, 15000); // авто-обновление, чтобы видеть новых лидов от бота
