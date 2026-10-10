// ---------- Telegram ----------
const tg = window.Telegram && window.Telegram.WebApp;
if (tg) { tg.ready(); tg.expand(); }                       // раскрываем на весь экран
const haptic = () => { try { tg.HapticFeedback.selectionChanged(); } catch (e) {} }; // лёгкая вибрация при тапе

// ---------- Состояние ----------
// w/h — готовая деталь. e: [верх, право, низ, лево]; коды 1/2 сохранены для старых проектов.
function newPart() { return { n: "", w: "", h: "", q: 1, tex: true, edgeEnabled: false, e: [0, 0, 0, 0] }; }
const $ = id => document.getElementById(id);
const SIDE = ["Верх", "Право", "Низ", "Лево"];
const EDGE_TYPES = [
  { id: 1, thickness: 0.4, label: "0,4", color: "var(--e04)" },
  { id: 3, thickness: 0.8, label: "0,8", color: "var(--e08)" },
  { id: 4, thickness: 1, label: "1", color: "var(--e1)" },
  { id: 2, thickness: 2, label: "2", color: "var(--e2)" }
];
const edgeType = id => EDGE_TYPES.find(type => type.id === id);
const activeEdges = p => p.edgeEnabled === false ? [0, 0, 0, 0] : p.e;
const formatSize = value => String(Number(value.toPrecision(15))).replace(".", ",");
function blankSize(p) {
  const e = activeEdges(p), thickness = k => edgeType(e[k])?.thickness || 0;
  const subtract = (size, amount) => amount ? Number((size - amount).toPrecision(15)) : size;
  return {
    w: subtract(number(p.w), thickness(1) + thickness(3)),
    h: subtract(number(p.h), thickness(0) + thickness(2)), e
  };
}
const MAX_QUANTITY = 500, MAX_PARTS = 5000;
const SETTINGS = ["preset", "W", "H", "T", "kerf", "trim", "res"];
const PRESETS = ["2750x1830", "2800x2070", "2440x1830", "2440x1220", "3050x1220", "custom"];

function normalizePart(p) {
  const value = (x, fallback) => typeof x === "string" || typeof x === "number" ? x : fallback;
  const e = [0, 1, 2, 3].map(k => Array.isArray(p.e) && [0, ...EDGE_TYPES.map(t => t.id)].includes(p.e[k]) ? p.e[k] : 0);
  return {
    n: typeof p.n === "string" ? p.n : "",
    w: value(p.w, ""), h: value(p.h, ""), q: value(p.q, 1),
    tex: typeof p.tex === "boolean" ? p.tex : true,
    edgeEnabled: typeof p.edgeEnabled === "boolean" ? p.edgeEnabled : e.some(Boolean), e
  };
}

function loadProject() {
  try {
    const saved = JSON.parse(localStorage.getItem("cut-project") || "null");
    if (saved && saved.version === 1 && Array.isArray(saved.parts)) return saved;
  } catch (e) {}
  try {
    const legacy = JSON.parse(localStorage.getItem("cut-parts") || "null");
    if (Array.isArray(legacy)) return { parts: legacy };
  } catch (e) {}
  return { parts: [] };
}

const savedProject = loadProject();
let parts = savedProject.parts.filter(p => p && typeof p === "object" && !Array.isArray(p)).map(normalizePart);
if (!parts.length) parts = [newPart()];
let result = null, cur = 0, validationErrors = [];

function saveProject() {
  const settings = Object.fromEntries(SETTINGS.map(id => [id, $(id).value]));
  try { localStorage.setItem("cut-project", JSON.stringify({ version: 1, parts, settings })); } catch (e) {}
}

function escapeHTML(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function number(value) {
  return String(value).trim() === "" ? NaN : Number(value);
}

function markInvalid(input, invalid) {
  input.setAttribute("aria-invalid", String(invalid));
}

function blankPart(p) {
  return String(p.w).trim() === "" && String(p.h).trim() === "";
}

// ---------- Лист ----------
function applyPreset() {
  const v = $("preset").value;
  if (v !== "custom") { const [w, h] = v.split("x"); $("W").value = w; $("H").value = h; }
}
$("preset").onchange = () => { applyPreset(); calc(); };
["W", "H"].forEach(id => $(id).oninput = () => { $("preset").value = "custom"; calc(); });
["T", "kerf", "trim", "res"].forEach(id => $(id).oninput = calc);
applyPreset();
if (savedProject.settings && typeof savedProject.settings === "object") {
  SETTINGS.forEach(id => {
    const value = savedProject.settings[id];
    if ((typeof value === "string" || typeof value === "number") &&
        (id !== "preset" || PRESETS.includes(value))) $(id).value = value;
  });
  // Старые или неполные настройки не должны оставлять выбранный пресет с чужими размерами.
  if ($("preset").value !== "custom" && $("preset").value !== `${$("W").value}x${$("H").value}`) {
    $("preset").value = "custom";
  }
}

// ---------- Список деталей ----------
function renderParts() {
  $("parts").innerHTML = "";
  parts.forEach((p, i) => {
    const el = document.createElement("div");
    el.className = "part";
    el.innerHTML = `
      <input type="text" placeholder="Наименование (необязательно)" value="${escapeHTML(p.n)}">
      <div class="r2">
        <div><label>Длина, мм</label><input type="number" inputmode="decimal" min="0" step="any" aria-label="Длина готовой детали ${i + 1}" value="${escapeHTML(p.w)}"></div>
        <div><label>Ширина, мм</label><input type="number" inputmode="decimal" min="0" step="any" aria-label="Ширина готовой детали ${i + 1}" value="${escapeHTML(p.h)}"></div>
        <div><label>Шт.</label><input type="number" inputmode="numeric" min="1" max="${MAX_QUANTITY}" step="1" value="${escapeHTML(p.q)}"></div>
      </div>
      <div class="r3">
        <label class="check-label"><input type="checkbox" ${p.tex ? "checked" : ""}> Текстура (не вращать)</label>
        <button class="x" aria-label="Удалить деталь ${i + 1}">×</button>
      </div>
      <label class="check-label edge-toggle"><input type="checkbox" ${p.edgeEnabled !== false && p.e.some(Boolean) || p.edgeEnabled === true ? "checked" : ""}> Использовать кромку</label>
      <div class="edge-editor">
        ${p.e.map((s, k) => `<label class="edge-side side-${k}">${SIDE[k]}
          <select data-k="${k}" aria-label="Кромка: ${SIDE[k].toLowerCase()}, деталь ${i + 1}">
            ${[{ id: 0, label: "Нет" }, ...EDGE_TYPES].map(t => `<option value="${t.id}" ${s === t.id ? "selected" : ""}>${t.label}${t.id ? " мм" : ""}</option>`).join("")}
          </select></label>`).join("")}
        <div class="edge-preview"><span>Готовая деталь</span><strong class="finished-size"></strong></div>
      </div>
      <p class="blank-size" role="status" aria-live="polite"></p>`;
    const ins = el.querySelectorAll("input");
    ins[0].oninput = () => { p.n = ins[0].value; calc(); };
    ins[1].oninput = () => { p.w = ins[1].value; calc(); };
    ins[2].oninput = () => { p.h = ins[2].value; calc(); };
    ins[3].oninput = () => { p.q = ins[3].value; calc(); };
    ins[4].onchange = () => { p.tex = ins[4].checked; haptic(); calc(); };
    ins[5].onchange = () => { p.edgeEnabled = ins[5].checked; haptic(); calc(); };
    el.querySelectorAll("select").forEach(select => select.onchange = () => {
      p.e[+select.dataset.k] = +select.value;
      haptic(); calc();
    });
    el.querySelector(".x").onclick = () => { parts.splice(i, 1); if (!parts.length) parts.push(newPart()); renderParts(); calc(); };
    $("parts").appendChild(el);
  });
}
function renderPartSizes() {
  const rows = $("parts").querySelectorAll(".part");
  parts.forEach((p, i) => {
    const row = rows[i], size = blankSize(p), w = number(p.w), h = number(p.h);
    const enabled = p.edgeEnabled === true || p.edgeEnabled !== false && p.e.some(Boolean);
    row.querySelector(".edge-editor").hidden = !enabled;
    row.querySelector(".finished-size").textContent = Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0 ? `${formatSize(w)} × ${formatSize(h)} мм` : "—";
    const preview = row.querySelector(".edge-preview");
    ["Top", "Right", "Bottom", "Left"].forEach((side, k) => preview.style[`border${side}Color`] = edgeType(size.e[k])?.color || "var(--line)");
    const valid = Number.isFinite(size.w) && Number.isFinite(size.h) && size.w > 0 && size.h > 0;
    row.querySelector(".blank-size").textContent = valid ? `Размер заготовки: ${formatSize(size.w)} × ${formatSize(size.h)} мм` :
      Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0 ? "Кромка слишком толстая для указанных размеров." : "Введите размеры готовой детали.";
  });
}
$("add").onclick = () => { parts.push(newPart()); renderParts(); calc(); };
// Вставка из Excel: колонки разделены табуляцией или «;»
function parseRow(line) {
  const cells = line.split(/\t|;/).map(s => s.trim());
  const decimal = s => /^[+-]?\d+([.,]\d+)?$/.test(s) ? Number(s.replace(",", ".")) : NaN;
  if (cells.length < 2 || cells.length > 4) return { error: "нужно от 2 до 4 столбцов" };
  // Четыре столбца всегда включают название, даже если оно числовое.
  const named = cells.length === 4 || (cells.length === 3 && !Number.isFinite(decimal(cells[0])));
  const offset = named ? 1 : 0;
  const w = decimal(cells[offset]), h = decimal(cells[offset + 1]);
  const quantity = cells[offset + 2];
  const q = quantity === undefined || quantity === "" ? 1 : decimal(quantity);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0 || !Number.isFinite(w * h)) {
    return { error: "длина и ширина должны быть положительными числами" };
  }
  if (!Number.isInteger(q) || q < 1 || q > MAX_QUANTITY) {
    return { error: `количество должно быть целым числом от 1 до ${MAX_QUANTITY}` };
  }
  return { part: { ...newPart(), n: named ? cells[0] : "", w, h, q } };
}

$("pasteBtn").onclick = () => {
  const added = [], rejected = [], errors = [];
  let total = parts.reduce((sum, p) => {
    const q = number(p.q);
    return sum + (!blankPart(p) && Number.isInteger(q) && q > 0 ? q : 0);
  }, 0);
  $("paste").value.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const parsed = parseRow(line);
    const error = parsed.error || (total + parsed.part.q > MAX_PARTS ? `в проекте допускается не больше ${MAX_PARTS} деталей` : "");
    if (error) { rejected.push(line); errors.push(`Строка ${i + 1}: ${error}.`); return; }
    added.push(parsed.part); total += parsed.part.q;
  });
  if (added.length) {
    parts = parts.filter(p => !blankPart(p) || p.n.trim());
    parts.push(...added);
    renderParts(); calc();
  }
  $("paste").value = rejected.join("\n");
  $("pasteStatus").hidden = false;
  $("pasteStatus").classList.toggle("error", errors.length > 0);
  $("pasteStatus").textContent = [`Добавлено строк: ${added.length}.`, ...errors,
    errors.length ? "Строки с ошибками оставлены в поле для исправления." : ""].filter(Boolean).join("\n");
};

// ---------- Раскрой: гильотина (все резы сквозные, как на форматке) ----------
function pack(items, W, H, kerf, trim) {
  const uw = W - 2 * trim, uh = H - 2 * trim;             // полезная область листа
  const epsilon = 1e-7; // мм: допуск только для погрешности вычислений дробных размеров
  const remainder = (available, required) => {
    const rest = available - required;
    return rest > epsilon ? rest : 0;
  };
  const sheets = [], failed = [];
  // К свободной области прибавляем пропил: последней детали в ряду он не нужен
  const fresh = () => ({ free: [[trim, trim, uw + kerf, uh + kerf]], placed: [] });
  // Лучшее место для детали — по короткой стороне остатка (BSSF)
  function spot(s, it) {
    let best = null;
    const or = [[it.w, it.h, false]];
    if (!it.tex && it.w !== it.h) or.push([it.h, it.w, true]);   // поворот только без текстуры
    s.free.forEach((f, i) => or.forEach(([w, h, t]) => {
      if (w + kerf <= f[2] + epsilon && h + kerf <= f[3] + epsilon) {
        const sc = Math.min(remainder(f[2], w + kerf), remainder(f[3], h + kerf));
        if (!best || sc < best.sc) best = { sc, i, w, h, t };
      }
    }));
    return best;
  }
  // Кладём деталь и делим остаток на два прямоугольника сквозным резом
  function put(s, it, b) {
    const [fx, fy, fw, fh] = s.free.splice(b.i, 1)[0];
    const pw = b.w + kerf, ph = b.h + kerf, rw = remainder(fw, pw), rh = remainder(fh, ph);
    const [r, d] = rw < rh ? [[fx + pw, fy, rw, ph], [fx, fy + ph, fw, rh]]
                           : [[fx + pw, fy, rw, fh], [fx, fy + ph, pw, rh]];
    [r, d].forEach(x => { if (x[2] > 0 && x[3] > 0) s.free.push(x); });
    // При повороте на 90° по часовой кромка сдвигается: верх←лево, право←верх, низ←право, лево←низ
    const e = b.t ? [it.e[3], it.e[0], it.e[1], it.e[2]] : it.e;
    s.placed.push({ it, x: fx, y: fy, w: b.w, h: b.h, e });
  }
  items.sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h); // крупные первыми
  for (const it of items) {
    let done = false;
    for (const s of sheets) { const b = spot(s, it); if (b) { put(s, it, b); done = true; break; } }
    if (done) continue;
    const s = fresh(), b = spot(s, it);
    if (b) { put(s, it, b); sheets.push(s); } else failed.push(it);   // не влезла даже в пустой лист
  }
  return { sheets, failed };
}

// ---------- Расчёт ----------
function calc() {
  saveProject();
  renderPartSizes();
  validationErrors = [];
  const W = number($("W").value), H = number($("H").value), T = number($("T").value);
  const kerf = number($("kerf").value), trim = number($("trim").value), res = number($("res").value);
  const check = (input, value, valid, message) => {
    const invalid = Boolean(input.validity && input.validity.badInput) || !Number.isFinite(value) || !valid(value);
    markInvalid(input, invalid);
    if (invalid) validationErrors.push(message);
    return !invalid;
  };
  [["W", W, "Длина листа"], ["H", H, "Ширина листа"], ["T", T, "Толщина листа"]].forEach(([id, value, label]) => {
    check($(id), value, v => v > 0, `${label} должна быть числом больше нуля.`);
  });
  [["kerf", kerf, "Пропил"], ["trim", trim, "Обрезка листа"], ["res", res, "Запас кромки"]].forEach(([id, value, label]) => {
    check($(id), value, v => v >= 0, `${label}: укажите число не меньше нуля.`);
  });
  if (W > 0 && H > 0 && Number.isFinite(W) && Number.isFinite(H) && !Number.isFinite(W * H)) {
    markInvalid($("W"), true); markInvalid($("H"), true);
    validationErrors.push("Размеры листа слишком велики для расчёта.");
  }
  if (Number.isFinite(W) && Number.isFinite(H) && Number.isFinite(trim) && trim >= 0 &&
      W > 0 && H > 0 && 2 * trim >= Math.min(W, H)) {
    markInvalid($("trim"), true);
    validationErrors.push("Обрезка слишком велика: после неё должна оставаться полезная площадь листа.");
  }
  const entries = [], rows = $("parts").querySelectorAll(".part");
  let total = 0;
  parts.forEach((p, i) => {
    const inputs = rows[i].querySelectorAll("input");
    [1, 2, 3].forEach(k => markInvalid(inputs[k], false));
    if (blankPart(p) && !inputs[1].validity.badInput && !inputs[2].validity.badInput) return;
    const w = number(p.w), h = number(p.h), q = number(p.q);
    const label = `Деталь ${i + 1}`;
    const widthOK = check(inputs[1], w, v => v > 0, `${label}: длина должна быть числом больше нуля.`);
    const heightOK = check(inputs[2], h, v => v > 0, `${label}: ширина должна быть числом больше нуля.`);
    const quantityOK = check(inputs[3], q, v => Number.isInteger(v) && v >= 1 && v <= MAX_QUANTITY,
      `${label}: количество должно быть целым числом от 1 до ${MAX_QUANTITY}.`);
    if (widthOK && heightOK && !Number.isFinite(w * h)) {
      markInvalid(inputs[1], true); markInvalid(inputs[2], true);
      validationErrors.push(`${label}: размеры слишком велики для расчёта.`);
    }
    const size = blankSize(p);
    if (widthOK && heightOK && (size.w <= 0 || size.h <= 0)) {
      markInvalid(inputs[1], size.w <= 0); markInvalid(inputs[2], size.h <= 0);
      validationErrors.push(`${label}: после вычета кромки размеры заготовки должны быть больше нуля.`);
    }
    if (widthOK && heightOK && quantityOK && size.w > 0 && size.h > 0) { entries.push({ p, w, h, q, size }); total += q; }
  });
  if (total > MAX_PARTS) validationErrors.push(`В проекте допускается не больше ${MAX_PARTS} деталей. Уменьшите количество.`);
  if (validationErrors.length || !entries.length) {
    result = null; cur = 0; renderSummary(); renderMap(); return;
  }
  const items = []; let idx = 1;
  entries.forEach(({ p, w, h, q, size }) => {
    for (let i = 0; i < q; i++) items.push({ id: idx++, name: p.n, w: size.w, h: size.h, finishedW: w, finishedH: h, tex: p.tex, e: size.e });
  });
  const { sheets, failed } = pack(items, W, H, kerf, trim);
  let used = 0; const edge = Object.fromEntries(EDGE_TYPES.map(t => [t.id, 0]));
  sheets.forEach(s => s.placed.forEach(pl => {
    used += pl.w * pl.h;
    // Метраж на покупку считаем по готовой детали; раскрой — по размерам заготовки.
    [[0, pl.it.finishedW], [1, pl.it.finishedH], [2, pl.it.finishedW], [3, pl.it.finishedH]].forEach(([k, len]) => { if (pl.it.e[k]) edge[pl.it.e[k]] += len; });
  }));
  const fill = sheets.length ? used / (sheets.length * W * H) * 100 : 0;
  result = { sheets, failed, fill, edge, res, W, H, T, count: items.length - failed.length };
  if (cur >= sheets.length) cur = Math.max(0, sheets.length - 1);
  renderSummary(); renderMap();
}

// ---------- Сводка сверху ----------
function renderSummary() {
  const r = result;
  $("barFill").style.width = r ? r.fill + "%" : "0";
  $("nSheets").textContent = r ? r.sheets.length : 0;
  $("nFill").textContent = r ? r.fill.toFixed(0) + "%" : "0%";
  $("nWaste").textContent = r && r.sheets.length ? (100 - r.fill).toFixed(0) + "%" : "0%";
  let e = "—";
  if (r && EDGE_TYPES.some(t => r.edge[t.id])) {
    const k = 1 + r.res / 100;
    e = EDGE_TYPES.filter(t => r.edge[t.id]).map(t => `${t.label} мм — ${(r.edge[t.id] * k / 1000).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 3 })} м`).join(" · ");
  }
  $("nEdge").textContent = e;
  $("warn").textContent = validationErrors.length ? validationErrors.join("\n") :
    r && r.failed.length ? "Не помещаются в лист: " + r.failed.map(f => `${f.name || "#" + f.id} ${f.w}×${f.h}`).join(", ") : "";
}

// ---------- Карта выбранного листа ----------
function renderMap() {
  const r = result;
  if (!r || !r.sheets.length) {
    $("sheetTabs").innerHTML = "";
    const message = validationErrors.length ? "Исправьте ошибки в полях выше, чтобы построить карту раскроя." :
      r ? "Ни одна деталь не помещается в лист. Проверьте размеры листа, деталей и направление текстуры." :
      "Добавьте детали выше — здесь появится карта раскроя.";
    $("mapBox").innerHTML = `<div class="empty">${message}</div>`;
    return;
  }
  $("sheetTabs").innerHTML = r.sheets.map((s, i) => `<button class="${i === cur ? "on" : ""}" data-i="${i}">Лист ${i + 1}</button>`).join("");
  $("sheetTabs").querySelectorAll("button").forEach(b => b.onclick = () => { cur = +b.dataset.i; haptic(); renderMap(); });
  const s = r.sheets[cur], W = r.W, H = r.H;
  const fs = Math.round(W / 55), sw = Math.max(4, Math.round(W / 350));        // размер шрифта и толщина кромки в мм-единицах
  const col = Object.fromEntries(EDGE_TYPES.map(t => [t.id, t.color]));
  const su = s.placed.reduce((a, p) => a + p.w * p.h, 0) / (W * H) * 100;
  const rects = s.placed.map(p => {
    // Кромка рисуется цветной линией вдоль нужной стороны: верх, право, низ, лево
    const L = [[p.x, p.y, p.x + p.w, p.y], [p.x + p.w, p.y, p.x + p.w, p.y + p.h], [p.x, p.y + p.h, p.x + p.w, p.y + p.h], [p.x, p.y, p.x, p.y + p.h]];
    const lines = L.map((l, k) => p.e[k] ? `<line x1="${l[0]}" y1="${l[1]}" x2="${l[2]}" y2="${l[3]}" stroke="${col[p.e[k]]}" stroke-width="${sw}"/>` : "").join("");
    const nm = p.it.name ? escapeHTML(p.it.name) : "#" + p.it.id;
    const label = p.w > fs * 4 && p.h > fs * 2.4
      ? `<text x="${p.x + fs * .4}" y="${p.y + fs * 1.2}" font-size="${fs}" fill="var(--ink)">${nm}</text>
         <text x="${p.x + fs * .4}" y="${p.y + fs * 2.4}" font-size="${fs * .9}" fill="var(--mute)">${formatSize(p.w)}×${formatSize(p.h)}</text>` : "";
    const clipId = `label-${p.it.id}`;
    return `<defs><clipPath id="${clipId}"><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}"/></clipPath></defs>
      <rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="var(--part)" stroke="var(--acc)" stroke-width="${sw / 3}"/>${lines}<g clip-path="url(#${clipId})">${label}</g>`;
  }).join("");
  $("mapBox").innerHTML = `
    <div style="font-size:13px;color:var(--mute);margin-bottom:6px">Лист ${cur + 1} из ${r.sheets.length} · ${W}×${H}×${r.T} мм · занято ${su.toFixed(0)}% · деталей ${s.placed.length}</div>
    <svg viewBox="0 0 ${W} ${H}">${rects}</svg>
    <p class="hint">На карте указаны размеры заготовок для распила.</p>
    <div class="leg">${EDGE_TYPES.map(t => `<span><i class="sw" style="background:${t.color}"></i>кромка ${t.label} мм</span>`).join("")}<span><i class="sw" style="background:var(--part)"></i>деталь</span><span><i class="sw" style="background:var(--waste)"></i>отход</span></div>`;
}

renderParts(); calc();
