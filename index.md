---
layout: default
title: MITRE ATT&CK Coverage Planner
---

<div class="mitre-app">
  <header class="app-header">
    <h1>MITRE ATT&amp;CK Coverage Planner</h1>
    <p class="lead">
      استخدم الأداة التالية لحساب نسبة التغطية الحالية لإجراءاتك الدفاعية مقارنةً بتقنيات MITRE ATT&amp;CK،
      وحدد الثغرات التكتيكية التي تحتاج إلى اهتمام.
    </p>
  </header>

  <section class="controls">
    <div class="control-group">
      <label for="searchInput">بحث عن تقنية أو معرف</label>
      <input id="searchInput" type="search" placeholder="مثال: T1059 أو Command" autocomplete="off" />
    </div>
    <div class="control-group">
      <label for="tacticFilter">تصفية حسب التكتيك</label>
      <select id="tacticFilter">
        <option value="all">كل التكتيكات</option>
      </select>
    </div>
    <div class="control-group statistics">
      <h2>مؤشرات التغطية</h2>
      <p><strong>التغطية الكلية:</strong> <span id="coveragePercent">0%</span></p>
      <p><strong>التقنيات المغطاة:</strong> <span id="coveredCount">0</span> من <span id="totalCount">0</span></p>
    </div>
  </section>

  <section class="actions">
    <button id="resetCoverage" type="button">إعادة تعيين التغطية</button>
    <button id="markAll" type="button">وضع علامة على الكل كمغطى</button>
  </section>

  <section class="table-wrapper">
    <table aria-label="قائمة تقنيات MITRE ATT&amp;CK">
      <thead>
        <tr>
          <th scope="col">تغطية</th>
          <th scope="col">المعرف</th>
          <th scope="col">التكتيك</th>
          <th scope="col">اسم التقنية</th>
        </tr>
      </thead>
      <tbody id="techniqueTableBody"></tbody>
    </table>
    <p class="empty-state" hidden id="emptyState">لا توجد نتائج مطابقة لخيارات البحث الحالية.</p>
  </section>

  <section class="bulk-tools">
    <h2>استيراد قائمة بالتقنيات المغطاة</h2>
    <p>
      الصق قائمة بالمعرفات (مثل <code>T1059</code>) مفصولة بفواصل أو أسطر.
      سنقوم بتحديث حالة التغطية تلقائيًا.
    </p>
    <form id="bulkImportForm">
      <textarea id="bulkInput" rows="4" placeholder="T1059, T1003, T1486..."></textarea>
      <button type="submit">تحديث التغطية</button>
      <p id="importSummary" role="status"></p>
    </form>
  </section>

  <section class="add-technique">
    <h2>إضافة تقنية مخصصة</h2>
    <p>
      أضف تقنيات خاصة ببيئتك (مثل ضوابط داخلية أو قدرات جديدة) حتى يتم تضمينها في حساب نسبة التغطية.
    </p>
    <form id="addTechniqueForm">
      <div class="form-grid">
        <label>
          المعرف
          <input id="newTechniqueId" required maxlength="10" placeholder="مثال: T9XXX" />
        </label>
        <label>
          التكتيك
          <input id="newTechniqueTactic" required placeholder="مثال: Discovery" />
        </label>
        <label>
          اسم التقنية
          <input id="newTechniqueName" required placeholder="وصف موجز" />
        </label>
      </div>
      <button type="submit">إضافة التقنية</button>
      <p id="addTechniqueMessage" role="status"></p>
    </form>
  </section>

  <section class="tactic-breakdown">
    <h2>تفصيل التغطية حسب التكتيك</h2>
    <table aria-label="تفصيل تغطية التكتيكات">
      <thead>
        <tr>
          <th scope="col">التكتيك</th>
          <th scope="col">إجمالي التقنيات</th>
          <th scope="col">مغطاة</th>
          <th scope="col">النسبة</th>
        </tr>
      </thead>
      <tbody id="tacticStats"></tbody>
    </table>
  </section>

  <footer class="app-footer">
    <p>آخر تحديث للحساب: <time id="lastUpdated"></time></p>
  </footer>
</div>

<style>
  :root {
    color-scheme: light dark;
    --surface: color-mix(in srgb, var(--bg, #f5f5f5) 90%, black 10%);
    --accent: #0070f3;
    --border: rgba(0, 0, 0, 0.1);
  }

  body {
    font-family: "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
    margin: 0;
    background: var(--surface);
    color: #1c1c1c;
    line-height: 1.7;
  }

  .mitre-app {
    max-width: 1100px;
    margin: 0 auto;
    padding: 2.5rem 1.5rem 4rem;
  }

  .app-header h1 {
    margin-bottom: 0.35rem;
  }

  .lead {
    margin-top: 0;
    color: #444;
  }

  .controls {
    display: grid;
    gap: 1.5rem;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    align-items: start;
    margin: 2rem 0 1.5rem;
  }

  .control-group label {
    display: block;
    font-weight: 600;
    margin-bottom: 0.5rem;
  }

  input[type="search"],
  input[type="text"],
  input[type="number"],
  textarea,
  select {
    width: 100%;
    padding: 0.7rem 0.8rem;
    border-radius: 0.6rem;
    border: 1px solid var(--border);
    font-size: 1rem;
    box-sizing: border-box;
  }

  input:focus,
  textarea:focus,
  select:focus,
  button:focus {
    outline: 3px solid color-mix(in srgb, var(--accent) 30%, transparent);
    outline-offset: 2px;
  }

  .statistics {
    background: white;
    border-radius: 1rem;
    padding: 1rem 1.25rem;
    border: 1px solid var(--border);
    box-shadow: 0 12px 24px rgba(15, 23, 42, 0.05);
  }

  .actions {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-bottom: 1rem;
  }

  button {
    background: var(--accent);
    color: white;
    border: none;
    border-radius: 0.6rem;
    padding: 0.65rem 1.1rem;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }

  button:hover {
    transform: translateY(-1px);
    box-shadow: 0 10px 20px rgba(0, 112, 243, 0.18);
  }

  button.secondary {
    background: #e1e8f8;
    color: #0f172a;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    background: white;
    border-radius: 1rem;
    overflow: hidden;
    box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
  }

  thead {
    background: #f1f5f9;
    text-align: left;
  }

  th,
  td {
    padding: 0.85rem 1rem;
    border-bottom: 1px solid #e2e8f0;
  }

  tbody tr:last-child td {
    border-bottom: none;
  }

  tbody tr:hover {
    background: #f8fafc;
  }

  .table-wrapper {
    overflow-x: auto;
    margin-bottom: 1.5rem;
  }

  .empty-state {
    margin-top: 1rem;
    color: #475569;
  }

  .bulk-tools,
  .add-technique,
  .tactic-breakdown {
    margin-top: 2.5rem;
    background: white;
    border-radius: 1rem;
    padding: 1.5rem;
    border: 1px solid var(--border);
    box-shadow: 0 16px 32px rgba(15, 23, 42, 0.06);
  }

  .bulk-tools form,
  .add-technique form {
    margin-top: 1rem;
  }

  textarea {
    min-height: 120px;
    resize: vertical;
  }

  .form-grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  }

  code {
    background: #0f172a;
    color: #f8fafc;
    padding: 0.1rem 0.35rem;
    border-radius: 0.4rem;
    font-size: 0.85rem;
  }

  .app-footer {
    margin-top: 3rem;
    text-align: center;
    color: #475569;
  }

  @media (max-width: 680px) {
    .mitre-app {
      padding: 1.5rem 1rem 3rem;
    }

    th,
    td {
      font-size: 0.9rem;
    }
  }
</style>

<script>
  const baseTechniques = [
    { id: "T1059", tactic: "Execution", name: "Command and Scripting Interpreter" },
    { id: "T1047", tactic: "Execution", name: "Windows Management Instrumentation" },
    { id: "T1204", tactic: "Execution", name: "User Execution" },
    { id: "T1190", tactic: "Initial Access", name: "Exploit Public-Facing Application" },
    { id: "T1133", tactic: "Initial Access", name: "External Remote Services" },
    { id: "T1078", tactic: "Credential Access", name: "Valid Accounts" },
    { id: "T1003", tactic: "Credential Access", name: "OS Credential Dumping" },
    { id: "T1110", tactic: "Credential Access", name: "Brute Force" },
    { id: "T1036", tactic: "Defense Evasion", name: "Masquerading" },
    { id: "T1562", tactic: "Defense Evasion", name: "Impair Defenses" },
    { id: "T1055", tactic: "Defense Evasion", name: "Process Injection" },
    { id: "T1087", tactic: "Discovery", name: "Account Discovery" },
    { id: "T1018", tactic: "Discovery", name: "Remote System Discovery" },
    { id: "T1105", tactic: "Command and Control", name: "Ingress Tool Transfer" },
    { id: "T1571", tactic: "Command and Control", name: "Non-Standard Port" },
    { id: "T1021", tactic: "Lateral Movement", name: "Remote Services" },
    { id: "T1041", tactic: "Exfiltration", name: "Exfiltration Over C2 Channel" },
    { id: "T1567", tactic: "Exfiltration", name: "Exfiltration Over Web Services" },
    { id: "T1486", tactic: "Impact", name: "Data Encrypted for Impact" },
    { id: "T1490", tactic: "Impact", name: "Inhibit System Recovery" }
  ];

  const state = {
    techniques: baseTechniques.map((tech) => ({ ...tech, covered: false }))
  };

  const elements = {
    tableBody: document.getElementById("techniqueTableBody"),
    searchInput: document.getElementById("searchInput"),
    tacticFilter: document.getElementById("tacticFilter"),
    coveragePercent: document.getElementById("coveragePercent"),
    coveredCount: document.getElementById("coveredCount"),
    totalCount: document.getElementById("totalCount"),
    tacticStats: document.getElementById("tacticStats"),
    lastUpdated: document.getElementById("lastUpdated"),
    emptyState: document.getElementById("emptyState"),
    importSummary: document.getElementById("importSummary"),
    addTechniqueMessage: document.getElementById("addTechniqueMessage")
  };

  const formatPercent = (value) => `${(value * 100).toFixed(1)}%`;

  function setLastUpdated() {
    const now = new Date();
    elements.lastUpdated.textContent = new Intl.DateTimeFormat("ar", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(now);
  }

  function refreshTacticFilter() {
    const tacticOptions = new Set(state.techniques.map((tech) => tech.tactic));
    const previouslySelected = elements.tacticFilter.value;
    elements.tacticFilter.innerHTML = '<option value="all">كل التكتيكات</option>';
    [...tacticOptions]
      .sort((a, b) => a.localeCompare(b))
      .forEach((tactic) => {
        const option = document.createElement("option");
        option.value = tactic;
        option.textContent = tactic;
        if (tactic === previouslySelected) {
          option.selected = true;
        }
        elements.tacticFilter.append(option);
      });
  }

  function getFilteredTechniques() {
    const term = elements.searchInput.value.trim().toLowerCase();
    const tactic = elements.tacticFilter.value;

    return state.techniques.filter((tech) => {
      const matchesSearch =
        term.length === 0 ||
        tech.id.toLowerCase().includes(term) ||
        tech.name.toLowerCase().includes(term) ||
        tech.tactic.toLowerCase().includes(term);

      const matchesTactic = tactic === "all" || tech.tactic === tactic;

      return matchesSearch && matchesTactic;
    });
  }

  function renderTable() {
    const filtered = getFilteredTechniques();
    elements.tableBody.innerHTML = "";

    filtered.forEach((tech) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>
          <label class="checkbox">
            <input type="checkbox" data-tech-id="${tech.id}" ${tech.covered ? "checked" : ""} />
          </label>
        </td>
        <td><strong>${tech.id}</strong></td>
        <td>${tech.tactic}</td>
        <td>${tech.name}</td>
      `;
      elements.tableBody.append(row);
    });

    elements.emptyState.hidden = filtered.length !== 0;
  }

  function updateStats() {
    const total = state.techniques.length;
    const covered = state.techniques.filter((tech) => tech.covered).length;
    const percent = total === 0 ? 0 : covered / total;

    elements.coveragePercent.textContent = formatPercent(percent);
    elements.coveredCount.textContent = covered;
    elements.totalCount.textContent = total;

    const tacticTotals = state.techniques.reduce((acc, tech) => {
      if (!acc[tech.tactic]) {
        acc[tech.tactic] = { total: 0, covered: 0 };
      }
      acc[tech.tactic].total += 1;
      if (tech.covered) {
        acc[tech.tactic].covered += 1;
      }
      return acc;
    }, {});

    elements.tacticStats.innerHTML = "";
    Object.entries(tacticTotals)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([tactic, stats]) => {
        const row = document.createElement("tr");
        const ratio = stats.total === 0 ? 0 : stats.covered / stats.total;
        row.innerHTML = `
          <td>${tactic}</td>
          <td>${stats.total}</td>
          <td>${stats.covered}</td>
          <td>${formatPercent(ratio)}</td>
        `;
        elements.tacticStats.append(row);
      });

    setLastUpdated();
  }

  function toggleCoverage(id, covered) {
    const technique = state.techniques.find((tech) => tech.id === id);
    if (technique) {
      technique.covered = covered;
    }
  }

  elements.tableBody.addEventListener("change", (event) => {
    const input = event.target;
    if (input instanceof HTMLInputElement && input.dataset.techId) {
      toggleCoverage(input.dataset.techId, input.checked);
      updateStats();
    }
  });

  elements.searchInput.addEventListener("input", () => {
    renderTable();
  });

  elements.tacticFilter.addEventListener("change", () => {
    renderTable();
  });

  document.getElementById("resetCoverage").addEventListener("click", () => {
    state.techniques.forEach((tech) => {
      tech.covered = false;
    });
    renderTable();
    updateStats();
  });

  document.getElementById("markAll").addEventListener("click", () => {
    state.techniques.forEach((tech) => {
      tech.covered = true;
    });
    renderTable();
    updateStats();
  });

  document.getElementById("bulkImportForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const rawInput = document.getElementById("bulkInput").value;
    const ids = rawInput
      .split(/\s|,|;|\n|\r/)
      .map((part) => part.trim().toUpperCase())
      .filter(Boolean);

    const uniqueIds = [...new Set(ids)];
    let matched = 0;

    state.techniques.forEach((tech) => {
      if (uniqueIds.includes(tech.id.toUpperCase())) {
        tech.covered = true;
        matched += 1;
      }
    });

    elements.importSummary.textContent = matched
      ? `تم تحديث ${matched} تقنية.`
      : "لم يتم العثور على تطابقات للمعرفات المدخلة.";

    renderTable();
    updateStats();
  });

  document.getElementById("addTechniqueForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const idInput = document.getElementById("newTechniqueId");
    const tacticInput = document.getElementById("newTechniqueTactic");
    const nameInput = document.getElementById("newTechniqueName");

    const newId = idInput.value.trim().toUpperCase();
    const newTactic = tacticInput.value.trim();
    const newName = nameInput.value.trim();

    if (!newId || !newTactic || !newName) {
      elements.addTechniqueMessage.textContent = "يرجى استكمال جميع الحقول.";
      return;
    }

    const exists = state.techniques.some((tech) => tech.id === newId);
    if (exists) {
      elements.addTechniqueMessage.textContent = "هذا المعرف موجود بالفعل في القائمة.";
      return;
    }

    state.techniques.push({ id: newId, tactic: newTactic, name: newName, covered: false });
    elements.addTechniqueMessage.textContent = `تمت إضافة التقنية ${newId}.`;
    idInput.value = "";
    tacticInput.value = "";
    nameInput.value = "";

    refreshTacticFilter();
    renderTable();
    updateStats();
  });

  refreshTacticFilter();
  renderTable();
  updateStats();
</script>
