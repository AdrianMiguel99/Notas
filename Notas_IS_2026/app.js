import { calculateCourse, calculateOverall, evaluationContribution, evaluationsFor } from "./grades.js";

let gradeData = null;
const views = {
  resumen: document.getElementById("view-resumen"),
  general: document.getElementById("view-general"),
  curso: document.getElementById("view-curso"),
  admin: document.getElementById("view-admin"),
};
const subtitulo = document.getElementById("subtitulo");
const tbodyGeneral = document.getElementById("tbody-general");
const selectCurso = document.getElementById("select-curso");
const tbodyCurso = document.getElementById("tbody-curso");
const cursoKpis = document.getElementById("curso-kpis");
const loginForm = document.getElementById("login-form");
const gradeForm = document.getElementById("grade-form");
const loginPanel = document.getElementById("login-panel");
const gradePanel = document.getElementById("grade-panel");
const adminMessage = document.getElementById("admin-message");
const adminCourse = document.getElementById("admin-course");
const adminType = document.getElementById("admin-type");
const adminEvaluationList = document.getElementById("admin-evaluation-list");

function fmt(value) {
  if (value === null || value === undefined) return "—";
  return Number(value).toFixed(2).replace(/\.00$/, "");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function badge(course, grade) {
  if (grade === null || grade === undefined) return '<span class="badge mid">PENDIENTE</span>';
  if (course.thresholds) {
    if (grade >= course.thresholds.pass) return '<span class="badge ok">APROBADO</span>';
    if (grade >= course.thresholds.extension) return '<span class="badge mid">AMPLIACIÓN</span>';
    return '<span class="badge low">REPROBADO</span>';
  }
  if (grade >= 80) return '<span class="badge ok">MUY BIEN</span>';
  if (grade >= 70) return '<span class="badge mid">BIEN</span>';
  return '<span class="badge low">ALERTA</span>';
}

async function loadGrades() {
  try {
    const response = await fetch("/api/grades", { cache: "no-store" });
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error();
    return await response.json();
  } catch {
    const response = await fetch("data/grades.json", { cache: "no-store" });
    if (!response.ok) throw new Error("No fue posible cargar las notas.");
    return response.json();
  }
}

function renderResumen() {
  views.resumen.innerHTML = "";
  const generalCard = document.createElement("div");
  generalCard.className = "card";
  generalCard.innerHTML = `
    <h2>Resumen general</h2>
    <div class="kpis">
      <div class="kpi"><div class="label">Promedio actual (proyectado)</div><div class="value">${fmt(calculateOverall(gradeData))}</div></div>
      <div class="kpi"><div class="label">Semestre</div><div class="value">${escapeHtml(gradeData.semester)}</div></div>
    </div>
    <div class="small" style="margin-top:10px;">“Proyectado” significa: cómo vas según lo evaluado hasta ahora.</div>`;
  views.resumen.appendChild(generalCard);

  for (const course of gradeData.courses) {
    const result = calculateCourse(gradeData, course);
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <h2>${escapeHtml(course.name)}</h2>
      <div class="kpis">
        <div class="kpi"><div class="label">Nota acumulada</div><div class="value">${fmt(result.accumulated)}</div></div>
        <div class="kpi"><div class="label">% completado</div><div class="value">${fmt(result.completedWeight)}%</div></div>
        <div class="kpi"><div class="label">Nota proyectada</div><div class="value">${fmt(result.projected)}</div></div>
      </div>
      <div class="small" style="margin-top:10px;">${badge(course, result.completedWeight ? result.projected : null)}</div>`;
    views.resumen.appendChild(card);
  }
}

function evaluationRow(course, evaluation, includeCourse) {
  const result = evaluationContribution(gradeData, course, evaluation);
  const values = [
    ...(includeCourse ? [course.name] : []),
    evaluation.name,
    fmt(evaluation.grade),
    result.weight === null ? "—" : fmt(result.weight),
    fmt(result.contribution),
    evaluation.createdAt ? new Date(evaluation.createdAt).toLocaleDateString("es-CR") : "—",
  ];
  const row = document.createElement("tr");
  for (const value of values) {
    const cell = document.createElement("td");
    cell.textContent = value;
    row.appendChild(cell);
  }
  return row;
}

function renderGeneral() {
  tbodyGeneral.innerHTML = "";
  for (const course of gradeData.courses) {
    for (const evaluation of evaluationsFor(gradeData, course.id)) {
      tbodyGeneral.appendChild(evaluationRow(course, evaluation, true));
    }
  }
  if (!tbodyGeneral.children.length) {
    tbodyGeneral.innerHTML = '<tr><td colspan="6" class="empty">Todavía no hay evaluaciones registradas.</td></tr>';
  }
}

function fillCourseSelects() {
  selectCurso.innerHTML = "";
  adminCourse.innerHTML = "";
  for (const course of gradeData.courses) {
    for (const select of [selectCurso, adminCourse]) {
      const option = document.createElement("option");
      option.value = course.id;
      option.textContent = course.name;
      select.appendChild(option);
    }
  }
  fillTypeSelect();
}

function fillTypeSelect() {
  const course = gradeData.courses.find((candidate) => candidate.id === adminCourse.value) || gradeData.courses[0];
  adminType.innerHTML = "";
  for (const type of course.assessmentTypes) {
    const used = evaluationsFor(gradeData, course.id, type.id).length;
    if (type.maxEntries && used >= type.maxEntries) continue;
    const option = document.createElement("option");
    option.value = type.id;
    option.textContent = `${type.label} (${fmt(type.weight)}%)`;
    adminType.appendChild(option);
  }
}

function renderCourse(id) {
  const course = gradeData.courses.find((candidate) => candidate.id === id) || gradeData.courses[0];
  const result = calculateCourse(gradeData, course);
  cursoKpis.innerHTML = `
    <div class="kpi"><div class="label">Nota acumulada</div><div class="value">${fmt(result.accumulated)}</div></div>
    <div class="kpi"><div class="label">% completado</div><div class="value">${fmt(result.completedWeight)}%</div></div>
    <div class="kpi"><div class="label">Nota proyectada</div><div class="value">${fmt(result.projected)}</div></div>`;

  tbodyCurso.innerHTML = "";
  for (const evaluation of evaluationsFor(gradeData, course.id)) {
    tbodyCurso.appendChild(evaluationRow(course, evaluation, false));
  }
  if (!tbodyCurso.children.length) {
    tbodyCurso.innerHTML = '<tr><td colspan="5" class="empty">Todavía no hay evaluaciones registradas.</td></tr>';
  }
}

function renderAdminEvaluations() {
  adminEvaluationList.innerHTML = "";
  const entries = gradeData.courses.flatMap((course) =>
    evaluationsFor(gradeData, course.id).map((evaluation) => ({ course, evaluation }))
  ).reverse();

  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "small empty";
    empty.textContent = "Todavía no hay evaluaciones registradas.";
    adminEvaluationList.appendChild(empty);
    return;
  }

  for (const { course, evaluation } of entries) {
    const row = document.createElement("div");
    row.className = "admin-evaluation-row";

    const info = document.createElement("div");
    info.className = "admin-evaluation-info";
    const name = document.createElement("strong");
    name.textContent = evaluation.name;
    const courseName = document.createElement("span");
    courseName.className = "small";
    courseName.textContent = course.name;
    info.append(name, courseName);

    const actions = document.createElement("div");
    actions.className = "admin-evaluation-actions";
    const grade = document.createElement("span");
    grade.className = "admin-evaluation-grade";
    grade.textContent = fmt(evaluation.grade);
    const edit = document.createElement("button");
    edit.className = "btn compact secondary";
    edit.type = "button";
    edit.dataset.action = "edit";
    edit.dataset.id = evaluation.id;
    edit.textContent = "Editar";
    const remove = document.createElement("button");
    remove.className = "btn compact secondary danger";
    remove.type = "button";
    remove.dataset.action = "delete";
    remove.dataset.id = evaluation.id;
    remove.textContent = "Eliminar";
    actions.append(grade, edit, remove);
    row.append(info, actions);
    adminEvaluationList.appendChild(row);
  }
}

function renderAll() {
  subtitulo.textContent = `${gradeData.semester} • Actualizado automáticamente`;
  renderResumen();
  renderGeneral();
  renderCourse(selectCurso.value || gradeData.courses[0].id);
  fillTypeSelect();
  renderAdminEvaluations();
}

function setView(view) {
  document.querySelectorAll("nav .btn").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  for (const [name, section] of Object.entries(views)) {
    section.style.display = name === view ? (name === "resumen" ? "grid" : "block") : "none";
  }
  if (view === "admin") checkSession();
}

function showAdminMessage(message, error = false) {
  adminMessage.textContent = message;
  adminMessage.className = error ? "notice error" : "notice";
  adminMessage.hidden = !message;
}

async function readApiJson(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("El servicio administrativo todavía no está disponible en este dominio.");
  }
  return response.json();
}

function setAuthenticated(authenticated) {
  loginPanel.hidden = authenticated;
  gradePanel.hidden = !authenticated;
}

async function checkSession() {
  try {
    const response = await fetch("/api/session", { credentials: "same-origin", cache: "no-store" });
    const result = await readApiJson(response);
    setAuthenticated(Boolean(result.authenticated));
  } catch {
    setAuthenticated(false);
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showAdminMessage("");
  const fields = new FormData(loginForm);
  try {
    const response = await fetch("/api/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: fields.get("email"), password: fields.get("password") }),
    });
    const result = await readApiJson(response);
    if (!response.ok) throw new Error(result.error || "No fue posible iniciar sesión.");
    loginForm.reset();
    setAuthenticated(true);
  } catch (error) {
    showAdminMessage(error.message || "No fue posible iniciar sesión.", true);
  }
});

gradeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showAdminMessage("");
  const fields = new FormData(gradeForm);
  try {
    const response = await fetch("/api/grades", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId: fields.get("courseId"), typeId: fields.get("typeId"), grade: Number(fields.get("grade")) }),
    });
    const result = await readApiJson(response);
    if (response.status === 401) {
      setAuthenticated(false);
      throw new Error("La sesión venció. Iniciá sesión nuevamente.");
    }
    if (!response.ok) throw new Error(result.error || "No fue posible agregar la nota.");
    gradeData = result.data;
    gradeForm.elements.grade.value = "";
    renderAll();
    showAdminMessage("Nota agregada correctamente.");
  } catch (error) {
    showAdminMessage(error.message || "No fue posible agregar la nota.", true);
  }
});

adminEvaluationList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const evaluation = gradeData.evaluations.find((candidate) => candidate.id === button.dataset.id);
  if (!evaluation) return;

  let method;
  let body;
  let successMessage;
  if (button.dataset.action === "edit") {
    const value = window.prompt(`Nueva nota para ${evaluation.name}:`, fmt(evaluation.grade));
    if (value === null) return;
    const grade = Number(value.replace(",", "."));
    if (!Number.isFinite(grade) || grade < gradeData.gradeScale.min || grade > gradeData.gradeScale.max) {
      showAdminMessage(`La nota debe estar entre ${gradeData.gradeScale.min} y ${gradeData.gradeScale.max}.`, true);
      return;
    }
    method = "PATCH";
    body = JSON.stringify({ grade });
    successMessage = "Nota editada correctamente.";
  } else {
    if (!window.confirm(`¿Eliminar ${evaluation.name}?`)) return;
    method = "DELETE";
    successMessage = "Nota eliminada correctamente.";
  }

  button.disabled = true;
  showAdminMessage("");
  try {
    const response = await fetch(`/api/grades/${encodeURIComponent(evaluation.id)}`, {
      method,
      credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body,
    });
    const result = await readApiJson(response);
    if (response.status === 401) {
      setAuthenticated(false);
      throw new Error("La sesión venció. Iniciá sesión nuevamente.");
    }
    if (!response.ok) throw new Error(result.error || "No fue posible modificar la nota.");
    gradeData = result.data;
    renderAll();
    showAdminMessage(successMessage);
  } catch (error) {
    button.disabled = false;
    showAdminMessage(error.message || "No fue posible modificar la nota.", true);
  }
});

document.getElementById("logout-button").addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST", credentials: "same-origin" }).catch(() => null);
  setAuthenticated(false);
  showAdminMessage("");
});

document.querySelectorAll("nav .btn").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
selectCurso.addEventListener("change", () => renderCourse(selectCurso.value));
adminCourse.addEventListener("change", fillTypeSelect);

try {
  gradeData = await loadGrades();
  fillCourseSelects();
  renderAll();
} catch (error) {
  subtitulo.textContent = error.message;
}
